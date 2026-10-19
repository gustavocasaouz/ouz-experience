import { Badge, Button, Card, CheckboxField, EmptyState, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { addAttachment, removeAttachment, setAttachmentFile, updateManual } from "@/server/actions/admin/manuals";
import { MANUAL_KIND_LABELS, type ManualKind } from "@/lib/manual";
import { formatDateTime } from "@/lib/format";

export default async function DevelopmentManuals({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["conteudo"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const supabase = await createSupabaseServerClient();
  const [{ data: manuals }, { data: attachments }] = await Promise.all([
    supabase
      .from("development_manuals")
      .select("id, kind, title, unit_id, unit:units(code), is_published, pdf_document_id, updated_at, sections:manual_sections(count), warranty:manual_warranty_items(count), tasks:manual_maintenance_tasks(count)")
      .eq("development_id", dev.id)
      .order("kind"),
    supabase.from("manual_attachments").select("id, manual_id, section_num, title, document_id, manual:development_manuals!inner(development_id)").eq("manual.development_id", dev.id).order("section_num").order("sort_order"),
  ]);
  type Att = { id: string; manual_id: string; section_num: string; title: string; document_id: string | null };
  type Row = {
    id: string; kind: ManualKind; title: string; unit_id: string | null; unit: { code: string } | null; is_published: boolean; pdf_document_id: string | null; updated_at: string;
    sections: Array<{ count: number }>; warranty: Array<{ count: number }>; tasks: Array<{ count: number }>;
  };
  const rows = ((manuals ?? []) as unknown as Row[]).sort((a, b) => a.kind.localeCompare(b.kind) || (a.unit?.code ?? "").localeCompare(b.unit?.code ?? ""));
  // Arquivos: do empreendimento e, para manuais de unidade, da própria unidade.
  const unitIds = rows.map((m) => m.unit_id).filter((u): u is string => Boolean(u));
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, category, visible_to_client, unit_id")
    .or(`development_id.eq.${dev.id}${unitIds.length ? `,unit_id.in.(${unitIds.join(",")})` : ""}`)
    .order("title");
  type Doc = { id: string; title: string; category: string; visible_to_client: boolean; unit_id: string | null };
  const docOptions = (m: Row) => [
    { value: "", label: "Sem arquivo" },
    ...((docs ?? []) as Doc[])
      .filter((d) => !d.unit_id || d.unit_id === m.unit_id)
      .sort((a, b) => Number(Boolean(b.unit_id)) - Number(Boolean(a.unit_id)) || Number(b.category === "manual") - Number(a.category === "manual"))
      .map((d) => ({ value: d.id, label: `${d.title}${d.unit_id ? ` · unidade ${m.unit?.code}` : ""}${d.visible_to_client ? "" : " (oculto aos clientes)"}` })),
  ];

  return (
    <>
      <DevelopmentHeader dev={dev} tab="manuais" />
      <Flash searchParams={searchParams} />
      <p className="text-sm text-ink-soft max-w-2xl mb-8">
        O conteúdo dos manuais (seções, prazos de garantia e plano de manutenção) é importado do manual oficial pela equipe técnica. Aqui você publica o manual
        para os clientes do empreendimento e escolhe o PDF completo, enviado antes em Acompanhamento › Manuais e documentos do empreendimento.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Nenhum manual importado">Peça a importação do manual do proprietário ou do condomínio deste empreendimento.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map((m) => (
            <Card key={m.id} className="p-6">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="eyebrow">{MANUAL_KIND_LABELS[m.kind]}{m.unit ? ` · unidade ${m.unit.code}` : " · todo o empreendimento"}</p>
                <Badge tone={m.is_published ? "success" : "neutral"}>{m.is_published ? "Publicado" : "Não publicado"}</Badge>
              </div>
              <p className="font-display text-2xl">{m.title}</p>
              <p className="text-sm text-ink-mute mt-1">
                {m.sections[0]?.count ?? 0} seções · {m.warranty[0]?.count ?? 0} itens de garantia · {m.tasks[0]?.count ?? 0} atividades de manutenção · atualizado em {formatDateTime(m.updated_at)}
              </p>
              <form action={updateManual} className="mt-6 grid gap-4 sm:grid-cols-2 items-end">
                <input type="hidden" name="development_id" value={dev.id} />
                <input type="hidden" name="manual_id" value={m.id} />
                <SelectField label="PDF completo" name="pdf_document_id" id={`pdf-${m.id}`} defaultValue={m.pdf_document_id ?? ""} options={docOptions(m)} />
                <CheckboxField name="is_published" id={`pub-${m.id}`} label={m.unit ? `Publicado para o(s) cliente(s) da unidade ${m.unit.code}` : "Publicado para os clientes do empreendimento"} defaultChecked={m.is_published} />
                <SubmitButton size="sm" className="self-start">Salvar</SubmitButton>
              </form>

              <div className="mt-10">
                <p className="font-medium">Anexos</p>
                <p className="text-sm text-ink-mute mb-4">
                  Linhas de anexos das seções (plantas, ART, projetos). O cliente baixa o arquivo; sem arquivo, a linha aparece como “Em breve”. Envie o arquivo
                  antes em Acompanhamento › Manuais e documentos do empreendimento (visível aos clientes).
                </p>
                <ul className="divide-y divide-line border-y border-line">
                  {((attachments ?? []) as Att[]).filter((a) => a.manual_id === m.id).map((a) => (
                    <li key={a.id} className="py-3 grid gap-3 md:grid-cols-[1fr_20rem_auto] md:items-end">
                      <p className="text-sm">
                        <span className="text-ink-mute tabular-nums mr-2">{a.section_num}</span>
                        {a.title}
                        {!a.document_id && <Badge className="ml-2">Sem arquivo</Badge>}
                      </p>
                      <form action={setAttachmentFile} className="flex gap-2 items-end">
                        <input type="hidden" name="development_id" value={dev.id} />
                        <input type="hidden" name="attachment_id" value={a.id} />
                        <SelectField label="Arquivo" name="document_id" id={`att-${a.id}`} defaultValue={a.document_id ?? ""} options={docOptions(m)} className="flex-1" />
                        <SubmitButton size="sm" variant="secondary">Salvar</SubmitButton>
                      </form>
                      <form action={removeAttachment}>
                        <input type="hidden" name="development_id" value={dev.id} />
                        <input type="hidden" name="attachment_id" value={a.id} />
                        <Button type="submit" size="sm" variant="ghost">Remover</Button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addAttachment} className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_16rem_auto] items-end">
                  <input type="hidden" name="development_id" value={dev.id} />
                  <input type="hidden" name="manual_id" value={m.id} />
                  <TextField label="Seção" name="section_num" id={`new-sec-${m.id}`} placeholder="10.2.4" required />
                  <TextField label="Nome do anexo" name="title" id={`new-title-${m.id}`} placeholder="Planta baixa do térreo" required />
                  <SelectField label="Arquivo" name="document_id" id={`new-doc-${m.id}`} options={docOptions(m)} />
                  <SubmitButton size="sm">Adicionar anexo</SubmitButton>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
