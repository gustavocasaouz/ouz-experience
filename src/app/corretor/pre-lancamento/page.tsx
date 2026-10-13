import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, RestrictedState, SectionTitle, Table, Td } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { PrelaunchForm } from "@/components/commercial/prelaunch-form";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { listUnitsWithPrices, queueLabel } from "@/server/queries/commercial";
import { cancelPrelaunch } from "@/server/actions/proposals";
import { REGISTRATION_STATUS_LABELS, UNIT_STATUS_LABELS } from "@/lib/labels";
import { formatBRL, formatDateTime, requestNow } from "@/lib/format";
import { maskDocument } from "@/domain/documentos";

export const metadata = { title: "Pré-lançamento" };

type Reg = {
  id: string; campaign_id: string; client_name: string; client_document: string; preferences: string | null; status: string; registered_at: string;
  wave: { name: string; window_starts_at: string | null; window_ends_at: string | null } | null;
};

export default async function BrokerPrelaunch({ searchParams }: { searchParams: SP }) {
  const viewer = await requireViewer("/corretor/pre-lancamento");
  if (viewer.broker?.status !== "aprovado") return <RestrictedState>Disponível apenas para corretores aprovados.</RestrictedState>;
  const supabase = await createSupabaseServerClient();
  const [{ data: campaigns }, { data: regs }] = await Promise.all([
    supabase.from("prelaunch_campaigns").select("id, name, status, max_registrations_per_client, priority_criteria, terms, development:developments(id, name)").neq("status", "rascunho").order("created_at", { ascending: false }),
    supabase.from("prelaunch_registrations").select("id, campaign_id, client_name, client_document, preferences, status, registered_at, wave:prelaunch_waves(name, window_starts_at, window_ends_at)").order("registered_at", { ascending: false }),
  ]);
  const registrations = (regs ?? []) as unknown as Reg[];
  const now = requestNow();
  const openWindow = (r: Reg) =>
    r.status === "convidado" && r.wave?.window_starts_at && r.wave.window_ends_at && new Date(r.wave.window_starts_at).getTime() <= now && new Date(r.wave.window_ends_at).getTime() > now;

  return (
    <>
      <PageHeader
        eyebrow="Corretor"
        title="Pré-lançamento"
        description="O registro de interesse não é proposta nem reserva: não garante unidade, preço ou compra, e não há cobrança."
      />
      <Flash searchParams={searchParams} />
      {!campaigns?.length ? (
        <EmptyState title="Nenhum pré-lançamento disponível" />
      ) : (
        <div className="flex flex-col gap-10">
          {campaigns.map((c) => {
            const dev = c.development as unknown as { id: string; name: string };
            const mine = registrations.filter((r) => r.campaign_id === c.id);
            return (
              <section key={c.id}>
                <SectionTitle eyebrow={dev.name} title={c.name} />
                <p className="text-sm text-ink-soft mb-4">
                  Critério de prioridade: {c.priority_criteria}. Limite de {c.max_registrations_per_client} registro(s) por cliente.
                  {c.status === "encerrada" && <Badge className="ml-2">Encerrado</Badge>}
                </p>
                {c.status === "aberta" && (
                  <Card className="p-6 mb-6">
                    <PrelaunchForm campaignId={c.id} />
                  </Card>
                )}
                {mine.length > 0 && (
                  <div className="flex flex-col gap-4">
                    {mine.map((r) => (
                      <Card key={r.id} className="p-5 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-3 justify-between">
                          <span>
                            <span className="font-medium">{r.client_name}</span> <span className="text-sm text-ink-mute">{maskDocument(r.client_document)} · {formatDateTime(r.registered_at)}</span>
                          </span>
                          <Badge tone={r.status === "convidado" ? "success" : r.status === "cancelado" || r.status === "janela_encerrada" ? "neutral" : "info"}>
                            {REGISTRATION_STATUS_LABELS[r.status]}
                          </Badge>
                        </div>
                        {r.wave?.window_ends_at && (
                          <p className="text-sm text-ink-soft">
                            {r.wave.name}: janela de {formatDateTime(r.wave.window_starts_at)} até {formatDateTime(r.wave.window_ends_at)}
                          </p>
                        )}
                        {openWindow(r) && <WindowUnits developmentId={dev.id} registrationId={r.id} />}
                        {["registrado", "em_analise_duplicidade", "em_onda"].includes(r.status) && (
                          <form action={cancelPrelaunch}>
                            <input type="hidden" name="id" value={r.id} />
                            <SubmitButton size="sm" variant="ghost">Cancelar registro</SubmitButton>
                          </form>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

async function WindowUnits({ developmentId, registrationId }: { developmentId: string; registrationId: string }) {
  const units = await listUnitsWithPrices(developmentId);
  if (!units.length) return <p className="text-sm text-ink-mute">Unidades ainda não disponíveis.</p>;
  return (
    <Table head={["Unidade", "Tipologia", "Preço de tabela", "Situação", "Fila", ""]} caption="Unidades liberadas na janela">
      {units.map((u) => (
        <tr key={u.id}>
          <Td className="font-medium">{u.code}</Td>
          <Td>{u.typology ?? "—"}</Td>
          <Td>{formatBRL(u.price)}</Td>
          <Td>{UNIT_STATUS_LABELS[u.status]}</Td>
          <Td className="text-sm text-ink-soft whitespace-nowrap">{queueLabel(u.queueCount) ?? "—"}</Td>
          <Td>
            {(u.status === "disponivel" || u.status === "reservada") && u.price !== null && (
              <Link className="text-sm underline underline-offset-4" href={`/corretor/propostas/nova?unidade=${u.id}&registro=${registrationId}`}>
                {u.status === "reservada" ? "Entrar na fila" : "Fazer proposta"}
              </Link>
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}
