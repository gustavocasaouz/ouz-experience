import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { addGroupMember, removeGroupMember } from "@/server/actions/admin/groups";

type BrokerBasic = { user_id: string; full_name: string; creci: string; status: string };

export default async function GroupDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/grupos");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: group }, { data: members }, { data: brokers }] = await Promise.all([
    supabase.from("broker_groups").select("id, name, description").eq("id", id).maybeSingle(),
    supabase.from("broker_group_members").select("broker_user_id, added_at").eq("group_id", id),
    supabase.rpc("staff_list_brokers_basic"),
  ]);
  if (!group) notFound();
  const all = (brokers ?? []) as BrokerBasic[];
  const byId = new Map(all.map((b) => [b.user_id, b]));
  const memberIds = new Set((members ?? []).map((m) => m.broker_user_id));
  const candidates = all.filter((b) => b.status === "aprovado" && !memberIds.has(b.user_id));

  return (
    <>
      <PageHeader eyebrow="Grupo de corretores" title={group.name} description={group.description} />
      <Flash searchParams={searchParams} />
      <Card className="p-6 mb-8">
        <form action={addGroupMember} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <input type="hidden" name="group_id" value={id} />
          <div className="flex-1 flex flex-col gap-1.5">
            <label htmlFor="broker" className="text-sm font-medium">Adicionar corretor aprovado</label>
            <select id="broker" name="broker_user_id" required className="bg-surface border border-line px-3.5 py-2.5">
              <option value="">Selecione</option>
              {candidates.map((b) => <option key={b.user_id} value={b.user_id}>{b.full_name} (CRECI {b.creci})</option>)}
            </select>
          </div>
          <SubmitButton>Adicionar</SubmitButton>
        </form>
      </Card>
      <SectionTitle title="Membros" />
      {!members?.length ? (
        <EmptyState title="Grupo sem membros" />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const b = byId.get(m.broker_user_id);
            return (
              <li key={m.broker_user_id} className="py-3 flex items-center justify-between gap-3">
                <span>
                  {b?.full_name ?? "Corretor"} <span className="text-sm text-ink-mute">CRECI {b?.creci}</span>
                  {b && b.status !== "aprovado" && <span className="text-xs text-danger ml-2">(não aprovado — sem acesso)</span>}
                </span>
                <form action={removeGroupMember}>
                  <input type="hidden" name="group_id" value={id} />
                  <input type="hidden" name="broker_user_id" value={m.broker_user_id} />
                  <button className="text-sm underline underline-offset-4">Remover</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
