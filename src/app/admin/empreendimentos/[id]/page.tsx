import { Card, CheckboxField, SectionTitle, SelectField, TextArea, TextField, RestrictedState } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { publicMediaUrl } from "@/server/db/supabase-public";
import { hasPermission } from "@/server/auth/viewer";
import { updateDevelopment, updatePublicContent, updateTeaser } from "@/server/actions/admin/developments";
import { STAGE_LABELS } from "@/lib/labels";

const fileInput = "text-sm file:mr-4 file:border file:border-ink file:bg-transparent file:px-4 file:py-2 file:text-sm";

export default async function DevelopmentGeneral({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const canEdit = hasPermission(viewer, "conteudo");
  const supabase = await createSupabaseServerClient();
  const [{ data: pc }, { data: teaser }] = await Promise.all([
    supabase.from("development_public_content").select("*").eq("development_id", dev.id).maybeSingle(),
    supabase.from("development_teasers").select("*").eq("development_id", dev.id).maybeSingle(),
  ]);
  const cover = publicMediaUrl(pc?.cover_image_path);
  const teaserImg = publicMediaUrl(teaser?.image_path);

  return (
    <>
      <DevelopmentHeader dev={dev} tab="geral" />
      <Flash searchParams={searchParams} />
      {!canEdit ? (
        <RestrictedState>Edição de conteúdo exige a permissão “Conteúdo”.</RestrictedState>
      ) : (
        <div className="flex flex-col gap-14">
          <section>
            <SectionTitle title="Dados gerais" />
            <Card className="p-6">
              <form action={updateDevelopment} className="grid gap-5 sm:grid-cols-2">
                <input type="hidden" name="id" value={dev.id} />
                <TextField label="Nome" name="name" required defaultValue={dev.name} />
                <TextField label="Identificador na URL" name="slug" required defaultValue={dev.slug} />
                <SelectField label="Fase" name="stage" required defaultValue={dev.stage} options={Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }))} />
                <TextField label="Cidade" name="city" required defaultValue={dev.city} />
                <TextField label="Ordem de exibição" name="sort_order" type="number" min={0} defaultValue={String(dev.sort_order)} />
                <CheckboxField name="is_published" label="Publicado na área pública" defaultChecked={dev.is_published} className="sm:mt-8" />
                <SubmitButton className="self-start">Salvar dados gerais</SubmitButton>
              </form>
            </Card>
          </section>

          <section>
            <SectionTitle eyebrow="Visível a qualquer visitante" title="Conteúdo público" />
            <Card className="p-6">
              <form action={updatePublicContent} className="flex flex-col gap-5">
                <input type="hidden" name="id" value={dev.id} />
                <p className="text-sm bg-warning-soft text-warning p-3">Não inclua preços, prazos, disponibilidade ou condições comerciais aqui.</p>
                <TextField label="Chamada" name="headline" defaultValue={pc?.headline ?? ""} />
                <TextArea label="Resumo" name="summary" rows={2} defaultValue={pc?.summary ?? ""} />
                <TextArea label="Texto" name="body" rows={6} defaultValue={pc?.body ?? ""} />
                <TextField label="Bairro" name="neighborhood" defaultValue={pc?.neighborhood ?? ""} />
                <TextArea label="Diferenciais (um por linha)" name="highlights" rows={4} defaultValue={((pc?.highlights ?? []) as string[]).join("\n")} />
                <div className="flex flex-col gap-2">
                  <label htmlFor="cover" className="text-sm font-medium">Imagem de capa <span className="text-ink-mute font-normal">(JPG, PNG, WebP ou AVIF até 15 MB)</span></label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover && <img src={cover} alt="Capa atual" className="w-64 aspect-[4/3] object-cover border border-line" />}
                  <input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={fileInput} />
                </div>
                <SubmitButton className="self-start">Salvar conteúdo público</SubmitButton>
              </form>
            </Card>
          </section>

          <section>
            <SectionTitle eyebrow="Visível a corretores sem acesso completo" title="Teaser “Em breve”" />
            <Card className="p-6">
              <form action={updateTeaser} className="flex flex-col gap-5">
                <input type="hidden" name="id" value={dev.id} />
                <p className="text-sm text-ink-soft">O teaser é um conteúdo separado. Nunca inclua preço, planta ou arquivo restrito.</p>
                <TextField label="Título" name="title" defaultValue={teaser?.title ?? "Em breve"} required />
                <TextArea label="Mensagem" name="message" rows={3} defaultValue={teaser?.message ?? ""} />
                <div className="flex flex-col gap-2">
                  <label htmlFor="teaser-image" className="text-sm font-medium">Imagem</label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {teaserImg && <img src={teaserImg} alt="Imagem atual do teaser" className="w-64 aspect-[4/3] object-cover border border-line" />}
                  <input id="teaser-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={fileInput} />
                </div>
                <SubmitButton className="self-start">Salvar teaser</SubmitButton>
              </form>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
