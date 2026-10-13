import { Badge, Card, CheckboxField, PageHeader, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { saveEvent } from "@/server/actions/admin/content";
import { formatDateTime, utcToBrasiliaLocalInput } from "@/lib/format";

export const metadata = { title: "Eventos" };
const AUDIENCES = [
  { value: "geral", label: "Geral (público)" },
  { value: "clientes", label: "Clientes" },
  { value: "corretores_aprovados", label: "Corretores aprovados" },
  { value: "empreendimento", label: "Pessoas vinculadas a um empreendimento" },
];

type Ev = { id: string; title: string; description: string | null; location_text: string | null; online_url: string | null; starts_at: string; ends_at: string | null; audience: string; development_id: string | null; capacity: number | null; is_published: boolean; is_demo: boolean };

export default async function EventsAdmin({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["eventos"], "/admin/eventos");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: devs }] = await Promise.all([
    supabase.from("events").select("*").order("starts_at", { ascending: false }),
    supabase.from("developments").select("id, name").order("sort_order"),
  ]);
  const devOptions = (devs ?? []).map((d) => ({ value: d.id, label: d.name }));
  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Eventos"
        description="Agenda e públicos. Confirmação de presença, capacidade com lista de espera, convidados específicos e lembretes chegam na Etapa 3."
      />
      <Flash searchParams={searchParams} />
      <Card className="p-6 mb-10">
        <SectionTitle title="Novo evento" />
        <EventForm devOptions={devOptions} />
      </Card>
      <div className="flex flex-col gap-4">
        {((events ?? []) as Ev[]).map((e) => (
          <Card key={e.id} className="p-5">
            <details>
              <summary className="cursor-pointer flex flex-wrap gap-3 items-center">
                <span className="font-medium">{e.title}</span>
                <span className="text-sm text-ink-mute">{formatDateTime(e.starts_at)}</span>
                <Badge>{AUDIENCES.find((a) => a.value === e.audience)?.label ?? e.audience}</Badge>
                {e.is_published ? <Badge tone="success">Publicado</Badge> : <Badge>Rascunho</Badge>}
                {e.is_demo && <Badge tone="warning">Demonstrativo</Badge>}
              </summary>
              <div className="mt-5"><EventForm event={e} devOptions={devOptions} /></div>
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}

function EventForm({ event, devOptions }: { event?: Ev; devOptions: Array<{ value: string; label: string }> }) {
  const p = event?.id ?? "novo";
  return (
    <form action={saveEvent} className="grid gap-4 sm:grid-cols-2">
      {event && <input type="hidden" name="id" value={event.id} />}
      <TextField label="Título" name="title" id={`${p}-t`} required defaultValue={event?.title} className="sm:col-span-2" />
      <TextArea label="Descrição" name="description" id={`${p}-d`} rows={3} defaultValue={event?.description ?? ""} className="sm:col-span-2" />
      <TextField label="Início (horário de Brasília)" name="starts_at" id={`${p}-s`} type="datetime-local" required defaultValue={utcToBrasiliaLocalInput(event?.starts_at)} />
      <TextField label="Término" name="ends_at" id={`${p}-e`} type="datetime-local" defaultValue={utcToBrasiliaLocalInput(event?.ends_at)} />
      <TextField label="Local" name="location_text" id={`${p}-l`} defaultValue={event?.location_text ?? ""} />
      <TextField label="Link (eventos on-line)" name="online_url" id={`${p}-u`} type="url" defaultValue={event?.online_url ?? ""} />
      <SelectField label="Público" name="audience" id={`${p}-a`} required options={AUDIENCES} defaultValue={event?.audience ?? "geral"} />
      <SelectField label="Empreendimento (se aplicável)" name="development_id" id={`${p}-dv`} options={devOptions} placeholder="—" defaultValue={event?.development_id ?? ""} />
      <TextField label="Capacidade" name="capacity" id={`${p}-c`} type="number" min={1} defaultValue={event?.capacity ? String(event.capacity) : ""} />
      <CheckboxField name="is_published" id={`${p}-p`} label="Publicado" defaultChecked={event?.is_published} className="sm:mt-8" />
      <SubmitButton size="sm" className="self-start">Salvar evento</SubmitButton>
    </form>
  );
}
