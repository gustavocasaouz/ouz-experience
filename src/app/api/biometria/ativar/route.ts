import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { checkRateLimit } from "@/server/security/rate-limit";
import { createDeviceSession, isSameOriginJson } from "@/server/auth/biometric";

export const dynamic = "force-dynamic";

/** App iOS: quem já entrou recebe o token da sessão do aparelho para guardar no Keychain (Face ID). */
export async function POST(request: Request) {
  if (!(await isSameOriginJson(request))) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!(await checkRateLimit("biometric-enable", 10, 3600, user.id))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }
  const token = await createDeviceSession(user.email);
  if (!token) return NextResponse.json({ error: "Não foi possível ativar agora. Tente novamente." }, { status: 502 });
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
