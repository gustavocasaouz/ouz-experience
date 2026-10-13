import { cx } from "@/design-system/cx";
import { formatBRL, formatDate } from "@/lib/format";

export type Criterion = { code: string; label: string; ok: boolean | null; limit?: number; value?: number | null; detail?: string | null };
export type Evaluation = {
  within: boolean;
  criteria: Criterion[];
  totals?: { total: number; entrada: number; ate_chaves: number; ultimo_vencimento: string; parcelas: number; reforcos: number };
  table_price?: number | null;
  keys_date?: string | null;
};

const fmt = (c: Criterion, v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  if (c.code === "preco_minimo") return formatBRL(v);
  if (/percentual|%/.test(c.label)) return `${Number(v).toLocaleString("pt-BR")}%`;
  return String(v);
};

/** Resultado da avaliação vinda do banco (mesma regra usada no envio e na fila). */
export function EvaluationView({ evaluation, title = "Avaliação das condições" }: { evaluation: Evaluation; title?: string }) {
  return (
    <section aria-live="polite" className={cx("border p-5", evaluation.within ? "border-success/40 bg-success-soft/40" : "border-warning/40 bg-warning-soft/40")}>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className={cx("text-sm mb-4", evaluation.within ? "text-success" : "text-warning")}>
        {evaluation.within ? "Dentro da política vigente: apta à aprovação automática (sujeita à disponibilidade e à fila)." : "Fora da política vigente ou exige análise da OUZ."}
      </p>
      {(evaluation.table_price !== undefined || evaluation.keys_date !== undefined) && (
        <p className="text-xs text-ink-mute mb-3">
          {evaluation.table_price !== undefined && <>Preço de tabela vigente: {formatBRL(evaluation.table_price)} · </>}
          Previsão de chaves: {evaluation.keys_date ? formatDate(evaluation.keys_date + "T12:00:00Z") : "não informada"}
        </p>
      )}
      <ul className="flex flex-col gap-2 text-sm">
        {evaluation.criteria.map((c) => (
          <li key={c.code} className="flex gap-3">
            <span aria-hidden className={cx("mt-0.5 font-medium w-4", c.ok === true ? "text-success" : c.ok === false ? "text-danger" : "text-warning")}>
              {c.ok === true ? "✓" : c.ok === false ? "✕" : "?"}
            </span>
            <span>
              <span className="sr-only">{c.ok === true ? "Atendido: " : c.ok === false ? "Não atendido: " : "Não avaliável: "}</span>
              {c.label}
              {(c.limit !== undefined || c.value !== undefined) && (
                <span className="text-ink-mute">
                  {" "}— limite {fmt(c, c.limit)}, proposta {fmt(c, c.value)}
                </span>
              )}
              {c.detail && <span className="block text-xs text-ink-mute">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
