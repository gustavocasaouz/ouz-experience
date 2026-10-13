import { EmptyState, PageHeader, Table, Td } from "@/design-system";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import type { SP } from "@/components/admin/flash";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["auditoria"], "/admin/auditoria");
  if (denied) return denied;
  const sp = await searchParams;
  const entity = typeof sp.entidade === "string" ? sp.entidade : "";
  const page = Math.max(0, Number(sp.pagina ?? 0) || 0);
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("audit_log")
    .select("id, occurred_at, actor_user_id, action, entity_type, entity_id, reason, metadata")
    .order("occurred_at", { ascending: false })
    .range(page * 100, page * 100 + 99);
  if (entity) q = q.eq("entity_type", entity);
  const { data } = await q;
  const actorIds = [...new Set((data ?? []).map((a) => a.actor_user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const name = new Map((actors ?? []).map((a) => [a.id, a.full_name || a.email]));

  return (
    <>
      <PageHeader eyebrow="Administração" title="Auditoria" description="Registro imutável. Não contém CPF completo, documentos ou tokens." />
      <form className="mb-6 flex gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="entidade" className="text-xs text-ink-mute">Entidade</label>
          <input id="entidade" name="entidade" defaultValue={entity} placeholder="ex.: broker_profiles" className="border border-line bg-surface px-3 py-2 text-sm" />
        </div>
        <button className="text-sm underline underline-offset-4 pb-2">Filtrar</button>
      </form>
      {!data?.length ? (
        <EmptyState title="Nenhum registro" />
      ) : (
        <Table head={["Quando", "Quem", "Ação", "Entidade", "Detalhes"]} caption="Registros de auditoria">
          {data.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap">{formatDateTime(a.occurred_at)}</Td>
              <Td>{a.actor_user_id ? name.get(a.actor_user_id) ?? "Usuário" : "Sistema"}</Td>
              <Td>{a.action}</Td>
              <Td className="text-xs">{a.entity_type}<span className="block text-ink-mute break-all">{a.entity_id}</span></Td>
              <Td className="text-xs text-ink-soft max-w-sm">
                {a.reason && <p>Motivo: {a.reason}</p>}
                {a.metadata && Object.keys(a.metadata).length > 0 && <code className="break-all">{JSON.stringify(a.metadata)}</code>}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <div className="flex gap-4 mt-6 text-sm">
        {page > 0 && <a className="underline" href={`?entidade=${entity}&pagina=${page - 1}`}>Anteriores</a>}
        {(data?.length ?? 0) === 100 && <a className="underline" href={`?entidade=${entity}&pagina=${page + 1}`}>Mais antigos</a>}
      </div>
    </>
  );
}
