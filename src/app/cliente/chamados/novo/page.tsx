import { Card, PageHeader, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { listMyUnits } from "@/server/queries/client";
import { openTicket } from "@/server/actions/client";
import { TICKET_CATEGORY_LABELS } from "@/lib/labels";

export const metadata = { title: "Novo chamado" };

export default async function NewTicket({ searchParams }: { searchParams: SP }) {
  const units = await listMyUnits();
  // Assistência técnica e pós-entrega só fazem sentido para unidades em entrega ou entregues.
  const delivered = units.some((u) => u.development.stage === "em_entrega" || u.development.stage === "entregue");
  const categories = Object.entries(TICKET_CATEGORY_LABELS).filter(
    ([v]) => v !== "concierge" && (delivered || (v !== "assistencia_tecnica" && v !== "pos_entrega")),
  );
  return (
    <>
      <PageHeader eyebrow="Chamados" title="Abrir chamado" description="A OUZ analisa cada caso. A cobertura de garantia é avaliada pela equipe técnica, não automaticamente." />
      <Flash searchParams={searchParams} />
      <Card className="p-6 max-w-3xl">
        <form action={openTicket} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Unidade" name="unit_id" required options={units.map((u) => ({ value: u.unit.id, label: `${u.development.name} · ${u.unit.code}` }))} />
            <SelectField label="Categoria" name="category" required options={categories.map(([value, label]) => ({ value, label }))} />
          </div>
          <TextField label="Assunto" name="title" required maxLength={200} />
          <TextArea label="Descreva a situação" name="description" required rows={6} maxLength={4000} hint="Inclua local, desde quando ocorre e o que já foi tentado." />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="files" className="text-sm font-medium">Fotos ou documentos <span className="text-ink-mute font-normal">(até 5 arquivos, 15 MB cada)</span></label>
            <input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
          </div>
          <SubmitButton className="self-start">Abrir chamado</SubmitButton>
        </form>
      </Card>
    </>
  );
}
