import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { listMyProposals } from "@/server/queries/commercial";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE, RESERVATION_STATUS_LABELS } from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";

export const metadata = { title: "Minhas propostas" };

export default async function MyProposals() {
  const proposals = await listMyProposals();
  return (
    <>
      <PageHeader eyebrow="Corretor" title="Minhas propostas" description="Você vê apenas as suas propostas e o status de cada uma." />
      {proposals.length === 0 ? (
        <EmptyState title="Nenhuma proposta ainda">Escolha uma unidade em um empreendimento liberado para começar.</EmptyState>
      ) : (
        <Table head={["Unidade", "Cliente", "Valor", "Status", "Prazo", "Atualização"]} caption="Minhas propostas">
          {proposals.map((p) => {
            const res = p.reservation;
            return (
              <tr key={p.id}>
                <Td>
                  <Link href={`/corretor/propostas/${p.id}`} className="font-medium hover:underline underline-offset-4">
                    {p.unit?.development.name} · {p.unit?.code}
                  </Link>
                </Td>
                <Td>{p.client_name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{formatBRL(p.offered_price)}</Td>
                <Td>
                  <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                  {res && p.status === "reservada" && <span className="block text-xs text-ink-mute mt-1">{RESERVATION_STATUS_LABELS[res.status]}</span>}
                </Td>
                <Td className="whitespace-nowrap text-sm">
                  {res?.status === "aguardando_documentos" ? formatDateTime(res.expires_at) : res?.status === "pendencias_documentacao" ? formatDateTime(res.regularization_deadline) : "—"}
                </Td>
                <Td className="whitespace-nowrap text-sm text-ink-mute">{formatDateTime(p.submitted_at ?? p.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
