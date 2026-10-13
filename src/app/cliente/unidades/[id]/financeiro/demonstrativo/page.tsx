import { notFound } from "next/navigation";
import { myUnit } from "@/server/queries/client-unit";
import { unitFinance } from "@/server/queries/client-finance";
import { formatBRL, formatDate, formatDateTime, requestNow } from "@/lib/format";
import { INSTALLMENT_KIND_LABELS, INSTALLMENT_STATUS_LABELS } from "@/lib/labels";

const d = (v: string | null) => (v ? formatDate(v + "T12:00:00Z") : "—");

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const f = await unitFinance(id);
  if (!f) notFound();
  return (
    <article className="bg-surface border border-line p-8 print:border-0 print:p-0 text-sm">
      <header className="flex justify-between gap-6 border-b border-line pb-4 mb-6">
        <div>
          <p className="font-display text-2xl tracking-[0.3em]">OUZ</p>
          <p className="font-medium mt-2">Demonstrativo financeiro</p>
          <p className="text-ink-soft">{u.development.name} · unidade {u.unit.code}</p>
        </div>
        <div className="text-right text-ink-soft">
          <p>Emitido em {formatDateTime(new Date(requestNow()).toISOString())}</p>
          <p>Dados atualizados pela OUZ em {formatDateTime(f.contract.last_updated_at)}</p>
        </div>
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div><dt className="eyebrow">Contratado</dt><dd>{formatBRL(f.totals.contracted)}</dd></div>
        <div><dt className="eyebrow">Pago</dt><dd>{formatBRL(f.totals.paid)}</dd></div>
        <div><dt className="eyebrow">A pagar</dt><dd>{formatBRL(f.totals.toPay)}</dd></div>
        <div><dt className="eyebrow">Vencido</dt><dd>{formatBRL(f.totals.overdueAmount)}</dd></div>
      </dl>
      <table className="w-full">
        <thead className="text-left border-b border-line">
          <tr><th className="py-1">Nº</th><th>Tipo</th><th>Venc.</th><th>Original</th><th>Atualiz.</th><th>Juros</th><th>Multa</th><th>Atualizado</th><th>Pago</th><th>Situação</th></tr>
        </thead>
        <tbody>
          {f.installments.map((i) => (
            <tr key={i.id} className="border-b border-line/60">
              <td className="py-1">{i.number}</td>
              <td>{INSTALLMENT_KIND_LABELS[i.kind]}</td>
              <td>{d(i.due_date)}</td>
              <td>{formatBRL(i.original_amount)}</td>
              <td>{i.monetary_update ? formatBRL(i.monetary_update) : "—"}</td>
              <td>{i.interest ? formatBRL(i.interest) : "—"}</td>
              <td>{i.fine ? formatBRL(i.fine) : "—"}</td>
              <td>{i.updated_amount ? formatBRL(i.updated_amount) : "—"}</td>
              <td>{Number(i.paid_amount) > 0 ? formatBRL(i.paid_amount) : "—"}</td>
              <td>{INSTALLMENT_STATUS_LABELS[i.display_status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-mute mt-6">Documento informativo. Não substitui o contrato nem quitação formal. Atualizações, juros e multas são os informados pela OUZ.</p>
    </article>
  );
}
