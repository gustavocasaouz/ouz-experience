import { notFound } from "next/navigation";
import { EmptyState, SectionTitle } from "@/design-system";
import { myUnit, developmentFeed } from "@/server/queries/client-unit";
import { formatDate, formatDateTime, formatLongDate } from "@/lib/format";
import { MILESTONE_STAGE_LABELS } from "@/lib/labels";

const d = (v: string | null) => (v ? formatDate(v + "T12:00:00Z") : "a definir");

export default async function ClientProgress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const feed = await developmentFeed(u.development.id, id);
  return (
    <div className="flex flex-col gap-14">
      <section>
        <SectionTitle title="Linha do tempo" />
        {feed.milestones.length === 0 ? (
          <EmptyState title="Linha do tempo ainda não publicada" />
        ) : (
          <ol className="border-l border-line pl-6 flex flex-col gap-6">
            {feed.milestones.map((m) => {
              const history = feed.changes.filter((c) => c.milestone_id === m.id);
              return (
                <li key={m.id} className="relative">
                  <span aria-hidden className={`absolute -left-[31px] top-1 size-3 rounded-full border-2 ${m.completed_on ? "bg-ink border-ink" : "bg-paper border-accent"}`} />
                  <p className="eyebrow">{MILESTONE_STAGE_LABELS[m.stage]}</p>
                  <p className="font-display text-xl">{m.title}</p>
                  <p className="text-sm text-ink-soft">
                    {m.completed_on ? `Concluído em ${d(m.completed_on)}` : `Previsão: ${d(m.forecast_date)}`}
                  </p>
                  {m.description && <p className="text-sm text-ink-soft mt-1">{m.description}</p>}
                  {history.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-ink-mute">Histórico de alterações da previsão ({history.length})</summary>
                      <ul className="mt-2 space-y-1">
                        {history.map((c, i) => (
                          <li key={i} className="text-ink-soft">
                            {formatDateTime(c.changed_at)}: {d(c.previous_date)} → {d(c.new_date)} — {c.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section>
        <SectionTitle title="Evolução física" />
        {feed.progress.length === 0 ? (
          <EmptyState title="Sem relatórios publicados" />
        ) : (
          <ul className="flex flex-col gap-6">
            {feed.progress.map((p) => (
              <li key={p.id} className="border border-line bg-surface p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-display text-3xl">{Number(p.overall_percent).toLocaleString("pt-BR")}%</p>
                  <p className="text-sm text-ink-mute">Referência: {d(p.reference_date)}</p>
                </div>
                {p.items?.length > 0 && (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {p.items.map((it, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex justify-between"><span>{it.label}</span><span>{it.percent}%</span></div>
                        <div className="h-1.5 bg-sand mt-1"><div className="h-1.5 bg-accent" style={{ width: `${Math.min(100, Math.max(0, it.percent))}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
                {p.notes && <p className="text-sm text-ink-soft mt-3">{p.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle title="Atualizações" />
        {feed.updates.length === 0 ? (
          <EmptyState title="Sem atualizações publicadas" />
        ) : (
          <ul className="flex flex-col gap-10">
            {feed.updates.map((up) => (
              <li key={up.id}>
                <p className="text-xs text-ink-mute">{formatLongDate(up.published_at)}</p>
                <h3 className="font-display text-2xl">{up.title}</h3>
                {up.body && <p className="text-ink-soft whitespace-pre-line mt-2">{up.body}</p>}
                {up.media.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 mt-4">
                    {up.media.sort((a, b) => a.sort_order - b.sort_order).map((m) =>
                      m.kind === "imagem" && m.storage_path ? (
                        <figure key={m.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/arquivos/client-media/${m.storage_path}`} alt={m.caption ?? "Foto da obra"} className="w-full aspect-[4/3] object-cover bg-sand" loading="lazy" />
                          {m.caption && <figcaption className="text-xs text-ink-mute mt-1">{m.caption}</figcaption>}
                        </figure>
                      ) : m.kind === "video" && m.storage_path ? (
                        <video key={m.id} controls preload="none" className="w-full bg-ink" src={`/arquivos/client-media/${m.storage_path}`} />
                      ) : m.external_url ? (
                        <a key={m.id} href={m.external_url} target="_blank" rel="noopener noreferrer" className="border border-line p-4 text-sm underline underline-offset-4">
                          Assistir vídeo{m.caption ? `: ${m.caption}` : ""}
                        </a>
                      ) : null,
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
