import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, SectionTitle, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { myUnit } from "@/server/queries/client-unit";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { bookSlot, cancelBooking, respondPunchItem } from "@/server/actions/client";
import { PUNCH_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

const KIND = { vistoria: "Vistoria", entrega_chaves: "Entrega de chaves" } as const;

export default async function ClientDelivery({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: bookings }, { data: vistoria }, { data: chaves }, { data: punch }, { data: delivery }] = await Promise.all([
    supabase.from("appointment_bookings").select("id, kind, status, slot:appointment_slots(starts_at, ends_at, location)").eq("unit_id", id).eq("status", "agendada"),
    supabase.rpc("available_slots", { p_unit_id: id, p_kind: "vistoria" }),
    supabase.rpc("available_slots", { p_unit_id: id, p_kind: "entrega_chaves" }),
    supabase.from("punch_list_items").select("id, location, description, status, ouz_note, client_note, created_at").eq("unit_id", id).order("created_at"),
    supabase.from("unit_deliveries").select("*").eq("unit_id", id).maybeSingle(),
  ]);
  type Slot = { slot_id: string; starts_at: string; ends_at: string; location: string | null };
  const slots = { vistoria: (vistoria ?? []) as Slot[], entrega_chaves: (chaves ?? []) as Slot[] };

  return (
    <div className="flex flex-col gap-12">
      <Flash searchParams={searchParams} />
      {delivery && (delivery.inspection_done_at || delivery.keys_delivered_at) && (
        <Card className="p-5 flex flex-wrap gap-8">
          {delivery.inspection_done_at && <div><p className="eyebrow">Vistoria realizada</p><p>{formatDateTime(delivery.inspection_done_at)}</p></div>}
          {delivery.keys_delivered_at && <div><p className="eyebrow">Chaves entregues</p><p>{formatDateTime(delivery.keys_delivered_at)}</p></div>}
        </Card>
      )}

      {(["vistoria", "entrega_chaves"] as const).map((k) => {
        const current = (bookings ?? []).find((b) => b.kind === k);
        const slot = current?.slot as unknown as { starts_at: string; location: string | null } | undefined;
        return (
          <section key={k}>
            <SectionTitle title={`Agendar ${KIND[k].toLowerCase()}`} />
            {current && slot && (
              <Card className="p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
                <span>
                  <Badge tone="success">Agendado</Badge> <strong className="ml-2">{formatDateTime(slot.starts_at)}</strong>
                  {slot.location && <span className="text-ink-soft"> · {slot.location}</span>}
                </span>
                <form action={cancelBooking}>
                  <input type="hidden" name="unit_id" value={id} />
                  <input type="hidden" name="booking_id" value={current.id} />
                  <SubmitButton size="sm" variant="ghost">Cancelar</SubmitButton>
                </form>
              </Card>
            )}
            {slots[k].length === 0 ? (
              <p className="text-sm text-ink-soft">
                {u.development.stage === "entregue"
                  ? "Nenhum agendamento em aberto."
                  : `Nenhum horário disponível no momento. A OUZ publicará os horários quando a ${KIND[k].toLowerCase()} estiver liberada.`}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {slots[k].map((s) => (
                  <li key={s.slot_id}>
                    <form action={bookSlot} className="border border-line bg-surface p-4 flex items-center justify-between gap-3">
                      <input type="hidden" name="unit_id" value={id} />
                      <input type="hidden" name="slot_id" value={s.slot_id} />
                      <span className="text-sm">
                        {formatDateTime(s.starts_at)}
                        {s.location && <span className="block text-xs text-ink-mute">{s.location}</span>}
                      </span>
                      <SubmitButton size="sm" variant="secondary">{current ? "Reagendar" : "Agendar"}</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section>
        <SectionTitle title="Pendências da vistoria" />
        {!punch?.length ? (
          <EmptyState title="Nenhuma pendência registrada" />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {punch.map((p) => (
              <li key={p.id} className="py-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {p.location && <span className="eyebrow">{p.location}</span>}
                  <Badge tone={p.status === "aceita_cliente" ? "success" : p.status === "resolvida" ? "warning" : p.status === "contestada" ? "danger" : "info"}>{PUNCH_STATUS_LABELS[p.status]}</Badge>
                </div>
                <p>{p.description}</p>
                {p.ouz_note && <p className="text-sm text-ink-soft">OUZ: {p.ouz_note}</p>}
                {p.client_note && <p className="text-sm text-ink-soft">Você: {p.client_note}</p>}
                {p.status === "resolvida" && (
                  <form action={respondPunchItem} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="unit_id" value={id} />
                    <input type="hidden" name="id" value={p.id} />
                    <TextField label="Comentário (obrigatório para contestar)" name="note" id={`pn-${p.id}`} />
                    <SubmitButton size="sm" name="decision" value="aceitar">Confirmar resolução</SubmitButton>
                    <SubmitButton size="sm" name="decision" value="contestar" variant="danger">Contestar</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-ink-soft">
        Manuais e orientações pós-entrega ficam em <Link className="underline" href={`/cliente/unidades/${id}/documentos`}>Documentos</Link>. Para assistência técnica, abra um <Link className="underline" href="/cliente/chamados/novo">chamado</Link>.
      </p>
    </div>
  );
}
