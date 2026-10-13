"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { checkRateLimit } from "@/server/security/rate-limit";
import { dbErrorMessage, type ActionState } from "./types";

const schema = z.object({ kind: z.enum(["equipe", "cliente"]), token: z.string().regex(/^[a-f0-9]{64}$/) });

export async function acceptInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ kind: fd.get("kind"), token: fd.get("token") });
  if (!parsed.success) return { error: "Convite inválido." };
  if (!(await checkRateLimit("invite-accept", 10, 900))) return { error: "Muitas tentativas. Aguarde alguns minutos." };

  const supabase = await createSupabaseServerClient();
  const fn = parsed.data.kind === "equipe" ? "accept_staff_invitation" : "accept_client_invitation";
  const { error } = await supabase.rpc(fn, { p_token: parsed.data.token });
  if (error) {
    const msg =
      error.code === "42501" && /e-mail/.test(error.message)
        ? error.message.includes("verificado")
          ? "Confirme seu e-mail antes de aceitar o convite."
          : "Este convite foi enviado para outro e-mail. Entre com a conta do e-mail convidado."
        : dbErrorMessage(error, "Convite inválido ou expirado.");
    return { error: msg };
  }
  redirect(parsed.data.kind === "equipe" ? "/entrar/mfa?next=/admin" : "/cliente");
}
