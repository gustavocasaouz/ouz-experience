import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { safeNext } from "@/lib/safe-next";

/**
 * Destino dos links de e-mail do Supabase (confirmação, recuperação, troca de e-mail).
 * Aceita token_hash (recomendado: funciona em outro dispositivo) e code (PKCE).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  const target = new URL(ok ? (type === "recovery" ? "/entrar/redefinir" : next) : "/entrar?erro=link", url.origin);
  return NextResponse.redirect(target);
}
