import { notFound } from "next/navigation";
import { Badge, Card, DataList, PageHeader, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { rateTicket, replyTicket } from "@/server/actions/client";
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function ClientTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, number, category, title, description, status, scheduled_at, informed_deadline, rating, rated_at, created_at, unit:units(code, development:developments(name))")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const [{ data: messages }, { data: files }] = await Promise.all([
    supabase.from("ticket_messages").select("id, body, from_staff, created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("ticket_attachments").select("id, storage_path, uploaded_at").eq("ticket_id", id).order("uploaded_at"),
  ]);
  const unit = t.unit as unknown as { code: string; development: { name: string } };
  const closed = ["encerrado", "cancelado"].includes(t.status);
  return (
    <>
      <PageHeader eyebrow={`Chamado #${t.number}`} title={t.title} description={<Badge>{TICKET_STATUS_LABELS[t.status]}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <Card className="p-5">
            <p className="text-xs text-ink-mute mb-2">Você · {formatDateTime(t.created_at)}</p>
            <p className="whitespace-pre-line">{t.description}</p>
          </Card>
          {(messages ?? []).map((m) => (
            <Card key={m.id} className={`p-5 ${m.from_staff ? "border-accent/40 bg-sand/40" : ""}`}>
              <p className="text-xs text-ink-mute mb-2">{m.from_staff ? "OUZ" : "Você"} · {formatDateTime(m.created_at)}</p>
              <p className="whitespace-pre-line">{m.body}</p>
            </Card>
          ))}
          {!closed && (
            <form action={replyTicket} className="flex flex-col gap-3">
              <input type="hidden" name="ticket_id" value={id} />
              <TextArea label="Responder" name="body" rows={4} maxLength={4000} />
              <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" aria-label="Anexos" />
              <SubmitButton className="self-start">Enviar</SubmitButton>
            </form>
          )}
          {["resolvido", "encerrado"].includes(t.status) && !t.rated_at && (
            <Card className="p-5">
              <SectionTitle title="Avalie o atendimento" />
              <form action={rateTicket} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="ticket_id" value={id} />
                <SelectField label="Nota" name="rating" required options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} — ${["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente"][n]}` }))} />
                <TextField label="Comentário" name="comment" />
                <SubmitButton>Enviar avaliação</SubmitButton>
              </form>
            </Card>
          )}
          {t.rated_at && <p className="text-sm text-ink-soft">Você avaliou este atendimento com nota {t.rating}.</p>}
        </div>
        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <DataList
              items={[
                { label: "Unidade", value: `${unit.development.name} · ${unit.code}` },
                { label: "Categoria", value: TICKET_CATEGORY_LABELS[t.category] },
                { label: "Atendimento agendado", value: t.scheduled_at ? formatDateTime(t.scheduled_at) : "—" },
                { label: "Prazo informado", value: t.informed_deadline ? formatDate(t.informed_deadline + "T12:00:00Z") : "—" },
              ]}
            />
          </Card>
          {(files ?? []).length > 0 && (
            <Card className="p-5">
              <p className="eyebrow mb-2">Anexos</p>
              <ul className="text-sm space-y-1">
                {files!.map((f, i) => (
                  <li key={f.id}><a className="underline" target="_blank" rel="noopener" href={`/arquivos/ticket-attachments/${f.storage_path}`}>Anexo {i + 1}</a> · {formatDateTime(f.uploaded_at)}</li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
