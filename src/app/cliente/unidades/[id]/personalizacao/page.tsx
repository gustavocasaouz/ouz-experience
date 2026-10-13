import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, SectionTitle, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { myUnit } from "@/server/queries/client-unit";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { decideCustomization, requestCustomization } from "@/server/actions/client";
import { CUSTOMIZATION_STATUS_LABELS } from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";

export default async function ClientCustomization({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customization_requests")
    .select("id, title, description, status, ouz_response, quote_amount, quote_valid_until, created_at, updated_at")
    .eq("unit_id", id)
    .order("created_at", { ascending: false });
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div>
        <Flash searchParams={searchParams} />
        <SectionTitle title="Minhas solicitações" />
        {!data?.length ? (
          <EmptyState title="Nenhuma solicitação">A viabilidade, o custo e o prazo de cada personalização são analisados pela OUZ.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {data.map((r) => (
              <Card key={r.id} className="p-5 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge tone={r.status === "orcamento_enviado" ? "warning" : r.status === "aprovada" || r.status === "concluida" ? "success" : r.status === "recusada" || r.status === "cancelada" ? "neutral" : "info"}>
                    {CUSTOMIZATION_STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <p className="text-sm text-ink-soft whitespace-pre-line">{r.description}</p>
                <p className="text-xs text-ink-mute">Enviada em {formatDateTime(r.created_at)}</p>
                {r.ouz_response && <p className="text-sm border-l-2 border-accent pl-3">OUZ: {r.ouz_response}</p>}
                {r.status === "orcamento_enviado" && (
                  <form action={decideCustomization} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 mt-1">
                    <input type="hidden" name="unit_id" value={id} />
                    <input type="hidden" name="id" value={r.id} />
                    <span className="text-sm">
                      Orçamento: <strong>{formatBRL(r.quote_amount)}</strong>
                      {r.quote_valid_until && ` · válido até ${formatDate(r.quote_valid_until + "T12:00:00Z")}`}
                    </span>
                    <SubmitButton size="sm" name="decision" value="aprovar">Aprovar orçamento</SubmitButton>
                    <SubmitButton size="sm" name="decision" value="recusar" variant="ghost">Recusar</SubmitButton>
                  </form>
                )}
              </Card>
            ))}
          </ul>
        )}
      </div>
      <aside>
        <Card className="p-6">
          <h2 className="font-display text-xl mb-4">Nova solicitação</h2>
          <form action={requestCustomization} className="flex flex-col gap-4">
            <input type="hidden" name="unit_id" value={id} />
            <TextField label="O que deseja personalizar?" name="title" required maxLength={200} />
            <TextArea label="Detalhes" name="description" required rows={5} maxLength={4000} />
            <SubmitButton className="self-start">Enviar à OUZ</SubmitButton>
            <p className="text-xs text-ink-mute">O envio não garante a execução. A OUZ informa viabilidade, condições e prazo.</p>
          </form>
        </Card>
      </aside>
    </div>
  );
}
