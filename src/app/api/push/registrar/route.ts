import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";
import { isSameOriginJson } from "@/server/auth/biometric";
import { PUSH_COOKIE } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().regex(/^[0-9a-f]{64,200}$/), environment: z.enum(["production", "sandbox"]) });

/**
 * App iOS: liga o aparelho (token do APNs) a quem está logado. Se o aparelho era de outra conta, passa para esta.
 * O token também fica num cookie para "Sair" desligar os avisos deste aparelho.
 */
export async function POST(request: Request) {
  if (!(await isSameOriginJson(request))) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const user = (await (await createSupabaseServerClient()).auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { error } = await createSupabaseAdminClient()
    .from("push_devices")
    .upsert({ token: parsed.data.token, user_id: user.id, environment: parsed.data.environment }, { onConflict: "token" });
  if (error) return NextResponse.json({ error: "Não foi possível ativar os avisos agora." }, { status: 502 });

  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(PUSH_COOKIE, parsed.data.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return res;
}
