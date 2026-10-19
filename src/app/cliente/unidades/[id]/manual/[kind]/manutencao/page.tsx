import Link from "next/link";
import { manualMaintenance } from "@/server/queries/manual";
import { MAINTENANCE_FREQUENCY_LABELS, fold } from "@/lib/manual";
import { Crumbs, ManualTitle, loadManual } from "../../ui";
import { ListFilter } from "../filter";

export default async function ManualMaintenance({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { manual, index, base } = await loadManual(params);
  const tasks = await manualMaintenance(manual.id);
  const groups = Object.entries(MAINTENANCE_FREQUENCY_LABELS)
    .map(([k, label]) => ({ k, label, items: tasks.filter((t) => t.frequency === k) }))
    .filter((g) => g.items.length);
  const management = index.filter((s) => s.num.startsWith("7.") && s.level === 2);

  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Plano de manutenção" }]} />
      <ManualTitle
        tone="green"
        icon="calendar"
        eyebrow="Capítulo 7 · NBR 5674"
        title="Plano de manutenção preventiva"
        lead="Atividades de manutenção de cada sistema, organizadas por periodicidade. Manter as manutenções em dia é condição para a garantia."
      />
      <div className="grid grid-cols-2 gap-3 mb-8 max-w-md">
        <div className="p-4 bg-surface border border-line rounded-[var(--radius-md)]">
          <p className="font-display text-2xl">{tasks.length}</p>
          <p className="text-sm text-ink-mute">atividades</p>
        </div>
        <div className="p-4 bg-surface border border-line rounded-[var(--radius-md)]">
          <p className="font-display text-2xl">{new Set(tasks.map((t) => t.section_num ?? t.system)).size}</p>
          <p className="text-sm text-ink-mute">sistemas</p>
        </div>
      </div>
      <ListFilter
        target="maintenance"
        placeholder="Buscar atividade ou sistema"
        noun={["atividade", "atividades"]}
        chips={groups.map((g) => ({ value: g.k, label: g.label.replace(/ ou .*/, "") }))}
      />
      <div id="maintenance" className="flex flex-col gap-10">
        {groups.map((g) => (
          <section key={g.k} data-group>
            <h3 className="font-display text-xl mb-3">
              {g.label} <span className="text-sm text-ink-mute font-sans">· {g.items.length}</span>
            </h3>
            <ul className="divide-y divide-line border-y border-line">
              {g.items.map((t) => (
                <li key={t.id} data-k={fold(`${t.system} ${t.description}`)} data-f={g.k} className="py-4">
                  {t.section_num ? (
                    <Link href={`${base}/secao/${t.section_num}`} className="text-sm font-medium underline-offset-4 hover:underline">
                      {t.section_num} · {t.system}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{t.system}</p>
                  )}
                  <p className="text-ink-soft mt-1">{t.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {management.length > 0 && (
        <section className="mt-12">
          <h3 className="font-display text-xl mb-4">Gestão da manutenção</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {management.map((s) => (
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
