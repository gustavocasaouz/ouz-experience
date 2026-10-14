"use client";

import { useActionState, useState } from "react";
import { Button, FormMessage, TextArea, TextField } from "@/design-system";
import { proposalAction } from "@/server/actions/proposals";
import type { ActionState } from "@/server/actions/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { PAYMENT_KIND_LABELS } from "@/lib/labels";

type Row = { kind: string; amount: string; pct: string; quantity: string; first_due: string; interval_months: string };
export type ProposalDefaults = {
  id?: string;
  unitId: string;
  registrationId?: string | null;
  clientName?: string;
  clientDocument?: string;
  offered?: string;
  observations?: string;
  payments?: Array<{ kind: string; amount: number; quantity: number; first_due: string; interval_months?: number }>;
};

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
const pctText = (n: number) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toString().replace(".", ",") : "");
const qty = (r: Row) => Math.max(1, parseInt(r.quantity || "1", 10) || 1);
const input = "w-full bg-surface border border-line px-2.5 py-2 text-sm focus:border-ink focus:outline-none";

/** Recalcula o % de cada linha a partir do valor (fonte da verdade é o valor em reais). */
function withPct(r: Row, offered: number): Row {
  const amount = parseBRL(r.amount) ?? 0;
  return { ...r, pct: offered > 0 && amount > 0 ? pctText(((amount * qty(r)) / offered) * 100) : "" };
}

