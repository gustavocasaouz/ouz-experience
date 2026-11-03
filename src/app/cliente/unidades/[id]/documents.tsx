import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { formatDateTime } from "@/lib/format";

export type UnitDocument = {
  id: string; category: string; discipline: string | null; title: string; description: string | null; unit_id: string | null; updated_at: string;
  versions: Array<{ id: string; version_number: number; storage_path: string; uploaded_at: string; notes: string | null }>;
};

/** Documentos publicados da unidade e do empreendimento (com ao menos uma versão). O RLS confere o acesso. */
export async function unitDocuments(unitId: string, developmentId: string, categories?: string[]) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("documents")
    .select("id, category, discipline, title, description, unit_id, updated_at, versions:document_versions(id, version_number, storage_path, uploaded_at, notes)")
    .or(`unit_id.eq.${unitId},development_id.eq.${developmentId}`)
    .order("updated_at", { ascending: false });
  if (categories) q = q.in("category", categories);
  const { data } = await q;
  return ((data ?? []) as UnitDocument[])
    .filter((d) => d.versions.length > 0)
    .map((d) => ({ ...d, versions: d.versions.sort((a, b) => b.version_number - a.version_number) }));
}

/** Lista de arquivos com a versão atual para baixar e as anteriores recolhidas. */
export function DocumentRows({ docs }: { docs: UnitDocument[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {docs.map((d) => {
        const [latest, ...older] = d.versions;
        return (
          <li key={d.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">
                {d.title} <span className="text-xs text-ink-mute">· {d.unit_id ? "da sua unidade" : "do empreendimento"}</span>
              </p>
              {d.description && <p className="text-sm text-ink-soft">{d.description}</p>}
              <p className="text-xs text-ink-mute">Versão {latest!.version_number} · {formatDateTime(latest!.uploaded_at)}{latest!.notes ? ` · ${latest!.notes}` : ""}</p>
              {older.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-ink-mute">Versões anteriores</summary>
                  <ul className="mt-1 space-y-1">
                    {older.map((v) => (
                      <li key={v.id}>
                        <a className="underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${v.storage_path}`}>Versão {v.version_number}</a> · {formatDateTime(v.uploaded_at)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <a className="text-sm underline underline-offset-4 shrink-0" target="_blank" rel="noopener" href={`/arquivos/client-documents/${latest!.storage_path}`}>Baixar</a>
          </li>
        );
      })}
    </ul>
  );
}
