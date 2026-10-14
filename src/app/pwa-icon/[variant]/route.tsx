import { brandIcon } from "@/lib/brand-icon";

export const dynamic = "force-static";
const VARIANTS: Record<string, { size: number; padding: number }> = {
  "192": { size: 192, padding: 0.2 },
  "512": { size: 512, padding: 0.2 },
  maskable: { size: 512, padding: 0.3 }, // área segura para ícones recortados (Android)
};

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ variant: string }> }) {
  const v = VARIANTS[(await ctx.params).variant];
  if (!v) return new Response("Não encontrado", { status: 404 });
  const res = brandIcon(v.size, { padding: v.padding });
  res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return res;
}
