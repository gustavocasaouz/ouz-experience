import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DataList, PageHeader, SectionTitle, Table, Td, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { EvaluationView, type Evaluation } from "@/components/commercial/evaluation-view";
import { PaymentsList } from "@/components/commercial/payments-list";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { decideProposal, setQueuePriority } from "@/server/actions/admin/commercial";
import { ANALYSIS_REASON_LABELS, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE, RESERVATION_STATUS_LABELS } from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";
import { formatCnpj, formatCpf } from "@/domain/documentos";

export default async function AdminProposal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/propostas");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase
    .from("proposals")
    .select("*, broker:broker_profiles(full_name, email, creci_number, creci_uf), unit:units(id, code, status), development:developments(name), reservation:reservations(id, status, expires_at)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const unit = p.unit as { id: string; code: string; status: string };
  const [{ data: events }, { data: queue }] = await Promise.all([
    supabase.from("proposal_events").select("occurred_at, to_status, note, visible_to_broker").eq("proposal_id", id).order("occurred_at", { ascending: false }),
    supabase.rpc("admin_unit_queue", { p_unit_id: unit.id }),
  ]);
  const broker = p.broker as { full_name: string; email: string; creci_number: string; creci_uf: string };
  const reservation = (p.reservation as Array<{ id: string; status: string; expires_at: string }>)[0];
  const doc = p.client_document ? (p.client_document_type === "cnpj" ? formatCnpj(p.client_document) : formatCpf(p.client_document)) : "—";

  return (
    <>
      <PageHeader
        eyebrow={`${(p.development as { name: string }).name} · unidade ${unit.code}`}
        title={`Proposta de ${p.client_name ?? "—"}`}
        description={<Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>}
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-12">
          <DataList
            items={[
              { label: "Corretor", value: `${broker.full_name} · CRECI ${broker.creci_number}/${broker.creci_uf}` },
              { label: "Cliente", value: `${p.client_name} · ${doc}` },
              { label: "Valor ofertado", value: formatBRL(p.offered_price) },
              { label: "Tabela no envio", value: formatBRL(p.table_price) },
              { label: "Enviada em", value: formatDateTime(p.submitted_at) },
              { label: "Motivos de análise", value: (p.analysis_reasons as string[])?.map((r) => ANALYSIS_REASON_LABELS[r] ?? r).join(", ") || "—" },
              ...(reservation ? [{ label: "Reserva", value: <Link className="underline" href={`/admin/reservas/${reservation.id}`}>{RESERVATION_STATUS_LABELS[reservation.status]}</Link> }] : []),
              ...(p.decision_reason ? [{ label: "Decisão", value: p.decision_reason }] : []),
            ]}
          />
          <div>
            <p className="eyebrow mb-2">Condições</p>
            <PaymentsList payments={p.payments} />
            {p.observations && <p className="text-sm text-ink-soft mt-4 whitespace-pre-line">Observações: {p.observations}</p>}
          </div>
          {p.evaluation && <EvaluationView evaluation={p.evaluation as Evaluation} title="Avaliação registrada no envio" />}
          <section>
            <SectionTitle title={`Fila da unidade ${unit.code}`} />
            {!(queue as unknown[] | null)?.length ? (
              <p className="text-sm text-ink-mute">Sem propostas na fila.</p>
            ) : (
              <Table head={["Posição", "Corretor", "Cliente", "Valor", "Entrada na fila", "Prioridade"]} caption="Fila da unidade">
                {(queue as Array<{ proposal_id: string; broker_name: string; client_name: string; offered_price: string; queue_entered_at: string; queue_priority: number; queue_position: number }>).map((q) => (
                  <tr key={q.proposal_id} className={q.proposal_id === id ? "bg-sand/60" : ""}>
                    <Td>{q.queue_position}º</Td>
                    <Td><Link className="hover:underline" href={`/admin/propostas/${q.proposal_id}`}>{q.broker_name}</Link></Td>
                    <Td>{q.client_name}</Td>
                    <Td>{formatBRL(q.offered_price)}</Td>
                    <Td className="text-sm">{formatDateTime(q.queue_entered_at)}</Td>
                    <Td>{q.queue_priority}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
          <section>
            <SectionTitle title="Histórico" />
            <ol className="border-l border-line pl-5 flex flex-col gap-3">
              {(events ?? []).map((e, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-ink-mute">{formatDateTime(e.occurred_at)}{!e.visible_to_broker && " · interno"}</p>
                  <p>{e.note ?? (e.to_status ? PROPOSAL_STATUS_LABELS[e.to_status] : "")}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {p.status === "em_analise" && (
            <Card className="p-6 flex flex-col gap-4">
              <h2 className="font-display text-xl">Decisão comercial</h2>
              <form action={decideProposal} className="flex flex-col gap-3">
                <input type="hidden" name="proposal_id" value={id} />
                <TextArea label="Justificativa" name="reason" rows={3} hint="Obrigatória para reprovar. Visível ao corretor." />
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="aprovar">Aprovar</SubmitButton>
                  <SubmitButton name="decision" value="reprovar" variant="danger">Reprovar</SubmitButton>
                </div>
                <p className="text-xs text-ink-mute">Ao aprovar, a proposta recebe a reserva se a unidade estiver livre e sem fila; senão, entra na fila agora.</p>
              </form>
            </Card>
          )}
          {p.status === "na_fila" && (
            <Card className="p-6">
              <h2 className="font-display text-xl mb-4">Prioridade manual</h2>
              <form action={setQueuePriority} className="flex flex-col gap-3">
                <input type="hidden" name="proposal_id" value={id} />
                <TextField label="Prioridade (maior passa à frente)" name="priority" type="number" defaultValue={String(p.queue_priority)} required />
                <TextArea label="Justificativa" name="reason" rows={2} required minLength={5} />
                <SubmitButton variant="secondary" className="self-start">Alterar prioridade</SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
