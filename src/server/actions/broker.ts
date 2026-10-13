"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getViewer } from "@/server/auth/viewer";
import { checkRateLimit } from "@/server/security/rate-limit";
import { enqueueEmail } from "@/server/notifications/outbox";
import { ALLOWED_DOC_TYPES, filesFrom, objectPath, validateUpload } from "@/server/files";
import { publicEnv } from "@/lib/env";
import {
  UFS,
  isPlausiblePhone,
  isValidCnpj,
  isValidCpf,
  isValidCreciFormat,
  normalizeCnpj,
  normalizeCpf,
  normalizeCreci,
  normalizePhone,
} from "@/domain/documentos";
import { dbErrorMessage, formValues, fromZodError, type ActionState } from "./types";

const optional = z.string().trim().max(200).optional().transform((v) => v || undefined);

const brokerSchema = z
  .object({
    full_name: z.string().trim().min(3, "Informe o nome completo.").max(200),
    cpf: z.string().refine(isValidCpf, "CPF inválido (dígitos verificadores não conferem).").transform(normalizeCpf),
    creci_number: z.string().trim().min(1, "Informe o número do CRECI.").transform(normalizeCreci),
    creci_uf: z.enum(UFS, { error: "Selecione a UF do CRECI." }),
    phone: z.string().refine(isPlausiblePhone, "Telefone inválido.").transform(normalizePhone),
    city: z.string().trim().min(2, "Informe a cidade.").max(120),
    region: z.string().trim().min(2, "Informe o estado ou região.").max(120),
    country: z.string().trim().min(2, "Informe o país.").max(80),
    street: optional,
    number: optional,
    complement: optional,
    district: optional,
    postal_code: optional,
    agency_name: optional,
    agency_cnpj: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || isValidCnpj(v), "CNPJ inválido (dígitos verificadores não conferem).")
      .transform((v) => (v ? normalizeCnpj(v) : undefined)),
    accept: z.literal("on", { error: "É preciso aceitar as condições de uso e a política de privacidade." }),
  })
  .refine((d) => isValidCreciFormat(d.creci_number, d.creci_uf), { path: ["creci_number"], message: "Formato de CRECI inválido." });

export async function saveBrokerProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sua sessão expirou. Entre novamente." };
  if (!viewer.emailVerified) return { error: "Confirme seu e-mail antes de enviar o cadastro." };
  const values = formValues(fd);
  delete values.cpf_display;
  const parsed = brokerSchema.safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error, values);
  if (!(await checkRateLimit("broker-save", 10, 3600, viewer.userId))) return { error: "Muitas tentativas. Tente mais tarde.", values };

  const files = filesFrom(fd, "documents");
  if (files.length > 5) return { error: "Envie no máximo 5 arquivos.", values };
  for (const f of files) {
    const err = await validateUpload(f, ALLOWED_DOC_TYPES, 10 * 1024 * 1024);
    if (err) return { error: `${err} (${f.name})`, values };
  }

  const d = parsed.data;
  const address =
    d.street || d.postal_code ? { street: d.street, number: d.number, complement: d.complement, district: d.district, postal_code: d.postal_code } : null;
  const row = {
    user_id: viewer.userId,
    full_name: d.full_name,
    cpf: d.cpf,
    cpf_hash: "calculado-no-banco",
    creci_number: d.creci_number,
    creci_uf: d.creci_uf,
    email: viewer.email,
    phone: d.phone,
    city: d.city,
    region: d.region,
    country: d.country,
    address,
    agency_name: d.agency_name ?? null,
    agency_cnpj: d.agency_cnpj ?? null,
    terms_version: publicEnv.termsVersion,
    privacy_version: publicEnv.privacyVersion,
    terms_accepted_at: new Date().toISOString(),
  };

  const supabase = await createSupabaseServerClient();
  const isNew = !viewer.broker;
  const { error } = isNew
    ? await supabase.from("broker_profiles").insert(row)
    : await supabase.from("broker_profiles").update(row).eq("user_id", viewer.userId);
  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um cadastro com este CPF ou CRECI. Se for seu, fale com a OUZ.", values };
    }
    return { error: dbErrorMessage(error, "Não foi possível salvar o cadastro."), values };
  }

  for (const f of files) {
    const path = objectPath(viewer.userId, f);
    const up = await supabase.storage.from("broker-documents").upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) return { error: "Cadastro salvo, mas houve falha no envio de um documento. Tente reenviar.", values };
    await supabase.from("broker_documents").insert({
      broker_user_id: viewer.userId,
      label: (values.document_label || "Documento").slice(0, 80),
      storage_path: path,
      mime_type: f.type,
      size_bytes: f.size,
    });
  }

  await supabase.from("consents").insert([
    { user_id: viewer.userId, purpose: "cadastro_corretor", document_version: publicEnv.termsVersion },
    { user_id: viewer.userId, purpose: "privacidade", document_version: publicEnv.privacyVersion },
  ]);

  if (isNew) {
    await enqueueEmail({ dedupeKey: `email:corretor_cadastro:${viewer.userId}`, template: "corretor_cadastro_recebido", recipientUserId: viewer.userId });
  }
  revalidatePath("/corretor");
  redirect("/corretor?salvo=1");
}

export async function resubmitBrokerProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("broker_resubmit");
  revalidatePath("/corretor");
  redirect("/corretor?reenviado=1");
}
