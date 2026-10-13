import { Badge, Card, CheckboxField, PageHeader, SectionTitle, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { saveNews, updateSiteSection } from "@/server/actions/admin/content";
import { formatDateTime, utcToBrasiliaLocalInput } from "@/lib/format";

export const metadata = { title: "Conteúdo do site" };
const SECTION_NAMES: Record<string, string> = { hero: "Destaque da página inicial", sobre: "A OUZ", atuacao: "Atuação", diferenciais: "Diferenciais" };
const ORDER = ["hero", "sobre", "atuacao", "diferenciais"];

export default async function ContentPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["conteudo"], "/admin/conteudo");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: sections }, { data: news }] = await Promise.all([
    supabase.from("site_sections").select("*"),
    supabase.from("news_posts").select("id, slug, title, excerpt, body, published_at, is_demo").order("created_at", { ascending: false }),
  ]);
  const sorted = (sections ?? []).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return (
    <>
      <PageHeader eyebrow="Administração" title="Conteúdo do site" description="Textos institucionais e novidades da área pública." />
      <Flash searchParams={searchParams} />
      <section className="mb-16 flex flex-col gap-4">
        <SectionTitle title="Seções institucionais" />
        {sorted.map((s) => {
          const items = (s.items ?? []) as Array<{ title: string; text: string }>;
          const withItems = s.key === "atuacao" || s.key === "diferenciais";
          return (
            <Card key={s.key} className="p-5">
              <details>
                <summary className="cursor-pointer flex items-center gap-3">
                  <span className="font-medium">{SECTION_NAMES[s.key]}</span>
                  {s.is_placeholder && <Badge tone="warning">Texto provisório</Badge>}
                </summary>
                <form action={updateSiteSection} className="mt-5 flex flex-col gap-4">
                  <input type="hidden" name="key" value={s.key} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Sobretítulo" name="eyebrow" id={`${s.key}-eyebrow`} defaultValue={s.eyebrow ?? ""} />
                    <TextField label="Título" name="title" id={`${s.key}-title`} required defaultValue={s.title} />
                  </div>
                  <TextArea label="Texto" name="body" id={`${s.key}-body`} defaultValue={s.body ?? ""} rows={4} />
                  {withItems &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                        <TextField label={`Item ${i + 1} — título`} name={`item_title_${i}`} id={`${s.key}-it-${i}`} defaultValue={items[i]?.title ?? ""} />
                        <TextField label="Descrição" name={`item_text_${i}`} id={`${s.key}-ix-${i}`} defaultValue={items[i]?.text ?? ""} />
                      </div>
                    ))}
                  {s.key === "hero" && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="hero-image" className="text-sm font-medium">Fotografia principal</label>
                      <input id="hero-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="text-sm" />
                    </div>
                  )}
                  <SubmitButton size="sm" className="self-start">Salvar seção</SubmitButton>
                </form>
              </details>
            </Card>
          );
        })}
      </section>

      <section>
        <SectionTitle title="Novidades" />
        <Card className="p-6 mb-6">
          <h3 className="font-display text-xl mb-4">Nova novidade</h3>
          <NewsForm />
        </Card>
        <div className="flex flex-col gap-4">
          {(news ?? []).map((n) => (
            <Card key={n.id} className="p-5">
              <details>
                <summary className="cursor-pointer flex flex-wrap items-center gap-3">
                  <span className="font-medium">{n.title}</span>
                  {n.published_at ? <Badge tone="success">Publicada {formatDateTime(n.published_at)}</Badge> : <Badge>Rascunho</Badge>}
                  {n.is_demo && <Badge tone="warning">Demonstrativo</Badge>}
                </summary>
                <div className="mt-5"><NewsForm post={n} /></div>
              </details>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

function NewsForm({ post }: { post?: { id: string; slug: string; title: string; excerpt: string | null; body: string | null; published_at: string | null } }) {
  const p = post?.id ?? "novo";
  return (
    <form action={saveNews} className="flex flex-col gap-4">
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Título" name="title" id={`${p}-t`} required defaultValue={post?.title} />
        <TextField label="Identificador na URL" name="slug" id={`${p}-s`} required defaultValue={post?.slug} />
      </div>
      <TextArea label="Resumo" name="excerpt" id={`${p}-e`} rows={2} defaultValue={post?.excerpt ?? ""} />
      <TextArea label="Texto" name="body" id={`${p}-b`} rows={6} defaultValue={post?.body ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <TextField label="Data de publicação (horário de Brasília)" name="published_at" id={`${p}-d`} type="datetime-local" defaultValue={utcToBrasiliaLocalInput(post?.published_at)} />
        <CheckboxField name="publish" id={`${p}-p`} label="Publicado" defaultChecked={Boolean(post?.published_at)} />
      </div>
      <SubmitButton size="sm" className="self-start">Salvar</SubmitButton>
    </form>
  );
}
