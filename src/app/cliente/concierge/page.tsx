import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, SelectField, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { listMyUnits } from "@/server/queries/client";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { requestConcierge } from "@/server/actions/client";
import { CONCIERGE_CATEGORY_LABELS, CONCIERGE_STATUS_LABELS, CONCIERGE_STATUS_TONE } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Concierge" };

type Service = { id: string; development_id: string; category: string; name: string; description: string | null; pricing_note: string | null; cancellation_policy: string | null; requires_quote: boolean };

export default async function ClientConcierge({ searchParams }: { searchParams: SP }) {
  const units = await listMyUnits();
  const supabase = await createSupabaseServerClient();
  const [{ data: services }, { data: requests }] = await Promise.all([
    supabase.from("concierge_services").select("id, development_id, category, name, description, pricing_note, cancellation_policy, requires_quote").order("sort_order"),
    supabase.from("concierge_requests").select("id, number, status, scheduled_at, created_at, service_id, unit_id").order("created_at", { ascending: false }).limit(50),
  ]);
  const all = (services ?? []) as Service[];
  const nameOf = new Map(all.map((s) => [s.id, s.name]));
  const sp = await searchParams;
  const chosen = typeof sp.servico === "string" ? all.find((s) => s.id === sp.servico) : undefined;
  const unitsForChosen = chosen ? units.filter((u) => u.development.id === chosen.development_id) : [];

  return (
    <>
      <PageHeader
        eyebrow="Área do cliente"
        title="Concierge"
        description="Serviços adicionais operados pela OUZ. A solicitação não é confirmação: a OUZ verifica a disponibilidade, envia condições quando necessário e só agenda após a sua aprovação."
      />
      <Flash searchParams={searchParams} />
      {chosen ? (
        <Card className="p-6 mb-12 max-w-3xl">
          <p className="eyebrow mb-1">{CONCIERGE_CATEGORY_LABELS[chosen.category]}</p>
          <h2 className="font-display text-2xl mb-2">{chosen.name}</h2>
          {chosen.description && <p className="text-sm text-ink-soft mb-2">{chosen.description}</p>}
          {chosen.cancellation_policy && <p className="text-xs text-ink-mute mb-4">Cancelamento: {chosen.cancellation_policy}</p>}
          <form action={requestConcierge} className="flex flex-col gap-4">
            <input type="hidden" name="service_id" value={chosen.id} />
            <SelectField label="Unidade" name="unit_id" required options={unitsForChosen.map((u) => ({ value: u.unit.id, label: `${u.development.name} · ${u.unit.code}` }))} />
            <TextArea label="O que você precisa?" name="details" required rows={4} maxLength={4000} hint="Quantidades, horários, acesso à unidade, observações." />
            <TextField label="Data e hora de preferência (Brasília)" name="preferred_at" type="datetime-local" hint="Preferência, não confirmação." />
            <div className="flex gap-3">
              <SubmitButton>Enviar solicitação</SubmitButton>
              <Link href="/cliente/concierge" className="text-sm underline self-center">Voltar ao catálogo</Link>
            </div>
          </form>
        </Card>
      ) : (
        <section className="mb-14">
          <SectionTitle title="Serviços disponíveis" />
          {all.length === 0 ? (
            <EmptyState title="Catálogo ainda não disponível">A OUZ publicará os serviços do seu empreendimento aqui.</EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {all.map((s) => (
                <li key={s.id}>
                  <Link href={`/cliente/concierge?servico=${s.id}`} className="block h-full border border-line bg-surface p-5 hover:border-ink transition-colors">
                    <p className="eyebrow mb-1">{CONCIERGE_CATEGORY_LABELS[s.category]}</p>
                    <p className="font-display text-xl">{s.name}</p>
                    {s.description && <p className="text-sm text-ink-soft mt-1">{s.description}</p>}
                    <p className="text-xs text-ink-mute mt-3">{s.pricing_note ?? (s.requires_quote ? "Sob orçamento" : "Sem orçamento prévio")}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section>
        <SectionTitle title="Minhas solicitações" />
        {!requests?.length ? (
          <EmptyState title="Nenhuma solicitação" />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/cliente/concierge/${r.id}`} className="py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-sand/40 px-2">
                  <span>
                    <span className="text-xs text-ink-mute mr-2">#{r.number}</span>
                    <span className="font-medium">{nameOf.get(r.service_id) ?? "Serviço"}</span>
                    <span className="block text-xs text-ink-mute">{r.scheduled_at && ["agendada", "em_execucao"].includes(r.status) ? `Agendado para ${formatDateTime(r.scheduled_at)}` : `Solicitado em ${formatDateTime(r.created_at)}`}</span>
                  </span>
                  <Badge tone={CONCIERGE_STATUS_TONE[r.status]}>{CONCIERGE_STATUS_LABELS[r.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
