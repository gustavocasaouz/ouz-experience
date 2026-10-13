import { notFound } from "next/navigation";
import { Badge, Card, DataList, EmptyState, PageHeader, SectionTitle, Table, Td, TextArea } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { inviteToEvent } from "@/server/actions/admin/experience";
import { formatDateTime } from "@/lib/format";

const RSVP = { confirmado: "Confirmado", lista_espera: "Lista de espera", cancelado: "Cancelado" } as const;

export default async function AdminEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["eventos"], "/admin/eventos");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [{ data: att }, { data: inv }, { data: seats }] = await Promise.all([
    supabase.rpc("admin_event_attendance", { p_event_id: id }),
    supabase.rpc("admin_event_invitations", { p_event_id: id }),
    supabase.rpc("event_seats_taken", { p_event_id: id }),
  ]);
  const attendance = (att ?? []) as Array<{ user_id: string; full_name: string; email: string; status: keyof typeof RSVP; guests: number; created_at: string }>;
  const invitations = (inv ?? []) as Array<{ user_id: string; full_name: string; email: string; invited_at: string }>;
  return (
    <>
      <PageHeader eyebrow="Evento" title={e.title} description={<Badge tone={e.is_published ? "success" : "neutral"}>{e.is_published ? "Publicado" : "Rascunho"}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-12">
          <DataList
            items={[
              { label: "Início", value: formatDateTime(e.starts_at) },
              { label: "Lugares ocupados", value: `${seats ?? 0}${e.capacity ? ` de ${e.capacity}` : " (sem limite)"}` },
              { label: "Confirmação de presença", value: e.rsvp_enabled ? "Aberta" : "Desligada" },
              { label: "Lembrete", value: e.reminder_hours ? `${e.reminder_hours} h antes` : "Sem lembrete" },
            ]}
          />
          <section>
            <SectionTitle title={`Presenças (${attendance.filter((a) => a.status === "confirmado").length} confirmadas, ${attendance.filter((a) => a.status === "lista_espera").length} na espera)`} />
            <p className="text-xs text-ink-mute mb-3">Lista visível só para a OUZ. Participantes não veem uns aos outros.</p>
            {!attendance.length ? <EmptyState title="Nenhuma resposta ainda" /> : (
              <Table head={["Pessoa", "E-mail", "Situação", "Acompanhantes", "Resposta"]} caption="Presenças">
                {attendance.map((a) => (
                  <tr key={a.user_id}>
                    <Td>{a.full_name || "—"}</Td>
                    <Td className="text-sm">{a.email}</Td>
                    <Td><Badge tone={a.status === "confirmado" ? "success" : a.status === "lista_espera" ? "warning" : "neutral"}>{RSVP[a.status]}</Badge></Td>
                    <Td>{a.guests}</Td>
                    <Td className="text-sm whitespace-nowrap">{formatDateTime(a.created_at)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {e.audience === "convidados" ? (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">Convidados ({invitations.length})</h2>
              <form action={inviteToEvent} className="flex flex-col gap-3 mb-4">
                <input type="hidden" name="event_id" value={id} />
                <TextArea label="E-mails (um por linha ou separados por vírgula)" name="emails" rows={4} required hint="A pessoa precisa ter conta no Experience." />
                <SubmitButton size="sm">Convidar</SubmitButton>
              </form>
              <ul className="text-sm space-y-1 max-h-80 overflow-y-auto">
                {invitations.map((i) => <li key={i.user_id}>{i.full_name || i.email} <span className="text-xs text-ink-mute">{i.email}</span></li>)}
              </ul>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-ink-soft">Público: {e.audience}. Para convidar pessoas específicas, mude o público para “Convidados específicos”.</Card>
          )}
        </aside>
      </div>
    </>
  );
}
