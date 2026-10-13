import { Badge, Card, EmptyState, PageHeader, SectionTitle, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { rsvpEvent } from "@/server/actions/client";
import { formatDateTime, requestNow } from "@/lib/format";

export const metadata = { title: "Agenda" };

type Ev = { id: string; title: string; description: string | null; location_text: string | null; online_url: string | null; starts_at: string; ends_at: string | null; capacity: number | null; rsvp_enabled: boolean; cover_image_path: string | null };

export default async function Agenda({ searchParams }: { searchParams: SP }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: mine }] = await Promise.all([
    supabase.from("events").select("id, title, description, location_text, online_url, starts_at, ends_at, capacity, rsvp_enabled, cover_image_path").order("starts_at"),
    supabase.from("event_rsvps").select("event_id, status, guests"),
  ]);
  const rsvp = new Map((mine ?? []).map((r) => [r.event_id, r]));
  const now = requestNow();
  const all = (events ?? []) as Ev[];
  const upcoming = all.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now);
  const past = all.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() < now).reverse();

  return (
    <>
      <PageHeader eyebrow="OUZ" title="Agenda" description="Eventos abertos a você. A lista de participantes não é divulgada." />
      <Flash searchParams={searchParams} />
      <SectionTitle title="Próximos" />
      {upcoming.length === 0 ? (
        <EmptyState title="Nenhum evento agendado" />
      ) : (
        <div className="flex flex-col gap-4 mb-14">
          {upcoming.map((e) => {
            const r = rsvp.get(e.id);
            const open = e.rsvp_enabled && new Date(e.starts_at).getTime() > now;
            return (
              <Card key={e.id} className="p-6 grid gap-4 md:grid-cols-[12rem_1fr_auto]">
                <p className="text-sm text-ink-mute">{formatDateTime(e.starts_at)}</p>
                <div>
                  <h3 className="font-display text-2xl">{e.title}</h3>
                  {e.location_text && <p className="text-sm text-ink-soft">{e.location_text}</p>}
                  {e.online_url && <a className="text-sm underline" href={e.online_url} target="_blank" rel="noopener noreferrer">Link do evento</a>}
                  {e.description && <p className="text-sm text-ink-soft mt-2 whitespace-pre-line">{e.description}</p>}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {r && r.status !== "cancelado" && (
                    <Badge tone={r.status === "confirmado" ? "success" : "warning"}>
                      {r.status === "confirmado" ? `Presença confirmada${r.guests ? ` (+${r.guests})` : ""}` : "Lista de espera"}
                    </Badge>
                  )}
                  {open && (
                    <form action={rsvpEvent} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="event_id" value={e.id} />
                      {(!r || r.status === "cancelado") ? (
                        <>
                          <TextField label="Acompanhantes" name="guests" id={`g-${e.id}`} type="number" min={0} max={5} defaultValue="0" className="w-28" />
                          <SubmitButton size="sm" name="attend" value="1">Confirmar presença</SubmitButton>
                        </>
                      ) : (
                        <SubmitButton size="sm" variant="ghost" name="attend" value="0">Cancelar presença</SubmitButton>
                      )}
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {past.length > 0 && (
        <>
          <SectionTitle title="Eventos anteriores" />
          <ul className="divide-y divide-line border-y border-line">
            {past.map((e) => (
              <li key={e.id} className="py-3 flex justify-between gap-3 text-sm">
                <span>{e.title}</span>
                <span className="text-ink-mute">{formatDateTime(e.starts_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
