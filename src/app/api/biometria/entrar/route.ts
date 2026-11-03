import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { checkRateLimit } from "@/server/security/rate-limit";
import { isSameOriginJson, renewDeviceSession, signInCookieSession } from "@/server/auth/biometric";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().min(1).max(512) });

/**
 * App iOS, depois do Face ID: troca o token do Keychain por uma sessão nos cookies.
 * Devolve o token novo (o Supabase gira o refresh token a cada uso) para o app guardar de volta.
 * 401 quando a sessão do aparelho acabou (saiu, conta bloqueada…): o app apaga o token.
 */
export async function POST(request: Request) {
  if (!(await isSameOriginJson(request))) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  if (!(await checkRateLimit("biometric-login", 20, 900))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const device = await renewDeviceSession(parsed.data.token);
  if (!device) return NextResponse.json({ error: "O acesso por Face ID expirou. Entre com a senha." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  if (!(await signInCookieSession(supabase, device.email))) {
    return NextResponse.json({ error: "Não foi possível entrar agora. Tente com a senha.", token: device.refreshToken }, { status: 502 });
  }
  return NextResponse.json({ token: device.refreshToken }, { headers: { "Cache-Control": "no-store" } });
}
