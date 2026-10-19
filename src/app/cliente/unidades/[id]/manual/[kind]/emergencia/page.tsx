import { manualSectionsUnder } from "@/server/queries/manual";
import { plainText } from "@/lib/manual";
import { Crumbs, Icon, ManualTitle, Prose, loadManual } from "../../ui";

const procIcon = (t: string) => (/g[aá]s/i.test(t) ? "flame" : /[aá]gua/i.test(t) ? "drop" : /el[eé]tric/i.test(t) ? "bolt" : /elevador/i.test(t) ? "elevator" : "fire");

export default async function ManualEmergency({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { manual, base } = await loadManual(params);
  const [safety, services] = await Promise.all([manualSectionsUnder(manual.id, "9.2"), manualSectionsUnder(manual.id, "9.3")]);
  // "Bombeiros: 193", "Celesc: 0800 048 0120" → botões de ligação.
  const phones = (services[0]?.html ?? "")
    .split("</p>")
    .map((p) => plainText(p).match(/^(.+?):\s*([\d()\s-]{3,})$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ name: m[1]!, number: m[2]!.trim() }));
  const intro = safety.find((s) => s.num === "9.2");
  const procedures = safety.filter((s) => s.num !== "9.2");

  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Segurança e emergência" }]} />
      <ManualTitle tone="red" icon="alert" eyebrow="Capítulo 9" title="Segurança e emergência" />
      {phones.length > 0 && (
        <ul className="grid gap-3 grid-cols-2 lg:grid-cols-3 mb-10">
          {phones.map((p) => (
            <li key={p.name}>
              <a href={`tel:${p.number.replace(/\D/g, "")}`} className="h-full flex flex-col gap-1 p-4 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink">
                <span className="text-sm text-ink-soft">{p.name}</span>
                <span className="font-display text-xl flex items-center gap-2">
                  <Icon name="phone" className="size-4" />
                  {p.number}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-display text-xl mb-4">O que fazer em caso de…</h3>
      <div className="flex flex-col gap-3">
        {procedures.map((d, i) => (
          <details key={d.num} open={i === 0} className="group bg-surface border border-line rounded-[var(--radius-md)]">
            <summary className="flex items-center gap-3 px-5 min-h-14 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <Icon name={procIcon(d.title)} />
              <span className="font-medium flex-1">{d.title}</span>
              <Icon name="chev" className="size-4 text-ink-mute transition-transform group-open:rotate-90" />
            </summary>
            <Prose html={d.html} className="px-5 pb-5" />
          </details>
        ))}
      </div>
      {intro?.html.trim() && (
        <section className="mt-10">
          <h3 className="font-display text-xl mb-3">Segurança</h3>
          <Prose html={intro.html} className="max-w-3xl" />
        </section>
      )}
    </div>
  );
}
