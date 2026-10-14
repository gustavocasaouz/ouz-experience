import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, DataList, FormMessage, PageHeader, SectionTitle, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { Countdown } from "@/components/commercial/countdown";
import { PaymentsList } from "@/components/commercial/payments-list";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import {
  removeReservationFile,
  reviseProposal,
  submitReservationDocuments,
  updateObservations,
  uploadReservationFile,
  withdrawProposal,
} from "@/server/actions/proposals";
import {
  ITEM_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONE,
  RESERVATION_STATUS_LABELS,
} from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";
import { maskDocument } from "@/domain/documentos";

const OPEN_FOR_UPLOAD = ["aguardando_documentos", "pendencias_documentacao"];

export default async function BrokerProposal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireViewer("/corretor/propostas");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase
    .from("proposals")
    .select("id, status, client_name, client_document, offered_price, table_price, payments, observations, submitted_at, decision_reason, unit:units(code), development:developments(name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: events }, { data: reservation }] = await Promise.all([
    supabase.from("proposal_events").select("occurred_at, to_status, note").eq("proposal_id", id).order("occurred_at", { ascending: false }),
    supabase
      .from("reservations")
      .select("id, status, starts_at, expires_at, docs_submitted_at, regularization_deadline, ended_at, end_reason, items:reservation_items(id, label, description, required, status, rejection_reason, sort_order, files:reservation_files(id, storage_path, uploaded_at, removed_at))")
      .eq("proposal_id", id)
      .maybeSingle(),
  ]);
  const unitCode = (p.unit as unknown as { code: string }).code;
  const dev = p.development as unknown as { name: string; slug: string };
  const items = ((reservation?.items ?? []) as Array<{
    id: string; label: string; description: string | null; required: boolean; status: string; rejection_reason: string | null; sort_order: number;
    files: Array<{ id: string; storage_path: string; uploaded_at: string; removed_at: string | null }>;
  }>).sort((a, b) => a.sort_order - b.sort_order);
  const uploadOpen = reservation && OPEN_FOR_UPLOAD.includes(reservation.status) && new Date(reservation.status === "aguardando_documentos" ? reservation.expires_at : reservation.regularization_deadline ?? reservation.expires_at) > new Date();
  const missing = items.filter((i) => i.required && !["enviado", "aprovado"].includes(i.status)).length;

  return (
    <>
      <PageHeader
        eyebrow={`${dev.name} · unidade ${unitCode}`}
        title="Proposta"
        description={<Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>}
        actions={p.status === "rascunho" ? <ButtonLink href={`/corretor/propostas/${id}/editar`}>Editar e enviar</ButtonLink> : undefined}
      />
      <Flash searchParams={searchParams} />
      {sp.enviada && <div className="mb-6"><FormMessage state={{ message: p.status === "reservada" ? "Proposta aprovada automaticamente: reserva criada. Envie a documentação no prazo." : p.status === "na_fila" ? "Proposta apta: entrou na fila da unidade. O prazo de 48 horas só começa quando ela receber a reserva." : "Proposta enviada para análise da OUZ." }} /></div>}

      <div className="grid gap-10 xl:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-12">
          {reservation && (
            <section>
              <SectionTitle title="Reserva e documentação" />
              <Card className="p-6 flex flex-col gap-6">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <p className="eyebrow mb-1">Situação</p>
                    <Badge tone={["expirada", "cancelada"].includes(reservation.status) ? "danger" : reservation.status === "documentacao_validada" ? "success" : "warning"}>
                      {RESERVATION_STATUS_LABELS[reservation.status]}
                    </Badge>
                    {reservation.end_reason && <p className="text-sm text-ink-soft mt-2">{reservation.end_reason}</p>}
                  </div>
                  {reservation.status === "aguardando_documentos" && <Countdown deadline={reservation.expires_at} label="Enviar documentação completa até" />}
                  {reservation.status === "pendencias_documentacao" && reservation.regularization_deadline && (
                    <Countdown deadline={reservation.regularization_deadline} label="Regularizar até" />
                  )}
                  {["documentacao_enviada", "aguardando_conferencia"].includes(reservation.status) && (
                    <p className="text-sm text-ink-soft max-w-xs">Documentação enviada em {formatDateTime(reservation.docs_submitted_at)}. A reserva não expira enquanto a OUZ confere.</p>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-ink-mute">A OUZ ainda não configurou o checklist deste empreendimento. Aguarde orientação da equipe.</p>
                ) : (
                  <ul className="divide-y divide-line border-y border-line">
                    {items.map((it) => {
                      const files = it.files.filter((f) => !f.removed_at);
                      return (
                        <li key={it.id} className="py-4 flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{it.label}</span>
                            {!it.required && <span className="text-xs text-ink-mute">(opcional)</span>}
                            <Badge tone={it.status === "aprovado" ? "success" : it.status === "recusado" ? "danger" : it.status === "enviado" ? "info" : "neutral"}>
                              {ITEM_STATUS_LABELS[it.status]}
                            </Badge>
                          </div>
                          {it.rejection_reason && <p className="text-sm text-danger">Motivo da recusa: {it.rejection_reason}</p>}
                          {files.map((f) => (
                            <div key={f.id} className="flex items-center gap-3 text-sm">
                              <a className="underline underline-offset-4" target="_blank" rel="noopener" href={`/arquivos/proposal-documents/${f.storage_path}`}>Arquivo de {formatDateTime(f.uploaded_at)}</a>
                              {uploadOpen && it.status !== "aprovado" && (
                                <form action={removeReservationFile}>
                                  <input type="hidden" name="proposal_id" value={id} />
                                  <input type="hidden" name="file_id" value={f.id} />
                                  <button className="text-xs text-ink-mute underline">remover</button>
                                </form>
                              )}
                            </div>
                          ))}
                          {uploadOpen && it.status !== "aprovado" && (
                            <form action={uploadReservationFile} className="flex flex-wrap items-center gap-3">
                              <input type="hidden" name="proposal_id" value={id} />
                              <input type="hidden" name="reservation_id" value={reservation.id} />
                              <input type="hidden" name="item_id" value={it.id} />
                              <label className="sr-only" htmlFor={`file-${it.id}`}>Arquivo para {it.label}</label>
                              <input id={`file-${it.id}`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-sm" />
                              <SubmitButton size="sm" variant="secondary" pendingLabel="Enviando…">Anexar</SubmitButton>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {uploadOpen && items.length > 0 && (
                  <form action={submitReservationDocuments} className="flex flex-wrap items-center gap-4">
                    <input type="hidden" name="proposal_id" value={id} />
                    <input type="hidden" name="reservation_id" value={reservation.id} />
                    <SubmitButton disabled={missing > 0}>Enviar documentação completa</SubmitButton>
                    <span className="text-sm text-ink-soft">{missing > 0 ? `Faltam ${missing} documento(s) obrigatório(s).` : "Todos os obrigatórios anexados."}</span>
                  </form>
                )}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle title="Resumo" />
            <DataList
              items={[
                { label: "Cliente", value: p.client_name ?? "—" },
                { label: "CPF/CNPJ", value: maskDocument(p.client_document) },
                { label: "Valor ofertado", value: formatBRL(p.offered_price) },
                { label: "Tabela no envio", value: p.table_price ? formatBRL(p.table_price) : "—" },
                { label: "Enviada em", value: formatDateTime(p.submitted_at) },
                ...(p.decision_reason ? [{ label: "Retorno da OUZ", value: p.decision_reason }] : []),
              ]}
            />
            <div className="mt-6">
              <p className="eyebrow mb-2">Condições</p>
              <PaymentsList payments={p.payments} />
            </div>
          </section>

          <section>
            <SectionTitle title="Histórico" />
            <ol className="border-l border-line pl-5 flex flex-col gap-3">
              {(events ?? []).map((e, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-ink-mute">{formatDateTime(e.occurred_at)}</p>
                  <p>{e.note ?? (e.to_status ? PROPOSAL_STATUS_LABELS[e.to_status] : "")}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          {["rascunho", "em_analise", "na_fila", "reservada"].includes(p.status) && (
            <Card className="p-5 flex flex-col gap-4">
              <h2 className="font-display text-xl">Ações</h2>
              {["em_analise", "na_fila"].includes(p.status) && (
                <form action={reviseProposal} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton variant="secondary" size="sm">Alterar condições</SubmitButton>
                  <p className="text-xs text-ink-mute">Alterações relevantes geram uma nova versão, que perde a posição atual na fila.</p>
                </form>
              )}
              {p.status !== "rascunho" && (
                <form action={updateObservations} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={id} />
                  <TextArea label="Observações" name="observations" defaultValue={p.observations ?? ""} rows={3} hint="Não altera a posição na fila." />
                  <SubmitButton size="sm" variant="ghost">Salvar observações</SubmitButton>
                </form>
              )}
              <form action={withdrawProposal} className="flex flex-col gap-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} />
                <TextField label="Motivo da desistência" name="reason" />
                <SubmitButton size="sm" variant="danger">{p.status === "reservada" ? "Desistir da reserva" : "Retirar proposta"}</SubmitButton>
              </form>
            </Card>
          )}
          <Link href="/corretor/propostas" className="text-sm underline underline-offset-4">Voltar às propostas</Link>
        </aside>
      </div>
    </>
  );
}
