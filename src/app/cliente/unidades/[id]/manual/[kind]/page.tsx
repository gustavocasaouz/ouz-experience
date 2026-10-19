import Image from "next/image";
import Link from "next/link";
import { buttonClass } from "@/design-system";
import { manualSection, manualWarranty } from "@/server/queries/manual";
import { plainText } from "@/lib/manual";
import { formatDate } from "@/lib/format";
import { todayInBrasilia, warrantyStatus } from "@/lib/warranty";
import { Icon, IconBadge, Prose, loadManual, manualAreas } from "../ui";

export default async function ManualHome({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { u, manual, index, base } = await loadManual(params);
  const [about, intro, warranty] = await Promise.all([
    manualSection(manual.id, "0"),
    manualSection(manual.id, "1"),
    manualWarranty(manual.id),
  ]);
  const lead = intro ? plainText(intro.html).split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".") : null;
  const habite = u.development.habite_se_date;
  const today = todayInBrasilia();
  const active = warranty.filter((w) => warrantyStatus(habite, w.months, today).state === "vigente").length;
  const has = (n: string) => index.some((s) => s.num === n);
  // Mesmas áreas, na mesma ordem, do menu do manual.
  const tiles = manualAreas({ manual, index, base }, habite ? `${active} de ${warranty.length} itens em garantia hoje` : undefined);

  return (
    <div className="flex flex-col gap-10">
      <section className="grid lg:grid-cols-[2fr_3fr] bg-surface border border-line rounded-[var(--radius-md)] overflow-hidden">
        {u.development.cover_image_path ? (
          <div className="relative aspect-[16/9] lg:aspect-auto lg:min-h-80">
            <Image src={u.development.cover_image_path} alt={`Fachada do ${u.development.name}`} fill sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" priority />
          </div>
        ) : null}
        <div className="p-6 md:p-10 flex flex-col justify-center gap-4">
          <p className="eyebrow">{u.development.name} · OUZ</p>
          <h2 className="font-display text-2xl md:text-3xl leading-tight text-balance">{manual.title}</h2>
          {lead && <p className="text-ink-soft">{lead}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            {has("1") && (
              <Link href={`${base}/secao/1`} className={buttonClass("primary")}>
                Começar a leitura <Icon name="chev" className="size-4" />
              </Link>
            )}
            {manual.pdf_path && (
              <a href={manual.pdf_path} target="_blank" rel="noopener" className={buttonClass("secondary")}>
                Abrir o PDF completo
              </a>
            )}
          </div>
          {habite && <p className="text-xs text-ink-mute">Habite-se em {formatDate(habite + "T12:00:00Z")}: início da contagem das garantias.</p>}
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="h-full flex flex-col gap-3 p-5 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink transition-colors">
              <IconBadge name={t.icon} tone={t.tone} />
              <span className="font-medium text-[17px] leading-snug">{t.title}</span>
              <span className="text-sm text-ink-mute">{t.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      {about?.html && (
        <section>
          <h2 className="font-display text-2xl mb-4">Sobre a OUZ</h2>
          <Prose html={about.html} className="max-w-3xl" />
        </section>
      )}
    </div>
  );
}
