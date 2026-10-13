import { Badge, Card, CheckboxField, EmptyState, RestrictedState, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { toggleMaterial, updateBrokerContent, uploadMaterial } from "@/server/actions/admin/developments";
import { formatDateTime } from "@/lib/format";

const KINDS = [
  { value: "apresentacao", label: "Apresentação" },
  { value: "planta", label: "Planta" },
  { value: "material_comercial", label: "Material comercial" },
  { value: "tabela", label: "Tabela" },
  { value: "comunicado", label: "Comunicado" },
  { value: "outro", label: "Outro" },
];

export default async function DevelopmentRestricted({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const canEdit = hasPermission(viewer, "conteudo");
  const supabase = await createSupabaseServerClient();
  const [{ data: c }, { data: materials }] = await Promise.all([
    supabase.from("development_broker_content").select("*").eq("development_id", dev.id).maybeSingle(),
    supabase.from("broker_materials").select("id, kind, title, storage_path, is_published, created_at").eq("development_id", dev.id).order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <DevelopmentHeader dev={dev} tab="restrito" />
      <Flash searchParams={searchParams} />
      {!canEdit && <div className="mb-8"><RestrictedState title="Somente leitura">Edição exige a permissão “Conteúdo”.</RestrictedState></div>}
      <div className="flex flex-col gap-14">
        <section>
          <SectionTitle eyebrow="Somente corretores autorizados" title="Conteúdo restrito" />
          <Card className="p-6">
            <form action={updateBrokerContent} className="flex flex-col gap-5">
              <input type="hidden" name="id" value={dev.id} />
              <fieldset disabled={!canEdit} className="flex flex-col gap-5">
                <TextArea label="Apresentação" name="presentation" rows={5} defaultValue={c?.presentation ?? ""} />
                <TextArea label="Diferenciais (um por linha)" name="highlights" rows={4} defaultValue={((c?.highlights ?? []) as string[]).join("\n")} />
                <TextArea label="Condições de pagamento" name="payment_conditions" rows={3} defaultValue={c?.payment_conditions ?? ""} hint="Texto informativo. Políticas de venda configuráveis chegam na Etapa 2." />
                <TextArea label="Informações antecipadas" name="early_information" rows={3} defaultValue={c?.early_information ?? ""} />
              </fieldset>
              {canEdit && <SubmitButton className="self-start">Salvar</SubmitButton>}
            </form>
          </Card>
        </section>
        <section>
          <SectionTitle title="Materiais (plantas, apresentações, tabelas)" />
          {canEdit && (
            <Card className="p-6 mb-6">
              <form action={uploadMaterial} className="grid gap-5 sm:grid-cols-2">
                <input type="hidden" name="id" value={dev.id} />
                <SelectField label="Tipo" name="kind" required options={KINDS} />
                <TextField label="Título" name="title" required />
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor="material-file" className="text-sm font-medium">Arquivo <span className="text-ink-mute font-normal">(PDF ou imagem, até 50 MB)</span></label>
                  <input id="material-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm" />
                </div>
                <CheckboxField name="is_published" label="Publicar imediatamente para corretores autorizados" />
                <SubmitButton className="self-start">Enviar material</SubmitButton>
              </form>
            </Card>
          )}
          {!materials?.length ? (
            <EmptyState title="Nenhum material enviado" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {materials.map((m) => (
                <li key={m.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                  <span className="flex items-center gap-3">
                    <Badge>{KINDS.find((k) => k.value === m.kind)?.label}</Badge>
                    <a href={`/arquivos/broker-content/${m.storage_path}`} target="_blank" rel="noopener" className="hover:underline underline-offset-4">{m.title}</a>
                    <span className="text-xs text-ink-mute">{formatDateTime(m.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={m.is_published ? "success" : "neutral"}>{m.is_published ? "Publicado" : "Rascunho"}</Badge>
                    {canEdit && (
                      <form action={toggleMaterial}>
                        <input type="hidden" name="development_id" value={dev.id} />
                        <input type="hidden" name="material_id" value={m.id} />
                        <input type="hidden" name="publish" value={m.is_published ? "0" : "1"} />
                        <button className="text-sm underline underline-offset-4">{m.is_published ? "Despublicar" : "Publicar"}</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
