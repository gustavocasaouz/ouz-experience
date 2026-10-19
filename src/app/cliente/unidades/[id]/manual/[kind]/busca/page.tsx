import Link from "next/link";
import { EmptyState } from "@/design-system";
import { searchManual } from "@/server/queries/manual";
import { pageNumFor, plainText, snippet } from "@/lib/manual";
import { Crumbs, ManualTitle, loadManual } from "../../ui";

export default async function ManualSearch({ params, searchParams }: { params: Promise<{ id: string; kind: string }>; searchParams: Promise<{ q?: string }> }) {
  const { manual, index, base } = await loadManual(params);
  const q = String((await searchParams).q ?? "").slice(0, 80).trim();
  const results = q.length >= 2 ? await searchManual(manual.id, q) : [];
  const href = (num: string) => {
    const page = pageNumFor(num, index);
    return page === num ? `${base}/secao/${num}` : `${base}/secao/${page}#s-${num}`;
  };
  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Busca" }]} />
      <ManualTitle icon="search" eyebrow="Busca no manual" title={q ? `“${q}”` : "Pesquisar"} />
      {q.length < 2 ? (
        <EmptyState title="Digite pelo menos 2 letras">Use o campo de pesquisa acima (ex.: impermeabilização, vidros, gás).</EmptyState>
      ) : results.length === 0 ? (
        <EmptyState title="Nada encontrado">Tente outra palavra ou a forma no singular.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-mute mb-4" aria-live="polite">{results.length === 40 ? "40+ seções" : `${results.length} ${results.length === 1 ? "seção" : "seções"}`}</p>
          <ul className="flex flex-col gap-3">
            {results.map((r) => {
              const sn = snippet(plainText(r.html), q);
              return (
                <li key={r.num}>
                  <Link href={href(r.num)} className="block p-5 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink">
                    <span className="text-xs text-ink-mute tabular-nums">{r.num}</span>
                    <span className="block font-medium">{r.title}</span>
                    {sn && (
                      <span className="block text-sm text-ink-soft mt-1">
                        {sn.before}
                        <mark className="bg-accent-soft text-ink rounded-sm px-0.5">{sn.match}</mark>
                        {sn.after}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
