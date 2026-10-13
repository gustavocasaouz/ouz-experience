import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DataList, PageHeader, SectionTitle, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { Countdown } from "@/components/commercial/countdown";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { cancelReservation, concludeReview, convertReservation, extendReservation, reviewItem, startReview } from "@/server/actions/admin/commercial";
import { ACTIVE_RESERVATION_STATUSES, ITEM_STATUS_LABELS, RESERVATION_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

type Item = {
  id: string; label: string; required: boolean; status: string; rejection_reason: string | null; sort_order: number;
  files: Array<{ id: string; storage_path: string; uploaded_at: string; removed_at: string | null }>;
};

export default async function AdminReservation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["comercial", "documentos"], "/admin/reservas");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase
    .from("reservations")
    .select("*, broker:broker_profiles(full_name, email), unit:units(code), development:developments(name), proposal:proposals(id, client_name), items:reservation_items(id, label, required, status, rejection_reason, sort_order, files:reservation_files(id, storage_path, uploaded_at, removed_at)), extensions:reservation_extensions(deadline_field, previous_deadline, new_deadline, reason, extended_at)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const items = (r.items as Item[]).sort((a, b) => a.sort_order - b.sort_order);
  const inReview = ["documentacao_enviada", "aguardando_conferencia"].includes(r.status);
  const active = (ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(r.status);
  const canCommercial = hasPermission(viewer, "comercial");
  const proposal = r.proposal as { id: string; client_name: string };

  return (
    <>
      <PageHeader
        eyebrow={`${(r.development as { name: string }).name} · unidade ${(r.unit as { code: string }).code}`}
        title={`Reserva de ${proposal.client_name}`}
        description={<Badge>{RESERVATION_STATUS_LABELS[r.status]}</Badge>}
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-12">
          <div className="flex flex-wrap gap-10">
            {r.status === "aguardando_documentos" && <Countdown deadline={r.expires_at} label="Prazo de documentação" />}
            {r.status === "pendencias_documentacao" && r.regularization_deadline && <Countdown deadline={r.regularization_deadline} label="Prazo de regularização" />}
          </div>
          <DataList
            items={[
              { label: "Corretor", value: `${(r.broker as { full_name: string }).full_name}` },
              { label: "Proposta", value: <Link className="underline" href={`/admin/propostas/${proposal.id}`}>Abrir proposta</Link> },
              { label: "Pessoa", value: r.person_type === "pj" ? "Jurídica" : "Física" },
              { label: "Início da reserva", value: formatDateTime(r.starts_at) },
              { label: "Documentação enviada", value: formatDateTime(r.docs_submitted_at) },
              { label: "Validada em", value: formatDateTime(r.validated_at) },
              ...(r.end_reason ? [{ label: "Encerramento", value: `${formatDateTime(r.ended_at)} — ${r.end_reason}` }] : []),
            ]}
          />
          <section>
            <SectionTitle title="Documentos" />
            {r.status === "documentacao_enviada" && (
              <form action={startReview} className="mb-4">
                <input type="hidden" name="reservation_id" value={id} />
                <SubmitButton size="sm">Iniciar conferência</SubmitButton>
              </form>
            )}
            <ul className="divide-y divide-line border-y border-line">
              {items.map((it) => (
                <li key={it.id} className="py-4 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{it.label}</span>
                    {!it.required && <span className="text-xs text-ink-mute">(opcional)</span>}
                    <Badge tone={it.status === "aprovado" ? "success" : it.status === "recusado" ? "danger" : it.status === "enviado" ? "info" : "neutral"}>{ITEM_STATUS_LABELS[it.status]}</Badge>
                  </div>
                  {it.rejection_reason && <p className="text-sm text-danger">Recusa: {it.rejection_reason}</p>}
                  {it.files.filter((f) => !f.removed_at).map((f) => (
                    <a key={f.id} className="text-sm underline underline-offset-4" target="_blank" rel="noopener" href={`/arquivos/proposal-documents/${f.storage_path}`}>
                      Arquivo enviado em {formatDateTime(f.uploaded_at)}
                    </a>
                  ))}
                  {inReview && it.status !== "pendente" && (
                    <form action={reviewItem} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="reservation_id" value={id} />
                      <input type="hidden" name="item_id" value={it.id} />
                      <TextField label="Motivo (se recusar)" name="reason" id={`rs-${it.id}`} />
                      <SubmitButton size="sm" name="decision" value="aprovar" variant="secondary">Aprovar</SubmitButton>
                      <SubmitButton size="sm" name="decision" value="recusar" variant="danger">Recusar</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {r.status === "aguardando_conferencia" && (
              <form action={concludeReview} className="mt-4">
                <input type="hidden" name="reservation_id" value={id} />
                <SubmitButton>Concluir conferência</SubmitButton>
                <p className="text-xs text-ink-mute mt-2">Se houver itens recusados, a reserva vai para pendências com o prazo de regularização configurado.</p>
              </form>
            )}
          </section>
          {(r.extensions as unknown[]).length > 0 && (
            <section>
              <SectionTitle title="Prorrogações" />
              <ul className="text-sm space-y-2">
                {(r.extensions as Array<{ previous_deadline: string; new_deadline: string; reason: string; extended_at: string }>).map((e, i) => (
                  <li key={i}>{formatDateTime(e.extended_at)}: {formatDateTime(e.previous_deadline)} → {formatDateTime(e.new_deadline)} — {e.reason}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {canCommercial && active && (
          <aside className="flex flex-col gap-6">
            {["aguardando_documentos", "pendencias_documentacao"].includes(r.status) && (
              <Card className="p-5">
                <h2 className="font-display text-xl mb-3">Prorrogar prazo</h2>
                <form action={extendReservation} className="flex flex-col gap-3">
                  <input type="hidden" name="reservation_id" value={id} />
                  <TextField label="Horas adicionais" name="hours" type="number" min={1} max={240} defaultValue="24" required />
                  <TextArea label="Motivo" name="reason" rows={2} required minLength={5} />
                  <SubmitButton size="sm" variant="secondary">Prorrogar</SubmitButton>
                </form>
              </Card>
            )}
            {r.status === "documentacao_validada" && (
              <Card className="p-5">
                <h2 className="font-display text-xl mb-3">Venda concluída</h2>
                <form action={convertReservation} className="flex flex-col gap-3">
                  <input type="hidden" name="reservation_id" value={id} />
                  <TextField label="Referência (contrato)" name="reason" />
                  <SubmitButton size="sm">Registrar venda</SubmitButton>
                  <p className="text-xs text-ink-mute">Marca a unidade como vendida e encerra a fila. O contrato é assinado fora do Experience nesta fase.</p>
                </form>
              </Card>
            )}
            <Card className="p-5">
              <h2 className="font-display text-xl mb-3">Cancelar reserva</h2>
              <form action={cancelReservation} className="flex flex-col gap-3">
                <input type="hidden" name="reservation_id" value={id} />
                <TextArea label="Motivo" name="reason" rows={2} required minLength={5} />
                <SubmitButton size="sm" variant="danger">Cancelar e processar fila</SubmitButton>
              </form>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