export function ProposalForm({ defaults, tablePrice, unitLabel }: { defaults: ProposalDefaults; tablePrice: number | null; unitLabel: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(proposalAction, { data: defaults.id ? { id: defaults.id } : {} });
  const [key] = useState(() => crypto.randomUUID());
  const [clientName, setClientName] = useState(defaults.clientName ?? "");
  const [clientDocument, setClientDocument] = useState(defaults.clientDocument ?? "");
  const [observations, setObservations] = useState(defaults.observations ?? "");
  const [offered, setOffered] = useState(defaults.offered ?? (tablePrice ? money(tablePrice) : ""));
  const offeredNum = parseBRL(offered) ?? 0;
  const [rows, setRows] = useState<Row[]>(() => {
    const base: Row[] = defaults.payments?.length
      ? defaults.payments.map((p) => ({ kind: p.kind, amount: money(p.amount), pct: "", quantity: String(p.quantity), first_due: p.first_due, interval_months: String(p.interval_months ?? 1) }))
      : [
          { kind: "entrada", amount: "", pct: "", quantity: "1", first_due: tomorrow(), interval_months: "1" },
          { kind: "parcela", amount: "", pct: "", quantity: "12", first_due: tomorrow(), interval_months: "1" },
          { kind: "chaves", amount: "", pct: "", quantity: "1", first_due: tomorrow(), interval_months: "1" },
        ];
    const off = parseBRL(defaults.offered ?? (tablePrice ? String(tablePrice) : "")) ?? 0;
    return base.map((r) => withPct(r, off));
  });

  const parsedRows = rows.map((r) => ({
    kind: r.kind,
    amount: parseBRL(r.amount) ?? 0,
    quantity: qty(r),
    first_due: r.first_due,
    ...(qty(r) > 1 ? { interval_months: Math.max(1, parseInt(r.interval_months || "1", 10) || 1) } : {}),
  }));
  const total = parsedRows.reduce((a, r) => a + r.amount * r.quantity, 0);
  const diff = Math.round((offeredNum - total) * 100) / 100;
  const fe = state.fieldErrors ?? {};

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? withPct({ ...r, ...patch }, offeredNum) : r)));
  const setPct = (i: number, value: string) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const p = Number(value.replace(",", "."));
        const amount = Number.isFinite(p) && offeredNum > 0 ? money((offeredNum * p) / 100 / qty(r)) : r.amount;
        return { ...r, pct: value, amount };
      }),
    );
  const fillRemaining = (i: number) =>
    setRows((rs) => {
      const others = rs.reduce((a, r, j) => (j === i ? a : a + (parseBRL(r.amount) ?? 0) * qty(r)), 0);
      return rs.map((r, j) => (j === i ? withPct({ ...r, amount: money(Math.max(offeredNum - others, 0) / qty(r)) }, offeredNum) : r));
    });
  const changeOffered = (v: string) => {
    setOffered(v);
    const off = parseBRL(v) ?? 0;
    setRows((rs) => rs.map((r) => withPct(r, off)));
  };

  return (
    <form action={action} className="flex flex-col gap-8">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={(state.data?.id as string) ?? defaults.id ?? ""} />
      <input type="hidden" name="unit_id" value={defaults.unitId} />
      <input type="hidden" name="registration_id" value={defaults.registrationId ?? ""} />
      <input type="hidden" name="idempotency_key" value={key} />
      <input type="hidden" name="payments" value={JSON.stringify(parsedRows)} />

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-2xl mb-4">Cliente</legend>
        <TextField label="Nome do cliente" name="client_name" value={clientName} onChange={(e) => setClientName(e.target.value)} required autoComplete="off" error={fe.client_name} />
        <TextField
          label="CPF ou CNPJ do cliente"
          name="client_document"
          value={clientDocument}
          onChange={(e) => setClientDocument(e.target.value)}
          required
          autoComplete="off"
          error={fe.client_document}
          hint="Sem nome e CPF/CNPJ válidos, a proposta só pode ser salva como rascunho e não entra na fila."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Valores · {unitLabel}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Valor ofertado (R$)" name="offered_price" value={offered} onChange={(e) => changeOffered(e.target.value)} inputMode="decimal" required error={fe.offered_price} />
          <div className="text-sm text-ink-soft sm:pt-8">Tabela vigente: <strong className="text-ink">{formatBRL(tablePrice)}</strong></div>
        </div>

        <p className="text-sm text-ink-soft">
          Preencha cada condição em <strong>reais</strong> ou em <strong>% do valor ofertado</strong> — um calcula o outro. Em séries (parcelas, reforços), o % é do total da série.
        </p>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Condições de pagamento">
          <table className="w-full text-sm min-w-[760px]">
            <caption className="sr-only">Condições de pagamento</caption>
            <thead className="text-left text-ink-mute">
              <tr>
                <th className="py-2 pr-2 font-normal">Tipo</th>
                <th className="py-2 pr-2 font-normal w-20">Qtde.</th>
                <th className="py-2 pr-2 font-normal w-24">% do total</th>
                <th className="py-2 pr-2 font-normal">Valor de cada (R$)</th>
                <th className="py-2 pr-2 font-normal">1º vencimento</th>
                <th className="py-2 pr-2 font-normal w-24">A cada (meses)</th>
                <th className="py-2 font-normal"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="pr-2 py-1">
                    <select aria-label={`Tipo da linha ${i + 1}`} className={input} value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value })}>
                      {Object.entries(PAYMENT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 py-1"><input aria-label={`Quantidade da linha ${i + 1}`} className={input} inputMode="numeric" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} /></td>
                  <td className="pr-2 py-1">
                    <div className="relative">
                      <input aria-label={`Percentual da linha ${i + 1}`} className={`${input} pr-6`} inputMode="decimal" value={r.pct} onChange={(e) => setPct(i, e.target.value)} />
                      <span className="absolute right-2 top-2 text-ink-mute" aria-hidden>%</span>
                    </div>
                  </td>
                  <td className="pr-2 py-1"><input aria-label={`Valor de cada, linha ${i + 1}`} className={input} inputMode="decimal" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} /></td>
                  <td className="pr-2 py-1"><input aria-label={`Primeiro vencimento da linha ${i + 1}`} className={input} type="date" value={r.first_due} onChange={(e) => setRow(i, { first_due: e.target.value })} /></td>
                  <td className="pr-2 py-1"><input aria-label={`Periodicidade da linha ${i + 1}`} className={input} inputMode="numeric" value={r.interval_months} disabled={qty(r) <= 1} onChange={(e) => setRow(i, { interval_months: e.target.value })} /></td>
                  <td className="py-1 whitespace-nowrap text-xs flex flex-col gap-1 pt-2">
                    <button type="button" className="underline text-left" onClick={() => fillRemaining(i)}>Completar saldo</button>
                    <button type="button" className="underline text-left text-ink-mute" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { kind: "parcela", amount: "", pct: "", quantity: "1", first_due: tomorrow(), interval_months: "1" }])}>
            Adicionar condição
          </Button>
          <p className={`text-sm ${Math.abs(diff) <= 0.01 ? "text-success" : "text-warning"}`} aria-live="polite">
            Soma das condições: {formatBRL(total)} {Math.abs(diff) <= 0.01 ? "✓ confere com o valor ofertado" : `· faltam ${formatBRL(diff)}`}
          </p>
        </div>
      </fieldset>

      <TextArea label="Observações" name="observations" value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} maxLength={4000} />

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Button type="submit" name="intent" value="draft" variant="ghost" disabled={pending}>Salvar rascunho</Button>
        <Button type="submit" name="intent" value="submit" disabled={pending || Math.abs(diff) > 0.01}>{pending ? "Processando…" : "Enviar proposta"}</Button>
        {(state.data?.outside as boolean | undefined) && (
          <Button type="submit" name="intent" value="analysis" variant="danger" disabled={pending}>Enviar para análise da OUZ</Button>
        )}
      </div>
      <p className="text-xs text-ink-mute">
        A aprovação comercial não equivale a contrato assinado. Se a unidade já tiver reserva ativa, a proposta entra na fila, sem prazo de 48 horas até receber a reserva.
      </p>
    </form>
  );
}
