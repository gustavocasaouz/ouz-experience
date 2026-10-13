"use client";

import { useActionState, useState } from "react";
import { Button, FormMessage, TextArea, TextField } from "@/design-system";
import { proposalAction } from "@/server/actions/proposals";
import type { ActionState } from "@/server/actions/types";
import { formatBRL, parseBRL } from "@/lib/format";
import { PAYMENT_KIND_LABELS } from "@/lib/labels";
import { EvaluationView, type Evaluation } from "./evaluation-view";

type Row = { kind: string; amount: string; quantity: string; first_due: string; interval_months: string };
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

const today = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const emptyRow = (kind = "entrada"): Row => ({ kind, amount: "", quantity: "1", first_due: today(), interval_months: "1" });
const input = "w-full bg-surface border border-line px-2.5 py-2 text-sm focus:border-ink focus:outline-none";

export function ProposalForm({ defaults, tablePrice, unitLabel }: { defaults: ProposalDefaults; tablePrice: number | null; unitLabel: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(proposalAction, { data: defaults.id ? { id: defaults.id } : {} });
  const [key] = useState(() => crypto.randomUUID());
  const [offered, setOffered] = useState(defaults.offered ?? (tablePrice ? tablePrice.toFixed(2).replace(".", ",") : ""));
  const [rows, setRows] = useState<Row[]>(
    defaults.payments?.length
      ? defaults.payments.map((p) => ({
          kind: p.kind,
          amount: p.amount.toFixed(2).replace(".", ","),
          quantity: String(p.quantity),
          first_due: p.first_due,
          interval_months: String(p.interval_months ?? 1),
        }))
      : [emptyRow("entrada"), { ...emptyRow("parcela"), quantity: "12" }, emptyRow("chaves")],
  );

  const parsedRows = rows.map((r) => ({
    kind: r.kind,
    amount: parseBRL(r.amount) ?? 0,
    quantity: Math.max(1, parseInt(r.quantity || "1", 10) || 1),
    first_due: r.first_due,
    ...(parseInt(r.quantity || "1", 10) > 1 ? { interval_months: Math.max(1, parseInt(r.interval_months || "1", 10) || 1) } : {}),
  }));
  const total = parsedRows.reduce((a, r) => a + r.amount * r.quantity, 0);
  const offeredNum = parseBRL(offered) ?? 0;
  const diff = Math.round((offeredNum - total) * 100) / 100;
  const evaluation = state.data?.evaluation as Evaluation | undefined;
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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
        <TextField label="Nome do cliente" name="client_name" defaultValue={defaults.clientName} required autoComplete="off" />
        <TextField label="CPF ou CNPJ do cliente" name="client_document" defaultValue={defaults.clientDocument} required autoComplete="off" hint="Sem nome e CPF/CNPJ válidos, a proposta só pode ser salva como rascunho e não entra na fila." />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Valores · {unitLabel}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Valor ofertado (R$)" name="offered_price" value={offered} onChange={(e) => setOffered(e.target.value)} inputMode="decimal" required />
          <div className="text-sm text-ink-soft sm:pt-8">Tabela vigente: <strong className="text-ink">{formatBRL(tablePrice)}</strong></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <caption className="sr-only">Condições de pagamento</caption>
            <thead className="text-left text-ink-mute">
              <tr>
                <th className="py-2 pr-2 font-normal">Tipo</th>
                <th className="py-2 pr-2 font-normal">Valor de cada (R$)</th>
                <th className="py-2 pr-2 font-normal">Qtde.</th>
                <th className="py-2 pr-2 font-normal">1º vencimento</th>
                <th className="py-2 pr-2 font-normal">A cada (meses)</th>
                <th className="py-2 font-normal"><span className="sr-only">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="pr-2 py-1">
                    <select aria-label={`Tipo da linha ${i + 1}`} className={input} value={r.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                      {Object.entries(PAYMENT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 py-1"><input aria-label={`Valor da linha ${i + 1}`} className={input} inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} /></td>
                  <td className="pr-2 py-1 w-20"><input aria-label={`Quantidade da linha ${i + 1}`} className={input} inputMode="numeric" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} /></td>
                  <td className="pr-2 py-1"><input aria-label={`Primeiro vencimento da linha ${i + 1}`} className={input} type="date" value={r.first_due} onChange={(e) => update(i, { first_due: e.target.value })} /></td>
                  <td className="pr-2 py-1 w-24"><input aria-label={`Periodicidade da linha ${i + 1}`} className={input} inputMode="numeric" value={r.interval_months} disabled={parseInt(r.quantity || "1", 10) <= 1} onChange={(e) => update(i, { interval_months: e.target.value })} /></td>
                  <td className="py-1"><button type="button" className="text-xs underline" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, emptyRow("parcela")])}>Adicionar condição</Button>
          <p className={`text-sm ${Math.abs(diff) <= 0.01 ? "text-success" : "text-warning"}`} aria-live="polite">
            Soma das condições: {formatBRL(total)} {Math.abs(diff) <= 0.01 ? "✓ confere com o valor ofertado" : `· diferença de ${formatBRL(diff)}`}
          </p>
        </div>
      </fieldset>

      <TextArea label="Observações" name="observations" defaultValue={defaults.observations} rows={3} maxLength={4000} />

      {evaluation && <EvaluationView evaluation={evaluation} />}

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Button type="submit" name="intent" value="preview" variant="secondary" disabled={pending}>Avaliar condições</Button>
        <Button type="submit" name="intent" value="draft" variant="ghost" disabled={pending}>Salvar rascunho</Button>
        <Button type="submit" name="intent" value="submit" disabled={pending}>{pending ? "Processando…" : "Enviar proposta"}</Button>
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
