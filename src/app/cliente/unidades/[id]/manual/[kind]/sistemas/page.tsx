import Link from "next/link";
import { manualSection } from "@/server/queries/manual";
import { fold, isSystem } from "@/lib/manual";
import { Crumbs, IconBadge, ManualTitle, Prose, loadManual, systemIcon } from "../../ui";
import { ListFilter } from "../filter";

export default async function ManualSystems({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { manual, index, base } = await loadManual(params);
  const systems = index.filter(isSystem);
  const intro = await manualSection(manual.id, "5");
  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Sistemas" }]} />
      <ManualTitle
        tone="gold"
        icon="tools"
        eyebrow="Capítulo 5"
        title="Sistemas da edificação"
        lead="Descrição, cuidados de uso, manutenção preventiva e o que faz perder a garantia de cada sistema."
      />
      <ListFilter target="systems" placeholder="Filtrar sistemas (ex.: vidros, elevadores)" noun={["sistema", "sistemas"]} />
      <ul id="systems" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {systems.map((s) => (
          <li key={s.num} data-k={fold(`${s.num} ${s.title}`)}>
            <Link href={`${base}/secao/${s.num}`} className="h-full flex items-center gap-4 p-4 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink">
              <IconBadge name={systemIcon(s.title)} />
              <span>
                <span className="block text-xs text-ink-mute tabular-nums">{s.num}</span>
                <span className="font-medium leading-snug">{s.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {intro?.html.trim() && (
        <section className="mt-12">
          <h3 className="font-display text-xl mb-3">Introdução</h3>
          <Prose html={intro.html} className="max-w-3xl" />
        </section>
      )}
    </div>
  );
}
