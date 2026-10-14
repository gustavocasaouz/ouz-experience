import { notFound } from "next/navigation";
import { Badge, Card, DataList, PageHeader, SectionTitle, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { cancelConcierge, decideConciergeQuote, rateConcierge } from "@/server/actions/client";
import { CONCIERGE_STATUS_LABELS, CONCIERGE_STATUS_TONE, OCCURRENCE_LABELS } from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";

const CANCELLABLE = ["solicitada", "em_analise", "orcamento_enviado", "aprovada_cliente", "agendada"];

export default async function ClientConciergeRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase
    .from("concierge_requests")
    .select("id, number, status, details, preferred_at, scheduled_at, service_amount, ouz_fee, conditions, quote_valid_until, status_note, cancel_reason, rating, rating_comment, created_at, service_id, unit:units(code, development:developments(name))")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const [{ data: service }, { data: events }, { data: occurrences }] = await Promise.all([
    supabase.from("concierge_services").select("name, cancellation_policy").eq("id", r.service_id).maybeSingle(),
    supabase.from("concierge_events").select("occurred_at, to_status, note").eq("request_id", id).order("occurred_at", { ascending: false }),
    supabase.from("concierge_occurrences").select("kind, description, created_at").eq("request_id", id).order("created_at"),
  ]);
  const unit = r.unit as unknown as { code: string; development: { name: string } };
  const total = r.service_amount !== null ? Number(r.service_amount) + Number(r.ouz_fee ?? 0) : null;
  return (
    <>
      <PageHeader eyebrow={`Concierge #${r.number} · ${unit.development.name} ${unit.code}`} title={service?.name ?? "Serviço"} description={<Badge tone={CONCIERGE_STATUS_TONE[r.status]}>{CONCIERGE_STATUS_LABELS[r.status]}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-10">
          {r.status === "orcamento_enviado" && total !== null && (
            <Card className="p-6 border-warning/50">
              <h2 className="font-display text-xl mb-4">Orçamento e condições</h2>
              <DataList
                items={[
                  { label: "Valor do serviço", value: formatBRL(r.service_amount) },
                  { label: "Taxa OUZ", value: Number(r.ouz_fee ?? 0) > 0 ? formatBRL(r.ouz_fee) : "Sem taxa" },
                  { label: "Total", value: <strong>{formatBRL(total)}</strong> },
                  { label: "Válido até", value: r.quote_valid_until ? formatDate(r.quote_valid_until + "T12:00:00Z") : "—" },
                ]}
              />
              {r.conditions && <p className="text-sm text-ink-soft mt-4 whitespace-pre-line">{r.conditions}</p>}
              <p className="text-xs text-ink-mute mt-4">A aprovação não gera cobrança pelo aplicativo; a forma de pagamento é combinada com a OUZ.</p>
              <form action={decideConciergeQuote} className="flex gap-3 mt-5">
                <input type="hidden" name="id" value={id} />
                <SubmitButton name="decision" value="aprovar">Aprovar</SubmitButton>
                <SubmitButton name="decision" value="recusar" variant="ghost">Recusar</SubmitButton>
              </form>
            </Card>
          )}
          <DataList
            items={[
              { label: "Solicitado em", value: formatDateTime(r.created_at) },
              { label: "Preferência", value: r.preferred_at ? formatDateTime(r.preferred_at) : "—" },
              { label: "Agendado para", value: r.scheduled_at ? formatDateTime(r.scheduled_at) : "—" },
              ...(total !== null && r.status !== "orcamento_enviado" ? [{ label: "Valor combinado", value: `${formatBRL(total)}${Number(r.ouz_fee ?? 0) > 0 ? ` (inclui taxa OUZ de ${formatBRL(r.ouz_fee)})` : ""}` }] : []),
              ...(r.status_note ? [{ label: "Mensagem da OUZ", value: r.status_note }] : []),
              ...(r.cancel_reason ? [{ label: "Motivo do cancelamento", value: r.cancel_reason }] : []),
            ]}
          />
          <div><p className="eyebrow mb-1">Seu pedido</p><p className="whitespace-pre-line">{r.details}</p></div>
          {(occurrences ?? []).length > 0 && (
            <section>
              <SectionTitle title="Ocorrências" />
              <ul className="text-sm space-y-2">
                {occurrences!.map((o, i) => <li key={i}><Badge>{OCCURRENCE_LABELS[o.kind]}</Badge> {o.description} <span className="text-xs text-ink-mute">· {formatDateTime(o.created_at)}</span></li>)}
              </ul>
            </section>
          )}
          <section>
            <SectionTitle title="Histórico" />
            <ol className="border-l border-line pl-5 flex flex-col gap-3">
              {(events ?? []).map((e, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-ink-mute">{formatDateTime(e.occurred_at)}</p>
                  <p>{e.note ?? (e.to_status ? CONCIERGE_STATUS_LABELS[e.to_status] : "")}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {r.status === "concluida" && !r.rating && (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">Avalie o serviço</h2>
              <form action={rateConcierge} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={id} />
                <SelectField label="Nota" name="rating" required options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: String(n) }))} />
                <TextField label="Comentário" name="comment" />
                <SubmitButton size="sm">Enviar</SubmitButton>
              </form>
            </Card>
          )}
          {r.rating && <p className="text-sm">Sua avaliação: {r.rating}/5{r.rating_comment ? ` — ${r.rating_comment}` : ""}</p>}
          {CANCELLABLE.includes(r.status) && (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-2">Cancelar</h2>
              {service?.cancellation_policy && <p className="text-xs text-ink-mute mb-3">{service.cancellation_policy}</p>}
              <form action={cancelConcierge} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={id} />
                <TextField label="Motivo" name="reason" />
                <SubmitButton size="sm" variant="danger">Cancelar solicitação</SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
