import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";

/**
 * Entrada por Face ID no app iOS.
 *
 * O aparelho guarda no Keychain o refresh token de uma sessão própria (a "sessão do aparelho"),
 * separada da sessão dos cookies: assim a renovação dos cookies não invalida o que está no Keychain.
 * Ao desbloquear, a sessão do aparelho é renovada (o Supabase confere se ainda vale: sair, que é
 * global, encerra também essa sessão) e uma sessão nova é criada nos cookies.
 * As duas sessões nascem em aal1: a equipe continua precisando do código em /admin.
 */

/** Cliente sem cookies, só para a sessão do aparelho. */
function deviceClient(): SupabaseClient {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Token de uso único (sem enviar e-mail) para abrir uma sessão nova para o e-mail. */
async function oneTimeTokenHash(email: string) {
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return null;
  return data.properties.hashed_token;
}

/** Abre a sessão do aparelho e devolve o refresh token que vai para o Keychain. */
export async function createDeviceSession(email: string) {
  const tokenHash = await oneTimeTokenHash(email);
  if (!tokenHash) return null;
  const { data, error } = await deviceClient().auth.verifyOtp({ type: "email", token_hash: tokenHash });
  return error || !data.session ? null : data.session.refresh_token;
}

/** Renova a sessão do aparelho. Devolve o e-mail e o novo refresh token, ou null se ela acabou. */
export async function renewDeviceSession(refreshToken: string) {
  const { data, error } = await deviceClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user?.email) return null;
  return { email: data.user.email, refreshToken: data.session.refresh_token };
}

/** Grava nos cookies (pelo cliente do servidor) uma sessão nova para o e-mail. */
export async function signInCookieSession(supabase: SupabaseClient, email: string) {
  const tokenHash = await oneTimeTokenHash(email);
  if (!tokenHash) return false;
  return !(await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash })).error;
}

/** Só aceita JSON da mesma origem (bloqueia formulários e páginas de terceiros). */
export async function isSameOriginJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  const host = (await headers()).get("host");
  return !origin || (host !== null && new URL(origin).host === host);
}
