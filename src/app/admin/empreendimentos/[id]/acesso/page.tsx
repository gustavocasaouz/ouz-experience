import { Badge, Card, EmptyState, RestrictedState, SectionTitle, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { grantAccess, revokeAccess, setAccessMode } from "@/server/actions/admin/developments";
import { ACCESS_MODE_LABELS, type BrokerAccessMode } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export default async function DevelopmentAccess({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  if (!hasPermission(viewer, "comercial")) {
    return (
      <>
        <DevelopmentHeader dev={dev} tab="acesso" />
        <RestrictedState>Autorizações de corretores exigem a permissão “Comercial”.</RestrictedState>
      </>
    );
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: grants }, { data: brokers }, { data: groups }] = await Promise.all([
    supabase
      .from("development_broker_grants")
      .select("id, broker_user_id, group_id, reason, granted_at, revoked_at, revoke_reason, group:broker_groups(name)")
      .eq("development_id", dev.id)
      .order("granted_at", { ascending: false }),
    supabase.rpc("staff_list_brokers_basic", { p_status: "aprovado" }),
    supabase.from("broker_groups").select("id, name").order("name"),
  ]);
  const brokerName = new Map(((brokers ?? []) as Array<{ user_id: string; full_name: string; creci: string }>).map((b) => [b.user_id, `${b.full_name} (CRECI ${b.creci})`]));
  const active = (grants ?? []).filter((g) => !g.revoked_at);
  const revoked = (grants ?? []).filter((g) => g.revoked_at);
  const label = (g: (typeof active)[number]) =>
    g.group_id ? `Grupo: ${(g.group as unknown as { name: string } | null)?.name ?? "—"}` : brokerName.get(g.broker_user_id!) ?? "Corretor (não aprovado no momento)";

  return (
    <>
      <DevelopmentHeader dev={dev} tab="acesso" />
      <Flash searchParams={searchParams} />
      <div className="flex flex-col gap-14">
        <section>
          <SectionTitle title="Modo de acesso" />
          <Card className="p-6">
            <form action={setAccessMode} className="flex flex-col gap-5">
              <input type="hidden" name="id" value={dev.id} />
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Modo</legend>
                {(Object.keys(ACCESS_MODE_LABELS) as BrokerAccessMode[]).map((m) => (
                  <label key={m} className="flex gap-3 border border-line p-4 cursor-pointer has-[:checked]:border-ink">
                    <input type="radio" name="mode" value={m} defaultChecked={dev.broker_access_mode === m} className="mt-1 accent-[var(--color-ink)]" />
                    <span>
                      <span className="font-medium">{ACCESS_MODE_LABELS[m].label}</span>
                      <span className="block text-sm text-ink-soft">{ACCESS_MODE_LABELS[m].description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <TextField label="Motivo" name="reason" />
              <SubmitButton className="self-start">Salvar modo</SubmitButton>
            </form>
          </Card>
        </section>

        <section>
          <SectionTitle title="Autorizações" />
          {dev.broker_access_mode !== "restrito" && (
            <p className="text-sm bg-info-soft text-info p-3 mb-4">
              As autorizações só têm efeito no modo “Restrito”. No modo atual ({ACCESS_MODE_LABELS[dev.broker_access_mode].label}) elas ficam registradas, mas não alteram o acesso.
            </p>
          )}
          <Card className="p-6 mb-6">
            <form action={grantAccess} className="grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={dev.id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="target" className="text-sm font-medium">Corretor aprovado ou grupo</label>
                <select id="target" name="target" required className="w-full bg-surface border border-line px-3.5 py-2.5 text-[15px]">
                  <option value="">Selecione</option>
                  <optgroup label="Grupos">
                    {(groups ?? []).map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
                  </optgroup>
                  <optgroup label="Corretores aprovados">
                    {[...brokerName.entries()].map(([id, name]) => <option key={id} value={`broker:${id}`}>{name}</option>)}
                  </optgroup>
                </select>
              </div>
              <TextField label="Motivo" name="reason" />
              <SubmitButton>Conceder</SubmitButton>
            </form>
          </Card>
          {active.length === 0 ? (
            <EmptyState title="Nenhuma autorização ativa" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {active.map((g) => (
                <li key={g.id} className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{label(g)}</p>
                    <p className="text-xs text-ink-mute">Desde {formatDateTime(g.granted_at)}{g.reason ? ` · ${g.reason}` : ""}</p>
                  </div>
                  <form action={revokeAccess} className="flex gap-2 items-end">
                    <input type="hidden" name="id" value={dev.id} />
                    <input type="hidden" name="grant_id" value={g.id} />
                    <TextField label="Motivo da revogação" name="reason" id={`rev-${g.id}`} required minLength={3} />
                    <SubmitButton size="sm" variant="secondary">Revogar</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {revoked.length > 0 && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-ink-soft">Histórico de revogações ({revoked.length})</summary>
              <ul className="mt-3 space-y-2">
                {revoked.map((g) => (
                  <li key={g.id} className="text-ink-mute">
                    {label(g)} — revogado em {formatDateTime(g.revoked_at)}: {g.revoke_reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-ink-mute mt-4"><Badge>Auditoria</Badge> Toda concessão, revogação e mudança de modo é registrada.</p>
        </section>
      </div>
    </>
  );
}
