"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";
import { checkRateLimit, clientIpHash } from "@/server/security/rate-limit";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { formValues, fromZodError, type ActionState } from "./types";

const email = z.email("E-mail inválido.").max(254).transform((v) => v.trim().toLowerCase());
const password = z
  .string()
  .min(10, "Use ao menos 10 caracteres.")
  .max(72, "Use no máximo 72 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Combine letras e números.");

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = z.object({ email, password: z.string().min(1, "Informe a senha.") }).safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error, { email: values.email ?? "" });

  // Limite por e-mail + IP (quem erra a senha de outra pessoa não bloqueia o dono da conta) e um teto alto só por e-mail.
  const ip = await clientIpHash();
  if (
    !(await checkRateLimit("login-ip", 20, 900)) ||
    !(await checkRateLimit("login-email-ip", 8, 900, `${parsed.data.email}:${ip}`)) ||
    !(await checkRateLimit("login-email", 50, 3600, parsed.data.email))
  ) {
    return { error: "Muitas tentativas. Aguarde alguns minutos.", values: { email: parsed.data.email } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const msg = error.code === "email_not_confirmed" ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : "E-mail ou senha incorretos.";
    return { error: msg, values: { email: parsed.data.email } };
  }
  redirect(safeNext(values.next));
}

export async function signUp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = z
    .object({
      full_name: z.string().trim().min(3, "Informe seu nome completo.").max(200),
      email,
      password,
      password_confirm: z.string(),
      terms: z.literal("on", { error: "É preciso aceitar os termos de uso e a política de privacidade." }),
    })
    .refine((d) => d.password === d.password_confirm, { path: ["password_confirm"], message: "As senhas não conferem." })
    .safeParse(values);
  const keep = { full_name: values.full_name ?? "", email: values.email ?? "" };
  if (!parsed.success) return fromZodError(parsed.error, keep);

  if (!(await checkRateLimit("signup", 5, 3600))) return { error: "Muitas tentativas. Tente mais tarde.", values: keep };

  const next = safeNext(values.next, "/conta");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { full_name: parsed.data.full_name },
    },
  });
  if (error && error.code === "weak_password") return { error: "Senha fraca. Escolha outra.", fieldErrors: { password: ["Senha fraca."] }, values: keep };
  if (error && error.code !== "user_already_exists") return { error: "Não foi possível criar a conta agora.", values: keep };

  // Consentimentos versionados. Se o e-mail já existia, o Supabase devolve um usuário fictício e a inserção é ignorada.
  if (data?.user?.id) {
    await createSupabaseAdminClient()
      .from("consents")
      .insert([
        { user_id: data.user.id, purpose: "termos_uso", document_version: publicEnv.termsVersion },
        { user_id: data.user.id, purpose: "privacidade", document_version: publicEnv.privacyVersion },
      ]);
  }
  // Mesma resposta para e-mail novo ou existente (evita enumeração de contas).
  return { ok: true, message: `Enviamos um link de confirmação para ${parsed.data.email}. Abra-o para ativar sua conta.` };
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = z.object({ email }).safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error, values);
  if (await checkRateLimit("reset", 5, 3600)) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/entrar/redefinir`,
    });
  }
  return { ok: true, message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha." };
}

export async function updatePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = z
    .object({ password, password_confirm: z.string() })
    .refine((d) => d.password === d.password_confirm, { path: ["password_confirm"], message: "As senhas não conferem." })
    .safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "reauthentication_needed" || error.code === "insufficient_aal"
          ? "Por segurança, confirme a verificação em duas etapas e tente de novo."
          : "Link expirado ou senha inválida. Solicite um novo link.",
    };
  }
  return { ok: true, message: "Senha atualizada." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------------------------------------------------------------------------
// MFA (TOTP) — obrigatório para operadores e administradores
// ---------------------------------------------------------------------------

export async function startTotpEnrollment(): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `OUZ ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "Não foi possível iniciar a configuração. Tente novamente." };
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

export async function verifyTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = z
    .object({ factorId: z.string().min(1), code: z.string().trim().regex(/^\d{6}$/, "Informe os 6 dígitos.") })
    .safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { error: "Sessão expirada. Entre novamente." };
  if (!(await checkRateLimit("mfa", 10, 900, claims.claims.sub))) return { error: "Muitas tentativas. Aguarde alguns minutos." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { error: "Código inválido ou expirado.", fieldErrors: { code: ["Código inválido."] } };
  redirect(safeNext(values.next, "/admin"));
}
