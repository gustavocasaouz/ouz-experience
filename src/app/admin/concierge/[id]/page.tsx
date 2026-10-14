import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CheckboxField, DataList, PageHeader, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { conciergeOccurrence, conciergeQuote, conciergeSchedule, conciergeTransition } from "@/server/actions/admin/concierge";
import { CONCIERGE_STATUS_LABELS, CONCIERGE_STATUS_TONE, OCCURRENCE_LABELS } from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime, utcToBrasiliaLocalInput } from "@/lib/format";

const NEXT: Record<string, Array<{ to: string; label: string; danger?: boolean }>> = {
  solicitada: [{ to: "em_analise", label: "Iniciar análise" }, { to: "indisponivel", label: "Indisponível", danger: true }, { to: "cancelada", label: "Cancelar", danger: true }],
  em_analise: [{ to: "indisponivel", label: "Indisponível", danger: true }, { to: "cancelada", label: "Cancelar", danger: true }],
  orcamento_enviado: [{ to: "em_analise", label: "Retomar análise" }, { to: "cancelada", label: "Cancelar", danger: true }],
  aprovada_cliente: [{ to: "cancelada", label: "Cancelar", danger: true }],
  agendada: [{ to: "em_execucao", label: "Iniciar execução" }, { to: "cancelada", label: "Cancelar", danger: true }],
  em_execucao: [{ to: "concluida", label: "Concluir" }, { to: "cancelada", label: "Cancelar", danger: true }],
};

