import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, ImagePlaceholder } from "@/design-system";
import { STAGE_LABELS } from "@/lib/labels";
import { getPublishedDevelopment } from "@/server/queries/public";
import { publicMediaUrl } from "@/server/db/supabase-public";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await getPublishedDevelopment((await params).slug);
  return { title: d?.name ?? "Empreendimento" };
}

/** Somente conteúdo PÚBLICO. Preços, plantas, tabelas e disponibilidade nunca são carregados aqui. */
export default async function DevelopmentPage({ params }: Props) {
  const d = await getPublishedDevelopment((await params).slug);
  if (!d) notFound();
  const cover = publicMediaUrl(d.content?.cover_image_path);
  const gallery = (d.content?.gallery ?? []).map((g) => ({ url: publicMediaUrl(g.path), alt: g.alt ?? "" })).filter((g) => g.url);

  return (
    <article>
      <div className="relative h-[60svh] min-h-[420px] overflow-hidden">
        {cover ? (
          <Image src={cover} alt={`Fachada do ${d.name}`} fill priority sizes="100vw" className="object-cover" />
        ) : (
          <ImagePlaceholder label={`${d.name} — imagem a definir`} className="absolute inset-0" />
        )}
      </div>
      <div className="container-page py-14 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge tone="accent">{STAGE_LABELS[d.stage]}</Badge>
            {d.is_demo && <Badge tone="warning">Conteúdo demonstrativo</Badge>}
          </div>
          <h1 className="font-display text-5xl md:text-6xl tracking-wide">{d.name}</h1>
          <p className="eyebrow mt-3">
            {d.content?.neighborhood ? `${d.content.neighborhood} · ` : ""}
            {d.city}
          </p>
          {d.content?.headline && <p className="font-display text-2xl mt-8">{d.content.headline}</p>}
          {d.content?.summary && <p className="mt-4 text-lg text-ink-soft">{d.content.summary}</p>}
          {d.content?.body && <div className="mt-6 text-ink-soft leading-relaxed whitespace-pre-line">{d.content.body}</div>}
        </div>
        <aside className="lg:col-span-5 flex flex-col gap-8">
          {d.content?.highlights?.length ? (
            <div>
              <p className="eyebrow mb-4">Diferenciais</p>
              <ul className="divide-y divide-line border-y border-line">
                {d.content.highlights.map((h, i) => (
                  <li key={i} className="py-3">{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="bg-surface border border-line p-6 flex flex-col gap-3">
            <p className="font-display text-xl">Quer saber mais sobre o {d.name}?</p>
            <p className="text-sm text-ink-soft">Deixe seu contato e a equipe da OUZ retorna.</p>
            <ButtonLink href={`/interesse?empreendimento=${d.slug}`}>Tenho interesse</ButtonLink>
          </div>
        </aside>
      </div>
      {gallery.length > 0 && (
        <div className="container-page pb-20 grid gap-4 md:grid-cols-2">
          {gallery.map((g, i) => (
            <div key={i} className="relative aspect-[4/3] bg-sand">
              <Image src={g.url!} alt={g.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
