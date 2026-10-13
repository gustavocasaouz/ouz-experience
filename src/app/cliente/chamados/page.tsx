import Link from "next/link";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Chamados" };

export default async function ClientTickets() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tickets")
    .select("id, number, category, title, status, updated_at, unit:units(code, development:developments(name))")
    .order("updated_at", { ascending: false });
  return (
    <>
      <PageHeader eyebrow="Área do cliente" title="Chamados" actions={<ButtonLink href="/cliente/chamados/novo">Abrir chamado</ButtonLink>} />
      {!data?.length ? (
        <EmptyState title="Nenhum chamado">Assistência técnica, dúvidas administrativas, solicitações sobre a unidade e pós-entrega.</EmptyState>
      ) : (
        <Table head={["Nº", "Assunto", "Unidade", "Categoria", "Situação", "Atualizado"]} caption="Meus chamados">
          {data.map((t) => {
            const unit = t.unit as unknown as { code: string; development: { name: string } };
            return (
              <tr key={t.id}>
                <Td>#{t.number}</Td>
                <Td><Link href={`/cliente/chamados/${t.id}`} className="font-medium hover:underline underline-offset-4">{t.title}</Link></Td>
                <Td>{unit.development.name} · {unit.code}</Td>
                <Td>{TICKET_CATEGORY_LABELS[t.category]}</Td>
                <Td><Badge tone={t.status === "aguardando_cliente" ? "warning" : ["resolvido", "encerrado"].includes(t.status) ? "success" : "info"}>{TICKET_STATUS_LABELS[t.status]}</Badge></Td>
                <Td className="text-sm whitespace-nowrap">{formatDateTime(t.updated_at)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