export default async function AdminConciergeRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["concierge"], "/admin/concierge");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase
    .from("concierge_requests")
    .select("id, number, status, details, preferred_at, scheduled_at, service_amount, ouz_fee, conditions, quote_valid_until, status_note, cancel_reason, cancelled_by_client, rating, rating_comment, created_at, service:concierge_services(name, category, requires_quote), unit:units(id, code, development:developments(name)), client:clients(full_name, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const [{ data: internal }, { data: providers }, { data: quotes }, { data: events }, { data: occ }] = await Promise.all([
    supabase.rpc("admin_concierge_internal", { p_id: id }),
    supabase.from("concierge_providers").select("id, name, categories").eq("active", true).order("name"),
    supabase.from("concierge_quotes").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("concierge_events").select("*").eq("request_id", id).order("occurred_at", { ascending: false }),
    supabase.from("concierge_occurrences").select("*").eq("request_id", id).order("created_at", { ascending: false }),
  ]);
  const svc = r.service as unknown as { name: string; category: string; requires_quote: boolean };
  const u = r.unit as unknown as { id: string; code: string; development: { name: string } };
  const cl = r.client as unknown as { full_name: string; phone: string | null };
  const prov = ((internal ?? []) as Array<{ provider_id: string | null; provider_name: string | null; provider_phone: string | null }>)[0];
  const provOpts = (providers ?? []).map((p) => ({ value: p.id, label: `${p.name}${(p.categories as string[]).includes(svc.category) ? "" : " (outra categoria)"}` }));
  const canQuote = ["solicitada", "em_analise", "orcamento_enviado", "recusada_cliente"].includes(r.status);
  const canSchedule = ["aprovada_cliente", "agendada"].includes(r.status) || (["solicitada", "em_analise"].includes(r.status) && !svc.requires_quote);

  return (
    <>
      <PageHeader eyebrow={`Concierge #${r.number}`} title={svc.name} description={<Badge tone={CONCIERGE_STATUS_TONE[r.status]}>{CONCIERGE_STATUS_LABELS[r.status]}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-10">
          <DataList
            items={[
              { label: "Cliente", value: `${cl.full_name}${cl.phone ? ` · ${cl.phone}` : ""}` },
              { label: "Unidade", value: <Link className="underline" href={`/admin/unidades/${u.id}`}>{u.development.name} · {u.code}</Link> },
              { label: "Preferência do cliente", value: r.preferred_at ? formatDateTime(r.preferred_at) : "—" },
              { label: "Agendado", value: r.scheduled_at ? formatDateTime(r.scheduled_at) : "—" },
              { label: "Prestador (interno)", value: prov?.provider_name ? `${prov.provider_name}${prov.provider_phone ? ` · ${prov.provider_phone}` : ""}` : "—" },
              { label: "Valor vigente", value: r.service_amount !== null ? `${formatBRL(r.service_amount)} + taxa OUZ ${formatBRL(r.ouz_fee ?? 0)}` : "—" },
              ...(r.rating ? [{ label: "Avaliação", value: `${r.rating}/5${r.rating_comment ? ` — ${r.rating_comment}` : ""}` }] : []),
              ...(r.cancel_reason ? [{ label: "Cancelamento", value: `${r.cancelled_by_client ? "Pelo cliente" : "Pela OUZ"}: ${r.cancel_reason}` }] : []),
            ]}
          />
          <div><p className="eyebrow mb-1">Pedido do cliente</p><p className="whitespace-pre-line">{r.details}</p></div>
          {(quotes ?? []).length > 0 && (
            <section>
              <SectionTitle title="Orçamentos enviados" />
              <ul className="text-sm space-y-1">
                {quotes!.map((q) => <li key={q.id}>{formatDateTime(q.created_at)}: {formatBRL(q.service_amount)} + taxa {formatBRL(q.ouz_fee)}{q.valid_until ? ` · válido até ${formatDate(q.valid_until + "T12:00:00Z")}` : ""}</li>)}
              </ul>
            </section>
          )}
          <section>
            <SectionTitle title="Ocorrências" />
            <form action={conciergeOccurrence} className="grid gap-3 sm:grid-cols-[12rem_1fr] mb-4">
              <input type="hidden" name="id" value={id} />
              <SelectField label="Tipo" name="kind" required options={Object.entries(OCCURRENCE_LABELS).map(([value, label]) => ({ value, label }))} />
              <TextField label="Descrição" name="description" required />
              <CheckboxField name="visible" label="Visível e notificada ao cliente" />
              <SubmitButton size="sm" variant="secondary" className="self-start">Registrar</SubmitButton>
            </form>
            <ul className="text-sm space-y-2">
              {(occ ?? []).map((o) => <li key={o.id}><Badge>{OCCURRENCE_LABELS[o.kind]}</Badge> {o.description} <span className="text-xs text-ink-mute">· {formatDateTime(o.created_at)}{o.visible_to_client ? " · visível ao cliente" : " · interna"}</span></li>)}
            </ul>
          </section>
          <section>
            <SectionTitle title="Histórico" />
            <ol className="border-l border-line pl-5 flex flex-col gap-3">
              {(events ?? []).map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-xs text-ink-mute">{formatDateTime(e.occurred_at)}</p>
                  <p>{e.note ?? (e.to_status ? CONCIERGE_STATUS_LABELS[e.to_status] : "")}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {NEXT[r.status] && (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">Andamento</h2>
              <form action={conciergeTransition} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={id} />
                <TextArea label="Mensagem ao cliente" name="note" rows={2} hint="Obrigatória para indisponível e cancelamento." />
                <div className="flex flex-wrap gap-2">
                  {NEXT[r.status]!.map((n) => <SubmitButton key={n.to} size="sm" name="to" value={n.to} variant={n.danger ? "danger" : "secondary"}>{n.label}</SubmitButton>)}
                </div>
              </form>
            </Card>
          )}
          {canQuote && (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">Orçamento e condições</h2>
              <form action={conciergeQuote} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={id} />
                <TextField label="Valor do serviço (R$)" name="service_amount" inputMode="decimal" required defaultValue={r.service_amount ? Number(r.service_amount).toFixed(2).replace(".", ",") : ""} />
                <TextField label="Taxa OUZ (R$)" name="ouz_fee" inputMode="decimal" defaultValue={r.ouz_fee ? Number(r.ouz_fee).toFixed(2).replace(".", ",") : ""} />
                <TextArea label="Condições" name="conditions" rows={3} defaultValue={r.conditions ?? ""} />
                <TextField label="Válido até" name="valid_until" type="date" defaultValue={r.quote_valid_until ?? ""} />
                <SelectField label="Prestador previsto (interno)" name="provider_id" placeholder="—" options={provOpts} defaultValue={prov?.provider_id ?? ""} />
                <SubmitButton size="sm">Enviar para aprovação do cliente</SubmitButton>
              </form>
            </Card>
          )}
          {canSchedule && (
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">{r.status === "agendada" ? "Reagendar" : "Agendar"}</h2>
              {!svc.requires_quote && ["solicitada", "em_analise"].includes(r.status) && <p className="text-xs text-ink-mute mb-3">Este serviço dispensa orçamento.</p>}
              <form action={conciergeSchedule} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={id} />
                <TextField label="Data e hora (Brasília)" name="scheduled_at" type="datetime-local" required defaultValue={utcToBrasiliaLocalInput(r.scheduled_at ?? r.preferred_at)} />
                <SelectField label="Prestador (interno)" name="provider_id" placeholder="—" options={provOpts} defaultValue={prov?.provider_id ?? ""} />
                <TextField label="Mensagem ao cliente" name="note" />
                <SubmitButton size="sm">Confirmar agendamento</SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
