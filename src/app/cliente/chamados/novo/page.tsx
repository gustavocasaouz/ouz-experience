import { Card, EmptyState, PageHeader, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { listMyUnits } from "@/server/queries/client";
import { listManuals, manualWarranty } from "@/server/queries/manual";
import { openTicket } from "@/server/actions/client";
import { TICKET_CATEGORY_LABELS } from "@/lib/labels";
import { formatWarrantyPeriod, todayInBrasilia, warrantyStatus } from "@/lib/warranty";
import { TicketFields, type TicketUnitOption } from "./ticket-fields";

export const metadata = { title: "Novo chamado" };

export default async function NewTicket({ searchParams }: { searchParams: SP }) {
  const [units, sp] = await Promise.all([listMyUnits(), searchParams]);
  const today = todayInBrasilia();
  // Categorias liberadas por empreendimento; na assistência técnica, só itens do manual ainda em garantia.
  const options: TicketUnitOption[] = (
    await Promise.all(
      units.map(async (u) => {
        const owner = (await listManuals(u.development.id, u.unit.id)).find((m) => m.kind === "proprietario");
        const items = owner ? await manualWarranty(owner.id) : [];
        const warranty = items
          .filter((w) => warrantyStatus(u.development.habite_se_date, w.months, today).state !== "encerrada")
          .map((w) => ({ value: w.id, label: `${w.system} · ${w.aspect} (${formatWarrantyPeriod(w.months)})` }));
        const categories = Object.entries(TICKET_CATEGORY_LABELS)
          .filter(([v]) => u.development.client_ticket_categories.includes(v) && (v !== "assistencia_tecnica" || !items.length || warranty.length > 0))
          .map(([value, label]) => ({ value, label }));
        return { id: u.unit.id, label: `${u.development.name} · ${u.unit.code}`, categories, warranty, hasWarrantyTable: items.length > 0 };
      }),
    )
  ).filter((o) => o.categories.length > 0);
  const unidade = typeof sp.unidade === "string" ? sp.unidade : undefined;

  return (
    <>
      <PageHeader eyebrow="Chamados" title="Abrir chamado" description="A OUZ analisa cada caso. A cobertura de garantia é avaliada pela equipe técnica, não automaticamente." />
      <Flash searchParams={searchParams} />
      {options.length === 0 ? (
        <EmptyState title="Nenhuma unidade com chamados liberados">Fale com a OUZ pelos canais de atendimento.</EmptyState>
      ) : (
        <Card className="p-6 max-w-3xl">
          <form action={openTicket} className="flex flex-col gap-5">
            <TicketFields units={options} defaultUnit={unidade} />
            <TextField label="Assunto" name="title" required maxLength={200} />
            <TextArea label="Descreva a situação" name="description" required rows={6} maxLength={4000} hint="Inclua local, desde quando ocorre e o que já foi tentado." />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="files" className="text-sm font-medium">Fotos ou documentos <span className="text-ink-mute font-normal">(até 5 arquivos, 15 MB cada)</span></label>
              <input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
            </div>
            <SubmitButton className="self-start">Abrir chamado</SubmitButton>
          </form>
        </Card>
      )}
    </>
  );
}
