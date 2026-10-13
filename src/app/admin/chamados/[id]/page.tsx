import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CheckboxField, PageHeader, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { staffReplyTicket, staffUpdateTicket } from "@/server/actions/admin/experience";
import { COVERAGE_LABELS, TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime, utcToBrasiliaLocalInput } from "@/lib/format";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export default async function AdminTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["atendimento"], "/admin/chamados");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, number, category, title, description, status, priority, scheduled_at, informed_deadline, rating, rating_comment, created_at, unit:units(id, code, development:developments(name)), client:clients(id, full_name, email, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const [{ data: internal }, { data: messages }, { data: files }, { data: staff }] = await Promise.all([
    supabase.rpc("admin_ticket_internal", { p_ticket_id: id }),
    supabase.from("ticket_messages").select("id, body, from_staff, internal, created_at, author:profiles(full_name)").eq("ticket_id", id).order("created_at"),
    supabase.from("ticket_attachments").select("id, storage_path, uploaded_at").eq("ticket_id", id),
    supabase.rpc("staff_directory"),
  ]);
  const inn = ((internal ?? []) as Array<{ assigned_to: string | null; coverage: string; coverage_note: string | null }>)[0];
  const u = t.unit as unknown as { id: string; code: string; development: { name: string } };
  const c = t.client as unknown as { id: string; full_name: string; email: string; phone: string | null };
  return (
    <>
      <PageHeader eyebrow={`Chamado #${t.number} · ${TICKET_CATEGORY_LABELS[t.category]}`} title={t.title} description={<Badge>{TICKET_STATUS_LABELS[t.status]}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card className="p-5"><p className="text-xs text-ink-mute mb-2">{c.full_name} · {formatDateTime(t.created_at)}</p><p className="whitespace-pre-line">{t.description}</p></Card>
          {(messages ?? []).map((m) => (
            <Card key={m.id} className={`p-5 ${m.internal ? "border-warning/50 bg-warning-soft/40" : m.from_staff ? "bg-sand/40" : ""}`}>
              <p className="text-xs text-ink-mute mb-2">
                {m.from_staff ? `OUZ — ${(m.author as unknown as { full_name: string } | null)?.full_name ?? ""}` : c.full_name} · {formatDateTime(m.created_at)}
                {m.internal && " · NOTA INTERNA (invisível ao cliente)"}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </Card>
          ))}
          {(files ?? []).length > 0 && (
            <p className="text-sm">Anexos: {files!.map((f, i) => <a key={f.id} className="underline mr-3" target="_blank" rel="noopener" href={`/arquivos/ticket-attachments/${f.storage_path}`}>arquivo {i + 1}</a>)}</p>
          )}
          <form action={staffReplyTicket} className="flex flex-col gap-3">
            <input type="hidden" name="ticket_id" value={id} />
            <TextArea label="Mensagem" name="body" rows={4} required maxLength={4000} />
            <CheckboxField name="internal" label="Nota interna (não visível ao cliente)" />
            <SubmitButton className="self-start">Enviar</SubmitButton>
          </form>
          {t.rating && <p className="text-sm">Avaliação do cliente: <strong>{t.rating}/5</strong>{t.rating_comment ? ` — ${t.rating_comment}` : ""}</p>}
        </div>
        <aside className="flex flex-col gap-6">
          <Card className="p-5 text-sm flex flex-col gap-1">
            <p className="eyebrow mb-1">Cliente</p>
            <Link className="underline" href={`/admin/clientes/${c.id}`}>{c.full_name}</Link>
            <span>{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
            <Link className="underline mt-2" href={`/admin/unidades/${u.id}`}>{u.development.name} · {u.code}</Link>
          </Card>
          <Card className="p-5">
            <form action={staffUpdateTicket} className="flex flex-col gap-3">
              <input type="hidden" name="ticket_id" value={id} />
              <SelectField label="Situação" name="status" required defaultValue={t.status} options={opts(TICKET_STATUS_LABELS)} />
              <SelectField label="Prioridade" name="priority" required defaultValue={t.priority} options={opts(TICKET_PRIORITY_LABELS)} />
              <SelectField
                label="Responsável"
                name="assigned_to"
                placeholder="—"
                defaultValue={inn?.assigned_to ?? ""}
                options={((staff ?? []) as Array<{ user_id: string; full_name: string }>).map((s) => ({ value: s.user_id, label: s.full_name }))}
              />
              <TextField label="Atendimento agendado (Brasília)" name="scheduled_at" type="datetime-local" defaultValue={utcToBrasiliaLocalInput(t.scheduled_at)} />
              <TextField label="Prazo informado ao cliente" name="informed_deadline" type="date" defaultValue={t.informed_deadline ?? ""} />
              <SelectField label="Garantia (avaliação técnica manual)" name="coverage" required defaultValue={inn?.coverage ?? "nao_avaliado"} options={opts(COVERAGE_LABELS)} hint="Interno. Comunique ao cliente por mensagem quando decidido." />
              <TextArea label="Fundamentação da avaliação" name="coverage_note" rows={2} defaultValue={inn?.coverage_note ?? ""} />
              <SubmitButton size="sm">Salvar</SubmitButton>
            </form>
          </Card>
        </aside>
      </div>
    </>
  );
}
