import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { CUSTOMIZATION_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Personalizações" };

export default async function AdminCustomizations() {
  const { denied } = await staffWith(["atendimento"], "/admin/personalizacoes");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customization_requests")
    .select("id, title, status, created_at, unit:units(id, code, development:developments(name))")
    .not("status", "in", "(concluida,cancelada,recusada)")
    .order("created_at");
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Personalizações em andamento" />
      {!data?.length ? <EmptyState title="Nenhuma solicitação em andamento" /> : (
        <Table head={["Solicitação", "Unidade", "Situação", "Recebida"]} caption="Personalizações">
          {data.map((r) => {
            const u = r.unit as unknown as { id: string; code: string; development: { name: string } };
            return (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/unidades/${u.id}#personalizacao`}>{r.title}</Link></Td>
                <Td>{u.development.name} · {u.code}</Td>
                <Td><Badge>{CUSTOMIZATION_STATUS_LABELS[r.status]}</Badge></Td>
                <Td className="text-sm">{formatDateTime(r.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
