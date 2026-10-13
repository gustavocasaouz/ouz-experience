import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { isSupabaseConfigured } from "@/lib/env";

const PRIVATE_BUCKETS = new Set(["broker-content", "broker-documents", "client-documents", "proposal-documents", "ticket-attachments"]);

/**
 * Gera URL assinada de curta duração COM A SESSÃO DO USUÁRIO: a política de Storage decide.
 * Se o usuário não tiver acesso, o Supabase recusa e devolvemos 404 (sem revelar existência).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  if (!isSupabaseConfigured() || !PRIVATE_BUCKETS.has(bucket) || path.some((p) => p === ".." || p === "")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path.join("/"), 60);
  if (error || !data?.signedUrl) return new NextResponse("Não encontrado", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
