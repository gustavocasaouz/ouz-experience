import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, SelectField, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { closeSlot, createSlots } from "@/server/actions/admin/experience";
import { formatDateTime, requestNow } from "@/lib/format";

export const metadata = { title: "Vistorias e entregas" };
const KIND = { vistoria: "Vistoria", entrega_chaves: "Entrega de chaves" } as const;

export default async function AdminDeliveries({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["atendimento"], "/admin/entregas");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: devs }, { data: slots }] = await Promise.all([
    supabase.from("developments").select("id, name").order("sort_order"),
    supabase
      .from("appointment_slots")
      .select("id, kind, starts_at, location, is_open, development:developments(name), bookings:appointment_bookings(id, status, unit:units(id, code))")
      .gte("starts_at", new Date(requestNow() - 7 * 86_400_000).toISOString())
      .order("starts_at")
      .limit(300),
  ]);
  const upcoming = (slots ?? []).filter((s) => s.is_open || (s.bookings as unknown[]).length);
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Vistorias e entregas de chaves" description="Publique horários; o cliente escolhe um. Cada horário atende uma unidade." />
      <Flash searchParams={searchParams} />
      <Card className="p-6 mb-12">
        <SectionTitle title="Publicar horários" />
        <form action={createSlots} className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Empreendimento" name="development_id" required options={(devs ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <SelectField label="Tipo" name="kind" required options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
          <TextField label="Local" name="location" />
          <TextField label="Primeiro horário (Brasília)" name="starts_at" type="datetime-local" required />
          <TextField label="Duração de cada (min)" name="duration" type="number" min={15} max={480} defaultValue="60" required />
          <TextField label="Quantidade em sequência" name="count" type="number" min={1} max={40} defaultValue="4" required />
          <SubmitButton className="self-start">Publicar</SubmitButton>
        </form>
      </Card>
      {!upcoming.length ? <EmptyState title="Nenhum horário publicado" /> : (
        <Table head={["Horário", "Tipo", "Empreendimento", "Agendamento", ""]} caption="Horários">
          {upcoming.map((s) => {
            const active = (s.bookings as unknown as Array<{ status: string; unit: { id: string; code: string } }>).find((b) => b.status === "agendada");
            return (
              <tr key={s.id}>
                <Td className="whitespace-nowrap">{formatDateTime(s.starts_at)}{s.location ? <span className="block text-xs text-ink-mute">{s.location}</span> : null}</Td>
                <Td>{KIND[s.kind as keyof typeof KIND]}</Td>
                <Td>{(s.development as unknown as { name: string }).name}</Td>
                <Td>{active ? <Link className="underline" href={`/admin/unidades/${active.unit.id}#entrega`}>Unidade {active.unit.code}</Link> : s.is_open ? <Badge>Livre</Badge> : <Badge tone="neutral">Fechado</Badge>}</Td>
                <Td>
                  {s.is_open && !active && (
                    <form action={closeSlot}><input type="hidden" name="slot_id" value={s.id} /><button className="text-xs underline">Fechar</button></form>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
