import { formatBRL, formatDate } from "@/lib/format";
import { PAYMENT_KIND_LABELS } from "@/lib/labels";

type P = { kind: string; amount: number; quantity: number; first_due: string; interval_months?: number };

export function PaymentsList({ payments }: { payments: P[] }) {
  if (!payments?.length) return <p className="text-sm text-ink-mute">Sem condições informadas.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line text-sm">
      {payments.map((p, i) => (
        <li key={i} className="py-2 flex flex-wrap justify-between gap-2">
          <span>
            {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}: {p.quantity > 1 ? `${p.quantity} × ` : ""}
            {formatBRL(p.amount)}
          </span>
          <span className="text-ink-mute">
            {p.quantity > 1 ? `a partir de ${formatDate(p.first_due + "T12:00:00Z")}, a cada ${p.interval_months ?? 1} mês(es)` : formatDate(p.first_due + "T12:00:00Z")}
          </span>
        </li>
      ))}
    </ul>
  );
}
