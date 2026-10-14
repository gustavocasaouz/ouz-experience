import { Badge, Card, CheckboxField, PageHeader, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { saveConciergeService, saveProvider } from "@/server/actions/admin/concierge";
import { CONCIERGE_CATEGORY_LABELS } from "@/lib/labels";
import { maskDocument } from "@/domain/documentos";

export const metadata = { title: "Catálogo do concierge" };
const CATS = Object.entries(CONCIERGE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

type Svc = { id: string; development_id: string; category: string; name: string; description: string | null; pricing_note: string | null; cancellation_policy: string | null; requires_quote: boolean; active: boolean; sort_order: number };
type Prov = { id: string; name: string; document: string | null; contact_name: string | null; phone: string | null; email: string | null; categories: string[]; notes: string | null; active: boolean };

export default async function ConciergeCatalog({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["concierge"], "/admin/concierge/catalogo");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: devs }, { data: services }, { data: providers }] = await Promise.all([
    supabase.from("developments").select("id, name").order("sort_order"),
    supabase.from("concierge_services").select("*").order("sort_order"),
    supabase.from("concierge_providers").select("*").order("name"),
  ]);
  const devOptions = (devs ?? []).map((d) => ({ value: d.id, label: d.name }));
  return (
    <>
      <PageHeader eyebrow="Concierge" title="Catálogo e prestadores" description="Catálogo por empreendimento. Prestadores são internos: o cliente não vê nomes nem contatos." />
      <Flash searchParams={searchParams} />
      <section className="mb-16">
        <SectionTitle title="Serviços por empreendimento" />
        {(devs ?? []).map((d) => {
          const list = ((services ?? []) as Svc[]).filter((s) => s.development_id === d.id);
          return (
            <div key={d.id} className="mb-8">
              <h3 className="font-medium mb-3">{d.name} <span className="text-sm text-ink-mute">({list.length})</span></h3>
              <div className="flex flex-col gap-3">
                {list.map((s) => (
                  <Card key={s.id} className="p-4">
                    <details>
                      <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                        <Badge>{CONCIERGE_CATEGORY_LABELS[s.category]}</Badge>
                        <span className="font-medium">{s.name}</span>
                        {!s.active && <Badge tone="neutral">Inativo</Badge>}
                        {!s.requires_quote && <Badge tone="info">Sem orçamento</Badge>}
                      </summary>
                      <div className="mt-4"><ServiceForm s={s} devOptions={devOptions} /></div>
                    </details>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
        <Card className="p-6">
          <h3 className="font-medium mb-4">Novo serviço</h3>
          <ServiceForm devOptions={devOptions} />
        </Card>
      </section>
      <section>
        <SectionTitle title="Prestadores" />
        <div className="flex flex-col gap-3 mb-6">
          {((providers ?? []) as Prov[]).map((p) => (
            <Card key={p.id} className="p-4">
              <details>
                <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-ink-mute">{p.categories.map((c) => CONCIERGE_CATEGORY_LABELS[c]).join(", ")}</span>
                  {p.document && <span className="text-xs text-ink-mute">{maskDocument(p.document)}</span>}
                  {!p.active && <Badge tone="neutral">Inativo</Badge>}
                </summary>
                <div className="mt-4"><ProviderForm p={p} /></div>
              </details>
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <h3 className="font-medium mb-4">Novo prestador</h3>
          <ProviderForm />
        </Card>
      </section>
    </>
  );
}

function ServiceForm({ s, devOptions }: { s?: Svc; devOptions: Array<{ value: string; label: string }> }) {
  const k = s?.id ?? "novo";
  return (
    <form action={saveConciergeService} className="grid gap-3 sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <SelectField label="Empreendimento" name="development_id" id={`sd-${k}`} required options={devOptions} defaultValue={s?.development_id} />
      <SelectField label="Categoria" name="category" id={`sc-${k}`} required options={CATS} defaultValue={s?.category} />
      <TextField label="Nome" name="name" id={`sn-${k}`} required defaultValue={s?.name} />
      <TextField label="Informação de preço" name="pricing_note" id={`sp-${k}`} defaultValue={s?.pricing_note ?? "Sob orçamento"} hint="Informativo. Não inventar preços." />
      <TextArea label="Descrição" name="description" id={`sx-${k}`} rows={2} defaultValue={s?.description ?? ""} />
      <TextArea label="Política de cancelamento" name="cancellation_policy" id={`sk-${k}`} rows={2} defaultValue={s?.cancellation_policy ?? ""} />
      <TextField label="Ordem" name="sort_order" id={`so-${k}`} type="number" defaultValue={String(s?.sort_order ?? 0)} />
      <div className="flex flex-col gap-2 sm:pt-6">
        <CheckboxField name="requires_quote" id={`sq-${k}`} label="Exige orçamento e aprovação do cliente" defaultChecked={s?.requires_quote ?? true} />
        <CheckboxField name="active" id={`sa-${k}`} label="Ativo no catálogo" defaultChecked={s?.active ?? true} />
      </div>
      <SubmitButton size="sm" className="self-start">Salvar serviço</SubmitButton>
    </form>
  );
}

function ProviderForm({ p }: { p?: Prov }) {
  const k = p?.id ?? "novo";
  return (
    <form action={saveProvider} className="grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <TextField label="Nome / razão social" name="name" id={`pn-${k}`} required defaultValue={p?.name} />
      <TextField label="CPF/CNPJ" name="document" id={`pd-${k}`} defaultValue={p?.document ?? ""} />
      <TextField label="Contato" name="contact_name" id={`pc-${k}`} defaultValue={p?.contact_name ?? ""} />
      <TextField label="Telefone" name="phone" id={`pp-${k}`} defaultValue={p?.phone ?? ""} />
      <TextField label="E-mail" name="email" id={`pe-${k}`} type="email" defaultValue={p?.email ?? ""} />
      <TextArea label="Observações internas" name="notes" id={`po-${k}`} rows={2} defaultValue={p?.notes ?? ""} />
      <fieldset className="sm:col-span-2 grid gap-2 sm:grid-cols-4">
        <legend className="text-sm font-medium mb-2">Categorias atendidas</legend>
        {CATS.map((c) => (
          <CheckboxField key={c.value} name="categories" id={`pcat-${k}-${c.value}`} value={c.value} label={c.label} defaultChecked={p?.categories.includes(c.value)} />
        ))}
      </fieldset>
      <CheckboxField name="active" id={`pa-${k}`} label="Ativo" defaultChecked={p?.active ?? true} />
      <SubmitButton size="sm" className="self-start">Salvar prestador</SubmitButton>
    </form>
  );
}
