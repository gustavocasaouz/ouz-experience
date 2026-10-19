import Link from "next/link";
import { Badge, buttonClass } from "@/design-system";
import { manualWarranty } from "@/server/queries/manual";
import { fold } from "@/lib/manual";
import { formatDate } from "@/lib/format";
import { formatWarrantyPeriod, todayInBrasilia, warrantyStatus, type WarrantyStatus } from "@/lib/warranty";
import { Crumbs, ManualTitle, loadManual } from "../../ui";
import { ListFilter } from "../filter";

const day = (d: string) => formatDate(d + "T12:00:00Z");

function StatusBadge({ st }: { st: WarrantyStatus }) {
  if (st.state === "aguardando_habite_se") return <Badge>Começa no habite-se</Badge>;
  if (st.state === "encerrada") return <Badge>Encerrada em {day(st.endsOn!)}</Badge>;
  if (st.daysLeft! <= 90) return <Badge tone="warning">Até {day(st.endsOn!)} · {st.daysLeft === 0 ? "último dia" : `faltam ${st.daysLeft} dias`}</Badge>;
  return <Badge tone="success">Em garantia até {day(st.endsOn!)}</Badge>;
}

export default async function ManualWarranty({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { u, manual, index, base } = await loadManual(params);
  const items = await manualWarranty(manual.id);
  const habite = u.development.habite_se_date;
  const today = todayInBrasilia();
  const rows = new Map<number, { system: string; items: Array<(typeof items)[number] & { st: WarrantyStatus }> }>();
  for (const w of items) {
    const r = rows.get(w.row_number) ?? { system: w.system, items: [] };
    r.items.push({ ...w, st: warrantyStatus(habite, w.months, today) });
    rows.set(w.row_number, r);
  }
  const active = items.filter((w) => warrantyStatus(habite, w.months, today).state === "vigente").length;
  const periods = [...new Set(items.map((w) => w.months))].sort((a, b) => a - b);
  const related = ["2.1", "2.2", "2.3", "2.4"].map((n) => index.find((s) => s.num === n)).filter(Boolean) as typeof index;

  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Garantias" }]} />
      <ManualTitle tone="gold" icon="shield" eyebrow="Capítulo 2" title="Prazos de garantia" />

      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        <div className="p-5 bg-surface border border-line rounded-[var(--radius-md)]">
          <p className="eyebrow mb-1">Início da contagem</p>
          <p className="font-display text-2xl">{habite ? day(habite) : "A definir"}</p>
          <p className="text-sm text-ink-mute">Data do habite-se</p>
        </div>
        <div className="p-5 bg-surface border border-line rounded-[var(--radius-md)]">
          <p className="eyebrow mb-1">Em garantia hoje</p>
          <p className="font-display text-2xl">{habite ? `${active} de ${items.length}` : "—"}</p>
          <p className="text-sm text-ink-mute">itens da tabela</p>
        </div>
        <div className="p-5 bg-surface border border-line rounded-[var(--radius-md)] flex flex-col justify-between gap-3">
          <p className="text-sm text-ink-soft">Encontrou um problema em um item em garantia?</p>
          <Link href="/cliente/chamados/novo" className={buttonClass("primary", "sm", "self-start")}>Abrir chamado</Link>
        </div>
      </div>

      <p className="text-sm text-ink-soft bg-sand/60 border border-line rounded-[var(--radius-md)] p-4 mb-8">
        A contagem dos prazos começa na expedição do habite-se, independentemente da data em que a unidade foi recebida. A garantia depende do uso correto e das
        manutenções preventivas descritas no manual. Falhas visíveis (riscos, lascas, trincas em vidros) precisam constar no termo de vistoria e entrega.
      </p>

      <ListFilter
        target="warranty"
        placeholder="Buscar sistema ou item (ex.: vidros, pintura)"
        noun={["item", "itens"]}
        chips={[
          ...(habite ? [{ value: "vigente", label: "Em garantia" }, { value: "encerrada", label: "Encerradas" }] : []),
          ...periods.map((m) => ({ value: `m${m}`, label: formatWarrantyPeriod(m) })),
        ]}
      />

      <ul id="warranty" className="flex flex-col gap-3">
        {[...rows.entries()].map(([n, r]) => (
          <li key={n} data-group className="bg-surface border border-line rounded-[var(--radius-md)]">
            <p className="px-5 pt-4 pb-2 font-medium leading-snug">
              <span className="text-ink-mute tabular-nums mr-2">{n}.</span>
              {r.system}
            </p>
            <ul className="divide-y divide-line">
              {r.items.map((w) => (
                <li
                  key={w.id}
                  data-k={fold(`${r.system} ${w.aspect}`)}
                  data-f={`${w.st.state} m${w.months}`}
                  className="px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-ink-soft">
                    <span className="inline-block w-16 text-ink font-medium">{formatWarrantyPeriod(w.months)}</span>
                    {w.aspect}
                  </span>
                  <StatusBadge st={w.st} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {related.length > 0 && (
        <section className="mt-12">
          <h3 className="font-display text-xl mb-4">Condições, perdas e responsabilidades</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((s) => (
              <li key={s.num}>
                <Link href={`${base}/secao/${s.num}`} className="h-full flex gap-3 p-4 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink">
                  <span className="text-ink-mute tabular-nums text-sm pt-0.5 w-8">{s.num}</span>
                  <span className="font-medium">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
