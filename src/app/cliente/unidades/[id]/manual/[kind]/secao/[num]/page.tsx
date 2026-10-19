import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { manualAttachments, manualSectionsUnder } from "@/server/queries/manual";
import { PANE_LABELS, chapterOf, isSystem, pageNumFor, parentNum, readingSequence, splitPanes, withoutLines } from "@/lib/manual";
import { AttachmentRows, CHAPTER_ICONS, Crumbs, Icon, ManualTitle, Prose, loadManual, sectionTone, systemIcon } from "../../../ui";
import { Panes } from "../../panes";

export default async function ManualSection({ params }: { params: Promise<{ id: string; kind: string; num: string }> }) {
  const p = await params;
  const { manual, index, base } = await loadManual(Promise.resolve(p));
  const num = decodeURIComponent(p.num);
  if (!/^\d+(\.\d+)*$/.test(num)) notFound();
  if (num === "5") redirect(`${base}/sistemas`);
  const page = pageNumFor(num, index);
  if (page !== num) redirect(`${base}/secao/${page}#s-${num}`);

  const [rows, attachments] = await Promise.all([manualSectionsUnder(manual.id, num), manualAttachments(manual.id, num)]);
  const s = rows.find((r) => r.num === num);
  if (!s) notFound();
  const byNum = new Map(index.map((x) => [x.num, x]));
  const countUnder = (n: string) => attachments.filter((a) => a.section_num === n || a.section_num.startsWith(n + ".")).length;

  // Trilha: Início › (Sistemas) › capítulo › …
  const crumbs: Array<{ href?: string; label: string }> = [{ href: base, label: "Início" }];
  if (num.startsWith("5.")) crumbs.push({ href: `${base}/sistemas`, label: "Sistemas da edificação" });
  for (let q = parentNum(num); q; q = parentNum(q)) {
    if (q !== "5") crumbs.splice(num.startsWith("5.") ? 2 : 1, 0, { href: `${base}/secao/${q}`, label: byNum.get(q)?.title ?? q });
  }
  crumbs.push({ label: s.title });

  const seq = readingSequence(index);
  const k = seq.indexOf(num);
  const prev = k > 0 ? byNum.get(seq[k - 1]!) : null;
  const next = k >= 0 && k < seq.length - 1 ? byNum.get(seq[k + 1]!) : null;

  const system = isSystem(s);
  const icon = num.startsWith("5.") ? systemIcon(s.title) : (CHAPTER_ICONS[chapterOf(num)] ?? "book");
  const eyebrow = s.level === 1 ? `Capítulo ${num}` : `${num.startsWith("5.") ? "Sistema" : `Capítulo ${chapterOf(num)}`} · ${num}`;
  const children = index.filter((x) => parentNum(x.num) === num);
  const descendants = rows.filter((r) => r.num !== num);
  const body = s.html + descendants.map((d) => `<h3 id="s-${d.num}">${d.num} · ${escapeHtml(d.title)}</h3>${d.html}`).join("");

  return (
    <article>
      <Crumbs items={crumbs} />
      <ManualTitle icon={icon} tone={sectionTone(num)} eyebrow={eyebrow} title={s.title} />

      {s.level === 1 ? (
        <>
          {s.html.trim() && <Prose html={s.html} className="max-w-3xl mb-10" />}
          {children.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {children.map((c) => (
                <li key={c.num}>
                  <Link href={`${base}/secao/${c.num}`} className="h-full flex items-start gap-3 p-4 bg-surface border border-line rounded-[var(--radius-md)] hover:border-ink">
                    <span className="text-ink-mute tabular-nums text-sm pt-0.5 w-10 shrink-0">{c.num}</span>
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">{c.title}</span>
                      {countUnder(c.num) > 0 && <span className="text-xs text-ink-mute">{countUnder(c.num)} {countUnder(c.num) === 1 ? "anexo" : "anexos"}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : system ? (
        <Panes panes={splitPanes(body).map((x) => ({ ...x, label: PANE_LABELS[x.key] }))} />
      ) : (
        // Cada subseção com o seu texto e, logo abaixo, as linhas de anexo dela.
        [s, ...descendants].map((r) => {
          const atts = attachments.filter((a) => a.section_num === r.num);
          return (
            <section key={r.num} aria-labelledby={r === s ? undefined : `s-${r.num}`}>
              {r !== s && (
                <h3 id={`s-${r.num}`} className="font-display text-xl text-ink mt-10 mb-3 scroll-mt-24">
                  {r.num} · {r.title}
                </h3>
              )}
              <Prose html={withoutLines(r.html, atts.map((a) => a.title))} className="max-w-3xl" />
              <AttachmentRows items={atts} className="mt-3" />
            </section>
          );
        })
      )}

      {system && attachments.length > 0 && (
        <section className="mt-10">
          <h3 className="font-display text-xl mb-3">Anexos</h3>
          <AttachmentRows items={attachments} />
        </section>
      )}

      {num.startsWith("2") && (
        <p className="mt-10 text-sm">
          <Link href={`${base}/garantias`} className="underline underline-offset-4">Ver a tabela de prazos de garantia</Link>
        </p>
      )}

      <nav aria-label="Continuar a leitura" className="grid grid-cols-2 gap-3 mt-12 pt-6 border-t border-line">
        {prev ? (
          <Link href={`${base}/secao/${prev.num}`} className="flex flex-col gap-1 p-4 rounded-[var(--radius-md)] hover:bg-sand">
            <span className="eyebrow">Anterior</span>
            <span className="text-sm">{prev.num} · {prev.title}</span>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`${base}/secao/${next.num}`} className="flex flex-col gap-1 p-4 rounded-[var(--radius-md)] hover:bg-sand text-right items-end">
            <span className="eyebrow flex items-center gap-1">Próxima <Icon name="chev" className="size-3.5" /></span>
            <span className="text-sm">{next.num} · {next.title}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
