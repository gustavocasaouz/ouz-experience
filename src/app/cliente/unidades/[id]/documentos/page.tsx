import { notFound } from "next/navigation";
import { EmptyState, SectionTitle } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

type Doc = {
  id: string; category: string; title: string; description: string | null; unit_id: string | null; updated_at: string;
  versions: Array<{ id: string; version_number: number; storage_path: string; uploaded_at: string; notes: string | null }>;
};

export default async function ClientDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("documents")
    .select("id, category, title, description, unit_id, updated_at, versions:document_versions(id, version_number, storage_path, uploaded_at, notes)")
    .or(`unit_id.eq.${id},development_id.eq.${u.development.id}`)
    .order("updated_at", { ascending: false });
  const docs = ((data ?? []) as Doc[]).filter((d) => d.versions.length > 0);
  const byCat = Object.keys(DOCUMENT_CATEGORY_LABELS).map((c) => ({ c, items: docs.filter((d) => d.category === c) })).filter((g) => g.items.length);

  return docs.length === 0 ? (
    <EmptyState title="Nenhum documento disponível">Contratos, aditivos, manuais e documentos da unidade aparecem aqui quando a OUZ os publicar.</EmptyState>
  ) : (
    <div className="flex flex-col gap-12">
      <p className="text-sm text-ink-soft">Arquivos privados. Os links de download expiram em poucos minutos.</p>
      {byCat.map((g) => (
        <section key={g.c}>
          <SectionTitle title={DOCUMENT_CATEGORY_LABELS[g.c] ?? g.c} />
          <ul className="divide-y divide-line border-y border-line">
            {g.items.map((d) => {
              const versions = d.versions.sort((a, b) => b.version_number - a.version_number);
              const latest = versions[0]!;
              return (
                <li key={d.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{d.title} {!d.unit_id && <span className="text-xs text-ink-mute">· do empreendimento</span>}</p>
                    {d.description && <p className="text-sm text-ink-soft">{d.description}</p>}
                    <p className="text-xs text-ink-mute">Versão {latest.version_number} · {formatDateTime(latest.uploaded_at)}{latest.notes ? ` · ${latest.notes}` : ""}</p>
                    {versions.length > 1 && (
                      <details className="text-xs mt-1">
                        <summary className="cursor-pointer text-ink-mute">Versões anteriores</summary>
                        <ul className="mt-1 space-y-1">
                          {versions.slice(1).map((v) => (
                            <li key={v.id}>
                              <a className="underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${v.storage_path}`}>Versão {v.version_number}</a> · {formatDateTime(v.uploaded_at)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <a className="text-sm underline underline-offset-4 shrink-0" target="_blank" rel="noopener" href={`/arquivos/client-documents/${latest.storage_path}`}>Baixar</a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
