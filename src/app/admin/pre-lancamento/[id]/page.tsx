import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, SectionTitle, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createWave, fillWave, openWaveWindow, resolveRegistration, setCampaignStatus, setRegistrationPriority } from "@/server/actions/admin/commercial";
import { REGISTRATION_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime, utcToBrasiliaLocalInput } from "@/lib/format";
import { maskDocument } from "@/domain/documentos";

type Reg = {
  id: string; client_name: string; client_document: string; preferences: string | null; status: string; registered_at: string;
  priority_rank: number | null; wave_id: string | null; broker: { full_name: string } | null;
};

export default async function AdminCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/pre-lancamento");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: c }, { data: waves }, { data: regs }, { data: flags }] = await Promise.all([
    supabase.from("prelaunch_campaigns").select("*, development:developments(name)").eq("id", id).maybeSingle(),
    supabase.from("prelaunch_waves").select("*").eq("campaign_id", id).order("sort_order").order("created_at"),
    supabase.from("prelaunch_registrations").select("id, client_name, client_document, preferences, status, registered_at, priority_rank, wave_id, broker:broker_profiles(full_name)").eq("campaign_id", id).order("priority_rank", { nullsFirst: false }).order("registered_at"),
    supabase.rpc("admin_prelaunch_review_flags", { p_campaign_id: id }),
  ]);
  const review = new Set(((flags ?? []) as Array<{ registration_id: string; review_required: boolean }>).filter((f) => f.review_required).map((f) => f.registration_id));
  if (!c) notFound();
  const registrations = (regs ?? []) as unknown as Reg[];
  const waveName = new Map((waves ?? []).map((w) => [w.id, w.name]));
  const waiting = registrations.filter((r) => r.status === "registrado" && !review.has(r.id)).length;

  return (
    <>
      <PageHeader
        eyebrow={`Pré-lançamento · ${(c.development as { name: string }).name}`}
        title={c.name}
        description={<Badge tone={c.status === "aberta" ? "success" : "neutral"}>{c.status === "aberta" ? "Aberta para registros" : c.status === "rascunho" ? "Rascunho" : "Encerrada"}</Badge>}
        actions={
          <form action={setCampaignStatus} className="flex gap-2">
            <input type="hidden" name="campaign_id" value={id} />
            {c.status !== "aberta" && <SubmitButton size="sm" name="status" value="aberta">Abrir registros</SubmitButton>}
            {c.status === "aberta" && <SubmitButton size="sm" name="status" value="encerrada" variant="secondary">Encerrar registros</SubmitButton>}
          </form>
        }
      />
      <Flash searchParams={searchParams} />
      <p className="text-sm text-ink-soft mb-10">Limite por cliente: {c.max_registrations_per_client}. Critério: {c.priority_criteria}. Para propostas, o modo de venda do empreendimento deve estar em “Pré-lançamento” e haver tabela vigente.</p>

      <section className="mb-14">
        <SectionTitle title="Ondas e janelas de proposta" />
        <div className="flex flex-col gap-4 mb-6">
          {(waves ?? []).map((w) => {
            const open = w.window_starts_at && w.window_ends_at && new Date(w.window_starts_at) <= new Date() && new Date(w.window_ends_at) > new Date();
            return (
              <Card key={w.id} className="p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{w.name}</span>
                  <span className="text-sm text-ink-mute">{registrations.filter((r) => r.wave_id === w.id).length} registro(s)</span>
                  {w.window_ends_at && <Badge tone={open ? "success" : "neutral"}>{open ? "Janela aberta" : "Janela"}: {formatDateTime(w.window_starts_at)} → {formatDateTime(w.window_ends_at)}</Badge>}
                </div>
                <form action={fillWave} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="campaign_id" value={id} />
                  <input type="hidden" name="wave_id" value={w.id} />
                  <TextField label={`Incluir próximos (aguardando: ${waiting})`} name="count" id={`fill-${w.id}`} type="number" min={1} defaultValue="10" />
                  <SubmitButton size="sm" variant="secondary">Incluir na onda</SubmitButton>
                </form>
                <form action={openWaveWindow} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="campaign_id" value={id} />
                  <input type="hidden" name="wave_id" value={w.id} />
                  <TextField label="Início (Brasília)" name="starts_at" id={`ws-${w.id}`} type="datetime-local" required defaultValue={utcToBrasiliaLocalInput(w.window_starts_at ?? new Date().toISOString())} />
                  <TextField label="Fim (Brasília)" name="ends_at" id={`we-${w.id}`} type="datetime-local" required defaultValue={utcToBrasiliaLocalInput(w.window_ends_at)} />
                  <SubmitButton size="sm">{w.released_at ? "Atualizar janela" : "Liberar preços e abrir janela"}</SubmitButton>
                </form>
              </Card>
            );
          })}
        </div>
        <form action={createWave} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaign_id" value={id} />
          <TextField label="Nova onda" name="name" id="new-wave" placeholder={`Onda ${(waves?.length ?? 0) + 1}`} />
          <TextField label="Ordem" name="sort_order" id="new-wave-order" type="number" defaultValue={String(waves?.length ?? 0)} />
          <SubmitButton size="sm" variant="secondary">Criar onda</SubmitButton>
        </form>
      </section>

      <section>
        <SectionTitle title={`Registros (${registrations.length})`} />
        <Table head={["Ordem", "Registro", "Corretor", "Cliente", "Preferências", "Status", ""]} caption="Registros de interesse">
          {registrations.map((r, i) => (
            <tr key={r.id}>
              <Td>{i + 1}{r.priority_rank !== null && <span className="block text-xs text-ink-mute">rank {r.priority_rank}</span>}</Td>
              <Td className="whitespace-nowrap text-sm">{formatDateTime(r.registered_at)}</Td>
              <Td>{r.broker?.full_name}</Td>
              <Td>{r.client_name}<span className="block text-xs text-ink-mute">{maskDocument(r.client_document)}</span></Td>
              <Td className="text-sm text-ink-soft max-w-56">{r.preferences ?? "—"}</Td>
              <Td>
                <Badge tone={r.status === "convidado" ? "success" : "neutral"}>{REGISTRATION_STATUS_LABELS[r.status]}</Badge>
                {review.has(r.id) && <Badge tone="warning" className="ml-1">Duplicidade: analisar</Badge>}
                {r.wave_id && <span className="block text-xs text-ink-mute">{waveName.get(r.wave_id)}</span>}
              </Td>
              <Td>
                <details>
                  <summary className="cursor-pointer text-xs underline">Ações</summary>
                  <div className="flex flex-col gap-3 mt-3 min-w-64">
                    {!["cancelado", "proposta_enviada"].includes(r.status) && (
                      <form action={resolveRegistration} className="flex flex-col gap-2">
                        <input type="hidden" name="campaign_id" value={id} />
                        <input type="hidden" name="registration_id" value={r.id} />
                        <TextField label="Motivo" name="reason" id={`rr-${r.id}`} required minLength={3} />
                        <div className="flex gap-2">
                          {review.has(r.id) && <SubmitButton size="sm" name="decision" value="aceitar">Aceitar</SubmitButton>}
                          <SubmitButton size="sm" name="decision" value="cancelar" variant="danger">Cancelar registro</SubmitButton>
                        </div>
                      </form>
                    )}
                    <form action={setRegistrationPriority} className="flex flex-col gap-2">
                      <input type="hidden" name="campaign_id" value={id} />
                      <input type="hidden" name="registration_id" value={r.id} />
                      <TextField label="Rank de prioridade (menor = antes)" name="rank" id={`rk-${r.id}`} type="number" defaultValue={r.priority_rank?.toString() ?? ""} />
                      <TextField label="Justificativa" name="reason" id={`rkj-${r.id}`} required minLength={5} />
                      <SubmitButton size="sm" variant="secondary">Salvar prioridade</SubmitButton>
                    </form>
                  </div>
                </details>
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}
