import { Badge, Card, CheckboxField, EmptyState, RestrictedState, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import {
  addAnnouncement, addMilestone, addProgressReport, changeForecast, createDocument, publishAnnouncement, publishUpdate, toggleUpdate, updateMilestone,
} from "@/server/actions/admin/experience";
import { DOCUMENT_CATEGORY_LABELS, MILESTONE_STAGE_LABELS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";

const d = (v: string | null) => (v ? formatDate(v + "T12:00:00Z") : "—");

export default async function DevelopmentFollowUp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas", "documentos"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const canContent = hasPermission(viewer, "conteudo");
  const canDocs = hasPermission(viewer, "documentos");
  const supabase = await createSupabaseServerClient();
  const [{ data: milestones }, { data: updates }, { data: reports }, { data: announcements }, { data: units }, { data: devDocs }] = await Promise.all([
    supabase.from("development_milestones").select("*, changes:milestone_forecast_changes(previous_date, new_date, reason, changed_at)").eq("development_id", dev.id).order("sort_order").order("forecast_date"),
    supabase.from("development_updates").select("id, title, published_at, created_at, media:development_update_media(count)").eq("development_id", dev.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("progress_reports").select("id, reference_date, overall_percent, published_at").eq("development_id", dev.id).order("reference_date", { ascending: false }).limit(10),
    supabase.from("announcements").select("id, title, published_at, unit_id, created_at").eq("development_id", dev.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("units").select("id, code").eq("development_id", dev.id).order("code"),
    canDocs ? supabase.from("documents").select("id, title, category, visible_to_client, versions:document_versions(count)").eq("development_id", dev.id) : Promise.resolve({ data: [] }),
  ]);
  const unitOptions = (units ?? []).map((u) => ({ value: u.id, label: u.code }));

  return (
    <>
      <DevelopmentHeader dev={dev} tab="acompanhamento" />
      <Flash searchParams={searchParams} />
      {!canContent && !canDocs ? (
        <RestrictedState>Publicar acompanhamento exige a permissão “Conteúdo”.</RestrictedState>
      ) : (
        <div className="flex flex-col gap-16">
          {canContent && (
            <>
              <section>
                <SectionTitle eyebrow="Visível aos clientes do empreendimento" title="Linha do tempo" />
                <div className="flex flex-col gap-3 mb-6">
                  {(milestones ?? []).map((m) => (
                    <Card key={m.id} className="p-5">
                      <details>
                        <summary className="cursor-pointer flex flex-wrap items-center gap-3">
                          <Badge>{MILESTONE_STAGE_LABELS[m.stage]}</Badge>
                          <span className="font-medium">{m.title}</span>
                          <span className="text-sm text-ink-mute">{m.completed_on ? `concluído ${d(m.completed_on)}` : `previsão ${d(m.forecast_date)}`}</span>
                          {!m.is_published && <Badge tone="warning">Não publicado</Badge>}
                        </summary>
                        <div className="grid gap-6 md:grid-cols-2 mt-5">
                          <form action={updateMilestone} className="flex flex-col gap-3">
                            <input type="hidden" name="development_id" value={dev.id} />
                            <input type="hidden" name="id" value={m.id} />
                            <TextField label="Concluído em" name="completed_on" id={`c-${m.id}`} type="date" defaultValue={m.completed_on ?? ""} />
                            <CheckboxField name="is_published" id={`p-${m.id}`} label="Publicado aos clientes" defaultChecked={m.is_published} />
                            <SubmitButton size="sm" variant="secondary" className="self-start">Salvar</SubmitButton>
                          </form>
                          <form action={changeForecast} className="flex flex-col gap-3">
                            <input type="hidden" name="development_id" value={dev.id} />
                            <input type="hidden" name="id" value={m.id} />
                            <TextField label="Nova previsão" name="new_date" id={`f-${m.id}`} type="date" defaultValue={m.forecast_date ?? ""} />
                            <TextArea label="Motivo da alteração" name="reason" id={`r-${m.id}`} rows={2} required minLength={5} />
                            <CheckboxField name="visible" id={`v-${m.id}`} label="Mostrar a alteração no histórico do cliente" defaultChecked />
                            <SubmitButton size="sm" className="self-start">Alterar previsão</SubmitButton>
                          </form>
                        </div>
                        {(m.changes as Array<{ previous_date: string | null; new_date: string | null; reason: string; changed_at: string }>).length > 0 && (
                          <ul className="text-xs text-ink-mute mt-4 space-y-1">
                            {(m.changes as Array<{ previous_date: string | null; new_date: string | null; reason: string; changed_at: string }>).map((c, i) => (
                              <li key={i}>{formatDateTime(c.changed_at)}: {d(c.previous_date)} → {d(c.new_date)} — {c.reason}</li>
                            ))}
                          </ul>
                        )}
                      </details>
                    </Card>
                  ))}
                </div>
                <Card className="p-6">
                  <form action={addMilestone} className="grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="development_id" value={dev.id} />
                    <SelectField label="Etapa" name="stage" required options={Object.entries(MILESTONE_STAGE_LABELS).map(([value, label]) => ({ value, label }))} />
                    <TextField label="Título" name="title" required />
                    <TextField label="Previsão" name="forecast_date" type="date" />
                    <TextField label="Ordem" name="sort_order" type="number" defaultValue="0" />
                    <TextArea label="Descrição" name="description" rows={2} className="sm:col-span-2" />
                    <CheckboxField name="is_published" label="Publicar agora" />
                    <SubmitButton size="sm" className="self-start">Adicionar marco</SubmitButton>
                  </form>
                </Card>
              </section>

              <section>
                <SectionTitle title="Atualizações com fotos e vídeos" />
                <Card className="p-6 mb-6">
                  <form action={publishUpdate} className="flex flex-col gap-4">
                    <input type="hidden" name="development_id" value={dev.id} />
                    <TextField label="Título" name="title" id="up-title" required />
                    <TextArea label="Texto" name="body" id="up-body" rows={4} />
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="up-media" className="text-sm font-medium">Fotos (JPG, PNG, WebP até 15 MB) ou vídeos MP4 (até 50 MB)</label>
                      <input id="up-media" name="media" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" className="text-sm" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField label="Link de vídeo (https://)" name="video_url" id="up-url" type="url" />
                      <TextField label="Legenda do vídeo" name="video_caption" id="up-cap" />
                    </div>
                    <CheckboxField name="publish" id="up-pub" label="Publicar agora" defaultChecked />
                    <SubmitButton className="self-start">Salvar atualização</SubmitButton>
                  </form>
                </Card>
                <ul className="divide-y divide-line border-y border-line">
                  {(updates ?? []).map((u) => (
                    <li key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="font-medium">{u.title}</span>{" "}
                        <span className="text-xs text-ink-mute">{(u.media as unknown as Array<{ count: number }>)[0]?.count ?? 0} mídia(s) · {formatDateTime(u.created_at)}</span>
                      </span>
                      <form action={toggleUpdate} className="flex items-center gap-3">
                        <input type="hidden" name="development_id" value={dev.id} />
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="publish" value={u.published_at ? "0" : "1"} />
                        <Badge tone={u.published_at ? "success" : "neutral"}>{u.published_at ? "Publicada" : "Rascunho"}</Badge>
                        <button className="text-xs underline">{u.published_at ? "Despublicar" : "Publicar"}</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <SectionTitle title="Evolução física" />
                <Card className="p-6 mb-6">
                  <form action={addProgressReport} className="grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="development_id" value={dev.id} />
                    <TextField label="Data de referência" name="reference_date" type="date" required />
                    <TextField label="Percentual geral (%)" name="overall" inputMode="decimal" required />
                    <TextArea label="Etapas (uma por linha: ETAPA;PERCENTUAL)" name="items" rows={4} className="sm:col-span-2" hint="Ex.: Estrutura;100" />
                    <TextArea label="Observações" name="notes" rows={2} className="sm:col-span-2" />
                    <CheckboxField name="publish" label="Publicar agora" defaultChecked />
                    <SubmitButton size="sm" className="self-start">Registrar</SubmitButton>
                  </form>
                </Card>
                <ul className="text-sm space-y-1">
                  {(reports ?? []).map((r) => (
                    <li key={r.id}>{d(r.reference_date)}: <strong>{Number(r.overall_percent).toLocaleString("pt-BR")}%</strong> {!r.published_at && <Badge tone="warning">Rascunho</Badge>}</li>
                  ))}
                </ul>
              </section>

              <section>
                <SectionTitle title="Comunicados" />
                <Card className="p-6 mb-6">
                  <form action={addAnnouncement} className="flex flex-col gap-4">
                    <input type="hidden" name="development_id" value={dev.id} />
                    <SelectField label="Destinatários" name="unit_id" id="an-unit" placeholder="Todos os clientes do empreendimento" options={unitOptions} />
                    <TextField label="Título" name="title" id="an-title" required />
                    <TextArea label="Mensagem" name="body" id="an-body" rows={4} required />
                    <CheckboxField name="publish" id="an-pub" label="Publicar e avisar os clientes agora (aplicativo e e-mail)" />
                    <SubmitButton className="self-start">Salvar comunicado</SubmitButton>
                  </form>
                </Card>
                <ul className="divide-y divide-line border-y border-line">
                  {(announcements ?? []).map((a) => (
                    <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="font-medium">{a.title}</span>{" "}
                        <span className="text-xs text-ink-mute">{a.unit_id ? `unidade ${(units ?? []).find((u) => u.id === a.unit_id)?.code}` : "todos"}</span>
                      </span>
                      {a.published_at ? (
                        <Badge tone="success">Publicado {formatDateTime(a.published_at)}</Badge>
                      ) : (
                        <form action={publishAnnouncement}>
                          <input type="hidden" name="development_id" value={dev.id} />
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton size="sm" variant="secondary">Publicar e avisar</SubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {canDocs && (
            <section>
              <SectionTitle eyebrow="Para todos os clientes do empreendimento" title="Manuais e documentos do empreendimento" />
              <ul className="text-sm space-y-1 mb-4">
                {((devDocs ?? []) as Array<{ id: string; title: string; category: string; visible_to_client: boolean; versions: Array<{ count: number }> }>).map((doc) => (
                  <li key={doc.id}>{doc.title} · {DOCUMENT_CATEGORY_LABELS[doc.category]} · {doc.versions[0]?.count ?? 0} versão(ões){!doc.visible_to_client && " · oculto"}</li>
                ))}
              </ul>
              <Card className="p-6">
                <form action={createDocument} className="grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="development_id" value={dev.id} />
                  <SelectField label="Categoria" name="category" id="dd-cat" required defaultValue="manual" options={Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
                  <TextField label="Título" name="title" id="dd-title" required />
                  <TextField label="Descrição" name="description" id="dd-desc" className="sm:col-span-2" />
                  <input id="dd-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-sm sm:col-span-2" aria-label="Arquivo" />
                  <CheckboxField name="visible" id="dd-vis" label="Visível aos clientes" defaultChecked />
                  <SubmitButton size="sm" className="self-start">Publicar documento</SubmitButton>
                </form>
              </Card>
            </section>
          )}
          {!canContent && <EmptyState title="Linha do tempo, atualizações e comunicados exigem a permissão “Conteúdo”." />}
        </div>
      )}
    </>
  );
}
