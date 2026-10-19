import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { isSupabaseConfigured } from "@/lib/env";

const PRIVATE_BUCKETS = new Set(["broker-content", "broker-documents", "client-documents", "client-media", "proposal-documents", "ticket-attachments"]);

/**
 * Gera URL assinada de curta duração COM A SESSÃO DO USUÁRIO: a política de Storage decide.
 * Se o usuário não tiver acesso, o Supabase recusa e devolvemos 404 (sem revelar existência).
 * Com `?baixar=Nome do arquivo`, o navegador baixa o arquivo (não abre no app) com esse nome.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  if (!isSupabaseConfigured() || !PRIVATE_BUCKETS.has(bucket) || path.some((p) => p === ".." || p === "")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const supabase = await createSupabaseServerClient();
  const download = downloadName(req.nextUrl.searchParams.get("baixar"), path.at(-1) ?? "");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path.join("/"), 60, download ? { download } : undefined);
  if (error || !data?.signedUrl) return new NextResponse("Não encontrado", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Nome seguro para o arquivo baixado, com a extensão do arquivo guardado. */
function downloadName(requested: string | null, stored: string): string | null {
  if (requested === null) return null;
  const ext = stored.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "";
  const base = requested.normalize("NFC").replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120) || "arquivo";
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : base + ext;
}
