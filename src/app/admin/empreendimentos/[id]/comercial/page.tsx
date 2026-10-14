import { Badge, Card, CheckboxField, EmptyState, RestrictedState, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import {
  addChecklistItem,
  createPolicyDraft,
  createPriceTableDraft,
  deletePriceTableDraft,
  publishPolicy,
  publishPriceTable,
  savePolicyDraft,
  saveDraftPrices,
  toggleChecklistItem,
  updateCommercialSettings,
} from "@/server/actions/admin/commercial";
import { SALES_MODE_LABELS } from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";

const VERSION_TONE = { rascunho: "warning", vigente: "success", substituida: "neutral" } as const;
const VERSION_LABEL = { rascunho: "Rascunho", vigente: "Vigente", substituida: "Substituída" } as const;
type V = keyof typeof VERSION_LABEL;

const POLICY_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "preco_minimo", label: "Preço mínimo (R$)", hint: "Absoluto. Use as regras por unidade para valores específicos." },
  { key: "desconto_maximo_percentual", label: "Desconto máximo sobre a tabela (%)" },
  { key: "desconto_maximo_valor", label: "Desconto máximo sobre a tabela (R$)" },
  { key: "desconto_condicional_valor", label: "Desconto condicionado: até (R$)", hint: "Desconto só é aceito se as condições abaixo forem atendidas; sem desconto, sempre aceito." },
  { key: "desconto_condicional_entrada_minima", label: "Desconto condicionado: entrada mínima (%)" },
  { key: "entrada_minima_percentual", label: "Entrada mínima (%)" },
  { key: "percentual_minimo_ate_chaves", label: "Mínimo pago até as chaves (%)", hint: "Exige a previsão de chaves preenchida." },
  { key: "prazo_maximo_meses", label: "Prazo máximo (meses)" },
  { key: "parcelas_max_quantidade", label: "Máximo de parcelas" },
  { key: "reforcos_max_quantidade", label: "Máximo de reforços" },
  { key: "permuta_max_percentual", label: "Permuta máxima (%)" },
];
const POLICY_FLAGS = [
  { key: "desconto_condicional_somente_entrada_e_chaves", label: "Desconto condicionado: só entrada e saldo nas chaves (sem parcelas)" },
  { key: "permuta_permitida", label: "Permuta permitida" },
  { key: "exigir_analise_com_permuta", label: "Permuta exige análise da OUZ" },
  { key: "exigir_analise_pessoa_juridica", label: "Compra por pessoa jurídica exige análise" },
  { key: "sempre_exigir_analise", label: "Toda proposta exige análise (sem aprovação automática)" },
];

