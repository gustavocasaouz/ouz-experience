import { Badge, Card, CheckboxField, EmptyState, RestrictedState, SectionTitle, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { hasPermission } from "@/server/auth/viewer";
import { customizationCatalog } from "@/server/queries/customization";
import {
  addCustomizationChoice, addCustomizationItem, deleteCustomizationEntry, toggleCustomizationItem, updateCustomizationChoicePrice,
} from "@/server/actions/admin/customization";
import { formatBRL } from "@/lib/format";

export default async function DevelopmentCustomization({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "atendimento"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  const canEdit = hasPermission(viewer, "conteudo");
  const { items } = await customizationCatalog(dev.id);
  const categories = [...new Set(items.map((i) => i.category))];
  const hidden = (k: string, v: string) => <input type="hidden" name={k} value={v} />;

  return (
    <>
      <DevelopmentHeader dev={dev} tab="personalizacao" />
      <Flash searchParams={searchParams} />
      <p className="text-sm text-ink-soft max-w-3xl mb-10">
        Itens que o cliente escolhe na aba Personalização: o padrão da construtora (incluso) e os upgrades com custo adicional. Os valores são de referência; ao
        enviar, as escolhas viram uma solicitação em Personalizações, onde a OUZ manda o orçamento final.
        {!dev.client_tabs.includes("personalizacao") && " A aba Personalização está desligada para este empreendimento (Geral › Abas e chamados)."}
      </p>

      {canEdit ? (
        <section className="mb-14">
          <SectionTitle title="Novo item" />
          <Card className="p-6">
            <form action={addCustomizationItem} className="grid gap-5 sm:grid-cols-2">
              {hidden("development_id", dev.id)}
              <TextField label="Categoria" name="category" required maxLength={60} placeholder="Ex.: Pisos" list="customization-categories" />
              <datalist id="customization-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <TextField label="Item" name="title" required maxLength={120} placeholder="Ex.: Piso das áreas sociais" />
              <TextField label="Padrão da construtora (incluso)" name="standard" maxLength={120} placeholder="Ex.: Porcelanato 90×90 cm" />
              <TextField label="Ordem" name="sort_order" type="number" min={0} defaultValue="0" />
              <TextField label="Observação para o cliente" name="description" maxLength={300} className="sm:col-span-2" />
              <SubmitButton className="self-start">Incluir item</SubmitButton>
            </form>
          </Card>
        </section>
      ) : (
        <div className="mb-14"><RestrictedState>Editar o catálogo exige a permissão “Conteúdo”.</RestrictedState></div>
      )}

      {items.length === 0 ? (
        <EmptyState title="Catálogo vazio">Inclua o primeiro item acima.</EmptyState>
      ) : (
        <div className="flex flex-col gap-14">
          {categories.map((cat) => (
            <section key={cat}>
              <SectionTitle title={cat} />
              <div className="flex flex-col gap-4">
                {items.filter((i) => i.category === cat).map((i) => (
                  <Card key={i.id} className="p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{i.title} {!i.is_published && <Badge>Oculto</Badge>}</p>
                        {i.description && <p className="text-sm text-ink-mute">{i.description}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <form action={toggleCustomizationItem}>
                            {hidden("development_id", dev.id)}{hidden("id", i.id)}{hidden("publish", i.is_published ? "0" : "1")}
                            <SubmitButton size="sm" variant="ghost">{i.is_published ? "Ocultar" : "Mostrar"}</SubmitButton>
                          </form>
                          <form action={deleteCustomizationEntry}>
                            {hidden("development_id", dev.id)}{hidden("id", i.id)}{hidden("kind", "item")}
                            <SubmitButton size="sm" variant="ghost">Remover item</SubmitButton>
                          </form>
                        </div>
                      )}
                    </div>
                    <ul className="divide-y divide-line border-y border-line">
                      {i.choices.map((c) => (
                        <li key={c.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                          <span className="text-sm">
                            {c.title}
                            {c.description && <span className="text-ink-mute"> · {c.description}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            {c.is_standard ? (
                              <Badge tone="success">Padrão · incluso</Badge>
                            ) : canEdit ? (
                              <form action={updateCustomizationChoicePrice} className="flex items-center gap-2">
                                {hidden("development_id", dev.id)}{hidden("id", c.id)}
                                <label className="sr-only" htmlFor={`price-${c.id}`}>Valor adicional</label>
                                <input id={`price-${c.id}`} name="price" defaultValue={c.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} inputMode="decimal" className="w-32 bg-surface border border-line rounded-[var(--radius-sm)] px-2 min-h-9 text-sm text-right tabular-nums" />
                                <SubmitButton size="sm" variant="ghost">Salvar</SubmitButton>
                              </form>
                            ) : (
                              <span className="text-sm tabular-nums">+ {formatBRL(c.price)}</span>
                            )}
                            {canEdit && (
                              <form action={deleteCustomizationEntry}>
                                {hidden("development_id", dev.id)}{hidden("id", c.id)}{hidden("kind", "choice")}
                                <SubmitButton size="sm" variant="ghost" aria-label={`Remover ${c.title}`}>×</SubmitButton>
                              </form>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {canEdit && (
                      <form action={addCustomizationChoice} className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto] items-end">
                        {hidden("development_id", dev.id)}{hidden("item_id", i.id)}
                        <TextField label="Nova opção" name="title" required maxLength={120} placeholder="Ex.: Porcelanato 120×120 cm" id={`t-${i.id}`} />
                        <TextField label="Detalhe" name="description" maxLength={200} id={`d-${i.id}`} />
                        <TextField label="Adicional (R$)" name="price" inputMode="decimal" placeholder="12.000,00" id={`p-${i.id}`} />
                        <SubmitButton size="sm" variant="secondary">Incluir</SubmitButton>
                        {!i.choices.some((c) => c.is_standard) && (
                          <CheckboxField name="is_standard" id={`s-${i.id}`} label="É o padrão da construtora (incluso)" className="sm:col-span-4" />
                        )}
                      </form>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
