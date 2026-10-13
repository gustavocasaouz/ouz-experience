import Link from "next/link";
import { Badge, EmptyState, ImagePlaceholder, PageHeader } from "@/design-system";
import { requireViewer } from "@/server/auth/viewer";
import { listMyUnits } from "@/server/queries/client";
import { publicMediaUrl } from "@/server/db/supabase-public";
import { CLIENT_RELATION_LABELS, STAGE_LABELS } from "@/lib/labels";

export const metadata = { title: "Minhas unidades" };

export default async function ClientHome() {
  const viewer = await requireViewer("/cliente");
  const units = await listMyUnits();
  return (
    <>
      <PageHeader eyebrow="Área do cliente" title={`Olá, ${viewer.fullName.split(" ")[0] || "cliente"}`} description="Suas unidades OUZ." />
      {units.length === 0 ? (
        <EmptyState title="Nenhuma unidade vinculada">Fale com a OUZ caso alguma unidade não apareça aqui.</EmptyState>
      ) : (
        <ul className="grid gap-8 md:grid-cols-2">
          {units.map((u) => {
            const img = publicMediaUrl(u.development.cover_image_path);
            return (
              <li key={u.linkId}>
                <Link href={`/cliente/unidades/${u.unit.id}`} className="group block bg-surface border border-line hover:border-ink transition-colors">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <ImagePlaceholder label={u.development.name} className="aspect-[16/9]" />
                  )}
                  <div className="p-6 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="accent">{STAGE_LABELS[u.development.stage]}</Badge>
                      <Badge>{CLIENT_RELATION_LABELS[u.relation] ?? u.relation}</Badge>
                    </div>
                    <p className="eyebrow mt-2">{u.development.name}</p>
                    <h2 className="font-display text-3xl">Unidade {u.unit.code}</h2>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
