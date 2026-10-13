"use server";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";
import { checkRateLimit } from "@/server/security/rate-limit";
import { publicEnv } from "@/lib/env";
import { isPlausiblePhone, normalizePhone } from "@/domain/documentos";
import { formValues, fromZodError, type ActionState } from "./types";

const schema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome.").max(200),
  email: z.email("E-mail inválido.").max(254).transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isPlausiblePhone(v), "Telefone inválido."),
  development_slug: z.string().optional(),
  message: z.string().trim().max(2000).optional(),
  is_broker: z.literal("on").optional(),
  marketing_opt_in: z.literal("on").optional(),
  privacy: z.literal("on", { error: "É preciso aceitar a política de privacidade." }),
  website: z.string().max(0).optional(), // honeypot
});

export async function submitLead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error, values);
  if (parsed.data.website) return { ok: true, message: "Recebemos seu contato." };

  if (!(await checkRateLimit("lead", 5, 3600))) {
    return { error: "Muitas tentativas. Tente novamente mais tarde.", values };
  }

  const admin = createSupabaseAdminClient();
  let developmentId: string | null = null;
  if (parsed.data.development_slug) {
    const { data } = await admin
      .from("developments")
      .select("id")
      .eq("slug", parsed.data.development_slug)
      .eq("is_published", true)
      .maybeSingle();
    developmentId = data?.id ?? null;
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
      development_id: developmentId,
      message: parsed.data.message || null,
      is_broker: parsed.data.is_broker === "on",
      marketing_opt_in: parsed.data.marketing_opt_in === "on",
      privacy_version: publicEnv.privacyVersion,
    })
    .select("id")
    .single();
  if (error || !lead) return { error: "Não foi possível enviar agora. Tente novamente.", values };

  const consents = [{ lead_id: lead.id, purpose: "privacidade", document_version: publicEnv.privacyVersion }];
  if (parsed.data.marketing_opt_in === "on") {
    consents.push({ lead_id: lead.id, purpose: "comunicacoes_marketing", document_version: publicEnv.privacyVersion });
  }
  await admin.from("consents").insert(consents);

  return { ok: true, message: "Recebemos seu contato. A equipe da OUZ retornará em breve." };
}
