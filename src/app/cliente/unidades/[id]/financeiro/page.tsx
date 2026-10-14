import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, SectionTitle, SelectField, Table, Td, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { myUnit } from "@/server/queries/client-unit";
import { unitFinance } from "@/server/queries/client-finance";
import { askFinancialQuestion, submitReceipt } from "@/server/actions/client";
import { INSTALLMENT_KIND_LABELS, INSTALLMENT_STATUS_LABELS, RECEIPT_STATUS_LABELS } from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime, formatDue } from "@/lib/format";

const d = (v: string | null) => (v ? formatDate(v + "T12:00:00Z") : "—");
const monthYear = (v: string) => `${v.slice(5, 7)}/${v.slice(0, 4)}`;
const tone = (s: string) => (s === "paga" ? "success" : s === "vencida" ? "danger" : s === "parcialmente_paga" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";

export default async function ClientFinance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const f = await unitFinance(id);
  if (!f) return <EmptyState title="Informações financeiras ainda não disponíveis">A OUZ publicará aqui os valores do seu contrato.</EmptyState>;
  const open = f.installments.filter((i) => !["paga", "cancelada", "renegociada"].includes(i.status));
  const hasBreakdown = f.installments.some((i) => i.monetary_update || i.interest || i.fine);
  const habite = (f.contract.unit as unknown as { development: { habite_se_date: string | null } } | null)?.development?.habite_se_date ?? null;

  return (
    <div className="flex flex-col gap-12">
      <Flash searchParams={searchParams} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-mute">Última atualização pela OUZ: <strong className="text-ink">{formatDateTime(f.contract.last_updated_at)}</strong></p>
        <Link href={`/cliente/unidades/${id}/financeiro/demonstrativo`} className="text-sm underline underline-offset-4">Demonstrativo para impressão</Link>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: "Valor contratado", v: formatBRL(f.totals.contracted) },
          { l: "Valores pagos", v: formatBRL(f.totals.paid) },
          { l: "Valores a pagar", v: formatBRL(f.totals.toPay), s: `${f.totals.upcomingCount} parcela(s) a vencer${f.totals.hasEstimate ? " · inclui estimativas" : ""}` },
          { l: "Vencidas", v: formatBRL(f.totals.overdueAmount), s: `${f.totals.overdueCount} parcela(s)`, danger: f.totals.overdueCount > 0 },
        ].map((c) => (
          <Card key={c.l} className={`p-5 ${c.danger ? "border-danger/40" : ""}`}>
            <p className="eyebrow mb-1">{c.l}</p>
            <p className="font-display text-2xl">{c.v}</p>
            {c.s && <p className="text-xs text-ink-mute mt-1">{c.s}</p>}
          </Card>
        ))}
      </section>

      <section>
        <SectionTitle title="Parcelas" />
        {f.installments.length === 0 ? (
          <EmptyState title="Nenhuma parcela lançada" />
        ) : (
          <Table head={["Nº", "Tipo", "Vencimento", "Valor original", ...(hasBreakdown ? ["Atualização", "Juros", "Multa"] : []), "Valor atualizado", "Pago", "Situação"]} caption="Parcelas do contrato">
            {f.installments.map((i) => (
              <tr key={i.id}>
                <Td>{i.number}</Td>
                <Td>{INSTALLMENT_KIND_LABELS[i.kind]}</Td>
                <Td className="whitespace-nowrap">{formatDue(i.due_date)}{i.late_days && i.display_status === "vencida" ? <span className="block text-xs text-danger">{i.late_days} dia(s) de atraso</span> : null}</Td>
                <Td className="whitespace-nowrap">{formatBRL(i.original_amount)}</Td>
                {hasBreakdown && (
                  <>
                    <Td className="whitespace-nowrap">{i.monetary_update ? formatBRL(i.monetary_update) : "—"}</Td>
                    <Td className="whitespace-nowrap">{i.interest ? formatBRL(i.interest) : "—"}</Td>
                    <Td className="whitespace-nowrap">{i.fine ? formatBRL(i.fine) : "—"}</Td>
                  </>
                )}
                <Td className="whitespace-nowrap">{i.updated_amount ? formatBRL(i.updated_amount) : "—"}{i.is_estimate && i.status !== "paga" && <span className="block text-xs text-ink-mute">estimativa</span>}</Td>
                <Td className="whitespace-nowrap">{Number(i.paid_amount) > 0 ? `${formatBRL(i.paid_amount)}${i.paid_on ? ` em ${d(i.paid_on)}` : ""}` : "—"}</Td>
                <Td><Badge tone={tone(i.display_status)}>{INSTALLMENT_STATUS_LABELS[i.display_status] ?? i.display_status}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
        {f.contract.index_name && (
          <p className="text-sm text-ink-soft mt-4">
            Parcelas corrigidas pelo {f.contract.index_name}: valor em CUBs multiplicado pelo CUB do mês do vencimento
            {f.contract.post_habite_index ? `, até o Habite-se; depois, o valor passa a ser corrigido pelo ${f.contract.post_habite_index}${habite ? ` (Habite-se em ${d(habite)})` : ""}` : ""}.
            {f.totals.hasEstimate && <> Onde aparece <strong>estimativa</strong>, o índice do mês ainda não foi publicado e o cálculo usa o último cadastrado{f.totals.lastIndexMonth ? ` (${monthYear(f.totals.lastIndexMonth)})` : ""}; o valor final depende do CUB do mês do pagamento.</>}
          </p>
        )}
        {f.contract.late_interest_monthly_pct && f.totals.overdueCount > 0 && (
          <p className="text-sm text-ink-soft mt-3">
            Parcelas vencidas: juros de {Number(f.contract.late_interest_monthly_pct).toLocaleString("pt-BR")}% ao mês, proporcionais aos dias de atraso, e multa de {Number(f.contract.late_fine_pct).toLocaleString("pt-BR")}% sobre o débito, conforme contrato. Valores atualizados diariamente até o pagamento.
          </p>
        )}
        <p className="text-xs text-ink-mute mt-3">Atualização, juros e multa são informados pela OUZ quando existirem. Valores sujeitos a conferência.</p>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl mb-1">Enviar comprovante</h2>
          <p className="text-sm text-ink-soft mb-4">O envio não dá baixa na parcela: a OUZ confere e valida.</p>
          <form action={submitReceipt} className="flex flex-col gap-4">
            <input type="hidden" name="unit_id" value={id} />
            <input type="hidden" name="contract_id" value={f.contract.id} />
            <SelectField label="Parcela" name="installment_id" id="rc-inst" placeholder="Não sei / outra" options={open.map((i) => ({ value: i.id, label: `Nº ${i.number} · ${i.due_date ? `vence ${d(i.due_date)}` : formatDue(null).toLowerCase()} · ${formatBRL(i.updated_amount ?? i.original_amount)}` }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Valor pago (R$)" name="amount" id="rc-amount" inputMode="decimal" />
              <TextField label="Data do pagamento" name="paid_on" id="rc-date" type="date" />
            </div>
            <TextField label="Observação" name="note" id="rc-note" />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rc-file" className="text-sm font-medium">Arquivo (PDF, JPG ou PNG, até 10 MB)</label>
              <input id="rc-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-sm" />
            </div>
            <SubmitButton className="self-start">Enviar comprovante</SubmitButton>
          </form>
          {f.receipts.length > 0 && (
            <ul className="mt-6 divide-y divide-line border-t border-line text-sm">
              {f.receipts.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2">
                  <a className="underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${r.storage_path}`}>Enviado em {formatDateTime(r.uploaded_at)}</a>
                  <span><Badge tone={r.status === "validado" ? "success" : r.status === "recusado" ? "danger" : "warning"}>{RECEIPT_STATUS_LABELS[r.status]}</Badge>{r.review_note ? ` ${r.review_note}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-xl mb-1">Pedir esclarecimento</h2>
          <p className="text-sm text-ink-soft mb-4">Dúvidas sobre valores, vencimentos ou atualizações vão direto ao financeiro da OUZ.</p>
          <form action={askFinancialQuestion} className="flex flex-col gap-4">
            <input type="hidden" name="unit_id" value={id} />
            <input type="hidden" name="contract_id" value={f.contract.id} />
            <SelectField label="Sobre a parcela" name="installment_id" id="iq-inst" placeholder="Geral" options={f.installments.map((i) => ({ value: i.id, label: `Nº ${i.number} · ${formatDue(i.due_date)}` }))} />
            <TextArea label="Sua dúvida" name="message" id="iq-msg" required rows={4} maxLength={4000} />
            <SubmitButton className="self-start">Enviar</SubmitButton>
          </form>
          {f.inquiries.length > 0 && (
            <ul className="mt-6 divide-y divide-line border-t border-line text-sm">
              {f.inquiries.map((q) => (
                <li key={q.id} className="py-3">
                  <p className="text-xs text-ink-mute">{formatDateTime(q.created_at)}</p>
                  <p>{q.message}</p>
                  {q.response ? <p className="mt-1 border-l-2 border-accent pl-3 text-ink-soft">OUZ: {q.response}</p> : <p className="text-xs text-warning mt-1">Aguardando resposta</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
