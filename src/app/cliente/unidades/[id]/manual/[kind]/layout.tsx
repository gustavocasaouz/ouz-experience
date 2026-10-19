import Link from "next/link";
import { buttonClass } from "@/design-system";
import { listManuals } from "@/server/queries/manual";
import { MANUAL_KIND_LABELS } from "@/lib/manual";
import { cx } from "@/design-system/cx";
import { Icon, loadManual, manualAreas } from "../ui";
import { ManualNav, type NavItem } from "./manual-nav";

export default async function ManualLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string; kind: string }> }) {
  const { u, manual, index, base } = await loadManual(params);
  const manuals = await listManuals(u.development.id, u.unit.id);
  // Mesmas áreas, na mesma ordem, dos quadros da página inicial.
  const items: NavItem[] = [
    { href: base, label: "Início", icon: "home" },
    ...manualAreas({ manual, index, base }).map((a) => ({ href: a.href, label: a.title, icon: a.icon, match: a.match })),
  ];
  const unitBase = `/cliente/unidades/${u.unit.id}/manual`;

  return (
    <div className="grid 2xl:gap-8 2xl:grid-cols-[15rem_1fr]">
      <aside>
        <ManualNav items={items} />
      </aside>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          {manuals.length > 1 ? (
            <nav aria-label="Manuais" className="inline-flex p-1 bg-sand rounded-[var(--radius-sm)] shrink-0">
              {manuals.map((m) => (
                <Link
                  key={m.kind}
                  href={`${unitBase}/${m.kind}`}
                  aria-current={m.kind === manual.kind ? "page" : undefined}
                  className={cx("px-4 min-h-10 flex items-center text-sm whitespace-nowrap rounded-[calc(var(--radius-sm)-2px)]", m.kind === manual.kind ? "bg-surface text-ink shadow-sm" : "text-ink-mute hover:text-ink")}
                >
                  {m.kind === "proprietario" ? "Proprietário" : "Condomínio"}
                </Link>
              ))}
            </nav>
          ) : (
            <p className="eyebrow">{MANUAL_KIND_LABELS[manual.kind]}</p>
          )}
          <div className="flex gap-2 items-center flex-1 min-w-0 basis-72 justify-end">
            <form action={`${base}/busca`} role="search" className="relative flex-1 min-w-0 max-w-sm">
              <label htmlFor="manual-q" className="sr-only">Pesquisar no manual</label>
              <Icon name="search" className="size-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
              <input
                id="manual-q"
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="Pesquisar (ex.: impermeabilização)"
                className="w-full bg-surface border border-line rounded-[var(--radius-sm)] pl-10 pr-3 min-h-11 text-base focus:border-ink focus:outline-none"
              />
            </form>
            {manual.pdf_path && (
              <a href={manual.pdf_path} target="_blank" rel="noopener" className={buttonClass("secondary", "md", "shrink-0 px-4")}>
                <Icon name="download" className="size-[18px]" />
                <span className="max-sm:sr-only">PDF completo</span>
              </a>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
