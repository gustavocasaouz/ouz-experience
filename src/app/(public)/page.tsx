import Link from "next/link";
import Image from "next/image";
import { ButtonLink, EmptyState, ImagePlaceholder, SectionTitle, Badge } from "@/design-system";
import { DevelopmentCard } from "@/components/development-card";
import { getSiteSections, listNews, listPublicEvents, listPublishedDevelopments } from "@/server/queries/public";
import { publicMediaUrl } from "@/server/db/supabase-public";
import { formatDateTime, formatLongDate } from "@/lib/format";

export default async function HomePage() {
  const [sections, developments, news, events] = await Promise.all([
    getSiteSections(),
    listPublishedDevelopments(),
    listNews(3),
    listPublicEvents(),
  ]);
  const hero = sections.hero;
  const heroImg = publicMediaUrl(hero?.image_path);

  return (
    <>
      <section className="relative">
        <div className="relative h-[78svh] min-h-[520px] w-full overflow-hidden">
          {heroImg ? (
            <Image src={heroImg} alt="" fill priority sizes="100vw" className="object-cover" />
          ) : (
            <ImagePlaceholder label="Fotografia principal a definir" className="absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="container-page pb-14 md:pb-20 text-paper">
              <p className="eyebrow !text-paper/80 mb-4">{hero?.eyebrow ?? "Florianópolis"}</p>
              <h1 className="font-display text-5xl md:text-7xl leading-[1.02] max-w-3xl">{hero?.title ?? "OUZ"}</h1>
              {hero?.body && <p className="mt-5 max-w-xl text-paper/85">{hero.body}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/empreendimentos" size="lg" className="!bg-paper !text-ink hover:!bg-sand">
                  Conheça os empreendimentos
                </ButtonLink>
                <ButtonLink href="/interesse" size="lg" variant="secondary" className="!border-paper !text-paper hover:!bg-paper hover:!text-ink">
                  Tenho interesse
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {sections.sobre && (
        <section id="a-ouz" className="container-page py-20 md:py-28 grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <SectionTitle eyebrow={sections.sobre.eyebrow ?? "A OUZ"} title={sections.sobre.title} />
          </div>
          <div className="md:col-span-7 text-lg leading-relaxed text-ink-soft whitespace-pre-line">{sections.sobre.body}</div>
        </section>
      )}

      <section className="bg-surface border-y border-line">
        <div className="container-page py-20 md:py-28">
          <div className="flex items-end justify-between gap-6 mb-10">
            <SectionTitle eyebrow="Empreendimentos" title="Nossos projetos" className="!mb-0" />
            <Link href="/empreendimentos" className="text-sm underline underline-offset-4 hidden sm:inline">
              Ver todos
            </Link>
          </div>
          {developments.length === 0 ? (
            <EmptyState title="Em breve">Os empreendimentos serão publicados aqui.</EmptyState>
          ) : (
            <div className="grid gap-10 md:grid-cols-3">
              {developments.map((d) => (
                <DevelopmentCard
                  key={d.id}
                  href={`/empreendimentos/${d.slug}`}
                  name={d.name}
                  stage={d.stage}
                  summary={d.content?.summary}
                  coverPath={d.content?.cover_image_path}
                  isDemo={d.is_demo}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {sections.atuacao && (
        <section className="container-page py-20 md:py-28">
          <SectionTitle eyebrow={sections.atuacao.eyebrow ?? "Atuação"} title={sections.atuacao.title} />
          {sections.atuacao.body && <p className="max-w-2xl text-ink-soft mb-10">{sections.atuacao.body}</p>}
          <ol className="grid gap-px bg-line md:grid-cols-3 border border-line">
            {sections.atuacao.items.map((item, i) => (
              <li key={i} className="bg-paper p-8 flex flex-col gap-3">
                <span className="font-display text-4xl text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-2xl">{item.title}</h3>
                <p className="text-sm text-ink-soft">{item.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {sections.diferenciais && (
        <section className="bg-ink text-paper">
          <div className="container-page py-20 md:py-28">
            <p className="eyebrow !text-paper/60 mb-2">{sections.diferenciais.eyebrow ?? "Diferenciais"}</p>
            <h2 className="font-display text-3xl md:text-4xl mb-12">{sections.diferenciais.title}</h2>
            <ul className="grid gap-10 md:grid-cols-3">
              {sections.diferenciais.items.map((item, i) => (
                <li key={i} className="border-t border-paper/20 pt-6">
                  <h3 className="font-display text-2xl mb-2">{item.title}</h3>
                  <p className="text-sm text-paper/70">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="container-page py-20 md:py-28 grid gap-16 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Novidades" title="Últimas notícias" />
          {news.length === 0 ? (
            <EmptyState title="Sem novidades por enquanto" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {news.map((n) => (
                <li key={n.id}>
                  <Link href={`/novidades/${n.slug}`} className="block py-5 group">
                    <p className="text-xs text-ink-mute mb-1">
                      {formatLongDate(n.published_at)} {n.is_demo && <Badge tone="warning" className="ml-2">Demonstrativo</Badge>}
                    </p>
                    <h3 className="font-display text-xl group-hover:underline underline-offset-4">{n.title}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionTitle eyebrow="Eventos" title="Agenda aberta" />
          {events.upcoming.length === 0 ? (
            <EmptyState title="Nenhum evento público agendado" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {events.upcoming.slice(0, 3).map((e) => (
                <li key={e.id} className="py-5">
                  <p className="text-xs text-ink-mute mb-1">{formatDateTime(e.starts_at)}</p>
                  <h3 className="font-display text-xl">{e.title}</h3>
                  {e.location_text && <p className="text-sm text-ink-soft">{e.location_text}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-t border-line bg-sand/60">
        <div className="container-page py-16 grid gap-6 md:grid-cols-2">
          <Link href="/entrar?next=/cliente" className="group bg-surface border border-line p-8 md:p-10 flex flex-col gap-3 hover:border-ink transition-colors">
            <p className="eyebrow">Clientes OUZ</p>
            <h2 className="font-display text-3xl">Área do cliente</h2>
            <p className="text-sm text-ink-soft">Acompanhe sua unidade, documentos, financeiro e solicitações.</p>
            <span className="text-sm mt-2 underline underline-offset-4">Entrar</span>
          </Link>
          <Link href="/corretor" className="group bg-surface border border-line p-8 md:p-10 flex flex-col gap-3 hover:border-ink transition-colors">
            <p className="eyebrow">Parceiros</p>
            <h2 className="font-display text-3xl">Portal do corretor</h2>
            <p className="text-sm text-ink-soft">Cadastre-se, acesse materiais autorizados e acompanhe suas propostas.</p>
            <span className="text-sm mt-2 underline underline-offset-4">Acessar ou cadastrar</span>
          </Link>
        </div>
      </section>
    </>
  );
}