export default async function DevelopmentCommercial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["comercial", "politicas"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const canCommercial = hasPermission(viewer, "comercial");
  const canPolicies = hasPermission(viewer, "politicas");
  const supabase = await createSupabaseServerClient();
  const [{ data: settings }, { data: tables }, { data: policies }, { data: checklist }, { data: units }] = await Promise.all([
    supabase.from("development_commercial_settings").select("*").eq("development_id", dev.id).maybeSingle(),
    supabase.from("price_tables").select("id, version_number, status, notes, published_at, is_demo, items:price_table_items(unit_id, price)").eq("development_id", dev.id).order("version_number", { ascending: false }),
    supabase.from("sales_policies").select("id, version_number, status, rules, notes, published_at, is_demo").eq("development_id", dev.id).order("version_number", { ascending: false }),
    supabase.from("document_checklist_items").select("*").or(`development_id.eq.${dev.id},development_id.is.null`).order("person_type").order("sort_order"),
    supabase.from("units").select("id, code").eq("development_id", dev.id).order("code"),
  ]);
  const codeOf = new Map((units ?? []).map((u) => [u.id, u.code]));
  const draftTable = (tables ?? []).find((t) => t.status === "rascunho");
  const draftPolicy = (policies ?? []).find((p) => p.status === "rascunho");
  const draftRules = (draftPolicy?.rules ?? {}) as { padrao?: Record<string, number | boolean>; por_tipologia?: unknown; por_unidade?: unknown };
  const hasOwnChecklist = (checklist ?? []).some((c) => c.development_id === dev.id && c.active);

  return (
    <>
      <DevelopmentHeader dev={dev} tab="comercial" />
      <Flash searchParams={searchParams} />
      <div className="flex flex-col gap-16">
        <section>
          <SectionTitle title="Configurações de venda" />
          {!canCommercial ? (
            <RestrictedState>Exige a permissão “Comercial”.</RestrictedState>
          ) : (
            <Card className="p-6">
              <form action={updateCommercialSettings} className="grid gap-5 sm:grid-cols-2">
                <input type="hidden" name="development_id" value={dev.id} />
                <SelectField
                  label="Modo de venda"
                  name="sales_mode"
                  required
                  defaultValue={settings?.sales_mode}
                  options={Object.entries(SALES_MODE_LABELS).map(([value, v]) => ({ value, label: `${v.label} — ${v.description}` }))}
                />
                <TextField label="Previsão de entrega das chaves" name="keys_expected_date" type="date" defaultValue={settings?.keys_expected_date ?? ""} hint="Informada pela OUZ; usada no critério “até as chaves”." />
                <TextField label="Prazo da reserva para documentação (horas)" name="reservation_hours" type="number" min={1} max={720} required defaultValue={String(settings?.reservation_hours ?? 48)} />
                <TextField label="Prazo para regularizar pendências (horas)" name="regularization_hours" type="number" min={1} max={720} required defaultValue={String(settings?.regularization_hours ?? 24)} />
                <TextField label="Máximo de propostas ativas por corretor" name="max_active_proposals_per_broker" type="number" min={1} max={50} required defaultValue={String(settings?.max_active_proposals_per_broker ?? 3)} hint="Evita que um corretor bloqueie várias unidades." />
                <TextField label="Carência após reserva perdida (dias)" name="reservation_cooldown_days" type="number" min={0} max={90} required defaultValue={String(settings?.reservation_cooldown_days ?? 7)} hint="Mesmo corretor, mesma unidade, após expirar ou desistir." />
                <CheckboxField name="regularization_expires" label="Expirar a reserva se a pendência não for regularizada no prazo" defaultChecked={settings?.regularization_expires ?? true} />
                <SubmitButton className="self-start">Salvar configurações</SubmitButton>
              </form>
            </Card>
          )}
        </section>

        <section>
          <SectionTitle title="Tabelas de preço" />
          {canPolicies && !draftTable && (
            <form action={createPriceTableDraft} className="flex flex-wrap items-center gap-4 mb-6">
              <input type="hidden" name="development_id" value={dev.id} />
              <CheckboxField name="copy" label="Copiar preços da tabela vigente" defaultChecked />
              <SubmitButton size="sm" variant="secondary">Nova versão (rascunho)</SubmitButton>
            </form>
          )}
          {draftTable && canPolicies && (
            <Card className="p-6 mb-6 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <h3 className="font-medium">Versão {draftTable.version_number}</h3>
                <Badge tone="warning">Rascunho</Badge>
                <span className="text-sm text-ink-mute">{draftTable.items.length} unidade(s) com preço</span>
              </div>
              <form action={saveDraftPrices} className="flex flex-col gap-3">
                <input type="hidden" name="development_id" value={dev.id} />
                <input type="hidden" name="price_table_id" value={draftTable.id} />
                <TextArea
                  label="Preços (uma unidade por linha: UNIDADE;PREÇO — pode colar de planilha)"
                  name="prices"
                  rows={8}
                  defaultValue={(draftTable.items as Array<{ unit_id: string; price: string }>)
                    .map((i) => `${codeOf.get(i.unit_id) ?? i.unit_id};${Number(i.price).toFixed(2).replace(".", ",")}`)
                    .sort()
                    .join("\n")}
                />
                <SubmitButton size="sm" variant="secondary" className="self-start">Gravar preços no rascunho</SubmitButton>
              </form>
              <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                <form action={publishPriceTable} className="flex flex-wrap gap-3 items-end">
                  <input type="hidden" name="development_id" value={dev.id} />
                  <input type="hidden" name="price_table_id" value={draftTable.id} />
                  <TextField label="Nota da publicação" name="notes" id="pt-notes" />
                  <SubmitButton>Publicar como vigente</SubmitButton>
                </form>
                <form action={deletePriceTableDraft} className="self-end">
                  <input type="hidden" name="development_id" value={dev.id} />
                  <input type="hidden" name="price_table_id" value={draftTable.id} />
                  <SubmitButton variant="ghost" size="sm">Descartar rascunho</SubmitButton>
                </form>
              </div>
            </Card>
          )}
          {!tables?.length ? (
            <EmptyState title="Nenhuma tabela cadastrada" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {tables.filter((t) => t.status !== "rascunho").map((t) => (
                <li key={t.id} className="py-3">
                  <details>
                    <summary className="cursor-pointer flex flex-wrap items-center gap-3">
                      <span className="font-medium">Versão {t.version_number}</span>
                      <Badge tone={VERSION_TONE[t.status as V]}>{VERSION_LABEL[t.status as V]}</Badge>
                      {t.is_demo && <Badge tone="warning">Demonstrativo</Badge>}
                      <span className="text-sm text-ink-mute">publicada em {formatDateTime(t.published_at)}{t.notes ? ` · ${t.notes}` : ""}</span>
                    </summary>
                    <ul className="mt-3 grid gap-1 sm:grid-cols-3 text-sm">
                      {(t.items as Array<{ unit_id: string; price: string }>)
                        .sort((a, b) => (codeOf.get(a.unit_id) ?? "").localeCompare(codeOf.get(b.unit_id) ?? ""))
                        .map((i) => <li key={i.unit_id}>{codeOf.get(i.unit_id)}: {formatBRL(i.price)}</li>)}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle title="Políticas de venda" />
          <p className="text-sm text-ink-soft mb-4 max-w-3xl">
            Campos vazios significam “sem limite”. Toda proposta guarda a versão da tabela e da política usadas no envio. Não use condições reais em ambiente de demonstração.
          </p>
          {canPolicies && !draftPolicy && (
            <form action={createPolicyDraft} className="mb-6">
              <input type="hidden" name="development_id" value={dev.id} />
              <SubmitButton size="sm" variant="secondary">Nova versão da política (rascunho)</SubmitButton>
            </form>
          )}
          {draftPolicy && canPolicies && (
            <Card className="p-6 mb-6">
              <div className="flex items-center gap-3 mb-5">
                <h3 className="font-medium">Versão {draftPolicy.version_number}</h3>
                <Badge tone="warning">Rascunho</Badge>
              </div>
              <form action={savePolicyDraft} className="flex flex-col gap-5">
                <input type="hidden" name="development_id" value={dev.id} />
                <input type="hidden" name="policy_id" value={draftPolicy.id} />
                <div className="grid gap-5 sm:grid-cols-2">
                  {POLICY_FIELDS.map((f) => (
                    <TextField key={f.key} label={f.label} name={f.key} id={`pol-${f.key}`} hint={f.hint} inputMode="decimal" defaultValue={draftRules.padrao?.[f.key] !== undefined ? String(draftRules.padrao[f.key]) : ""} />
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {POLICY_FLAGS.map((f) => (
                    <CheckboxField key={f.key} name={f.key} id={`pol-${f.key}`} label={f.label} defaultChecked={draftRules.padrao?.[f.key] === true} />
                  ))}
                </div>
                <TextArea
                  label="Regras por tipologia ou unidade (JSON avançado)"
                  name="overrides"
                  rows={5}
                  hint='Ex.: {"por_tipologia": {"Cobertura": {"desconto_maximo_percentual": 2}}, "por_unidade": {"<id da unidade>": {"preco_minimo": 2500000}}}'
                  defaultValue={JSON.stringify({ por_tipologia: draftRules.por_tipologia ?? {}, por_unidade: draftRules.por_unidade ?? {} }, null, 2)}
                />
                <TextField label="Notas" name="notes" id="pol-notes" defaultValue={draftPolicy.notes ?? ""} />
                <SubmitButton variant="secondary" className="self-start">Salvar rascunho</SubmitButton>
              </form>
              <form action={publishPolicy} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="development_id" value={dev.id} />
                <input type="hidden" name="policy_id" value={draftPolicy.id} />
                <SubmitButton>Publicar como vigente</SubmitButton>
              </form>
            </Card>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {(policies ?? []).filter((p) => p.status !== "rascunho").map((p) => (
              <li key={p.id} className="py-3">
                <details>
                  <summary className="cursor-pointer flex flex-wrap items-center gap-3">
                    <span className="font-medium">Versão {p.version_number}</span>
                    <Badge tone={VERSION_TONE[p.status as V]}>{VERSION_LABEL[p.status as V]}</Badge>
                    {p.is_demo && <Badge tone="warning">Demonstrativo</Badge>}
                    <span className="text-sm text-ink-mute">{formatDateTime(p.published_at)}{p.notes ? ` · ${p.notes}` : ""}</span>
                  </summary>
                  <pre className="mt-3 text-xs bg-sand p-3 overflow-x-auto">{JSON.stringify(p.rules, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle title="Checklist de documentos da reserva" />
          <p className="text-sm text-ink-soft mb-4">
            {hasOwnChecklist ? "Este empreendimento usa checklist próprio." : "Sem itens próprios ativos: valem os itens globais."} Mudanças valem para reservas criadas depois.
          </p>
          <ul className="divide-y divide-line border-y border-line mb-6">
            {(checklist ?? []).map((c) => (
              <li key={c.id} className={`py-3 flex flex-wrap items-center justify-between gap-3 ${c.active ? "" : "opacity-50"}`}>
                <span className="text-sm">
                  <Badge>{c.person_type === "pf" ? "PF" : "PJ"}</Badge> {c.label} {c.required ? "" : <span className="text-ink-mute">(opcional)</span>}{" "}
                  <span className="text-xs text-ink-mute">{c.development_id ? "· deste empreendimento" : "· global"}</span>
                </span>
                {canCommercial && (
                  <form action={toggleChecklistItem}>
                    <input type="hidden" name="development_id" value={dev.id} />
                    <input type="hidden" name="item_id" value={c.id} />
                    <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                    <button className="text-xs underline">{c.active ? "Desativar" : "Reativar"}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {canCommercial && (
            <Card className="p-6">
              <form action={addChecklistItem} className="grid gap-4 sm:grid-cols-[8rem_1fr_6rem]">
                <input type="hidden" name="development_id" value={dev.id} />
                <SelectField label="Tipo" name="person_type" id="cl-type" required options={[{ value: "pf", label: "PF" }, { value: "pj", label: "PJ" }]} />
                <TextField label="Documento" name="label" id="cl-label" required />
                <TextField label="Ordem" name="sort_order" id="cl-order" type="number" defaultValue="0" />
                <TextField label="Orientação ao corretor" name="description" id="cl-desc" className="sm:col-span-2" />
                <CheckboxField name="required" id="cl-req" label="Obrigatório" defaultChecked className="sm:mt-8" />
                <SubmitButton size="sm" className="self-start">Adicionar item</SubmitButton>
              </form>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
