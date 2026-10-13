import { Badge, Card, CheckboxField, PageHeader, SectionTitle, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { StaffInviteForm } from "@/components/admin/staff-invite-form";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { updateStaffAccess } from "@/server/actions/admin/staff";
import { PERMISSION_LABELS, STAFF_PERMISSIONS, type StaffPermission } from "@/server/auth/permissions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Equipe" };

export default async function StaffPage({ searchParams }: { searchParams: SP }) {
  const { viewer, denied } = await staffWith(["administracao"], "/admin/equipe");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("staff_members").select("user_id, role, active, created_at, profile:profiles!staff_members_user_id_fkey(full_name, email), perms:staff_permissions(permission)").order("created_at"),
    supabase.from("staff_invitations").select("id, email, role, permissions, expires_at, accepted_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const isAdmin = viewer.staff.role === "administrador";

  return (
    <>
      <PageHeader eyebrow="Administração" title="Equipe" description="Operadores e administradores entram somente por convite. A verificação em duas etapas é obrigatória." />
      <Flash searchParams={searchParams} />

      <section className="mb-14">
        <SectionTitle title="Convidar" />
        <Card className="p-6">
          <StaffInviteForm canInviteAdmin={isAdmin} />
        </Card>
      </section>

      <section className="mb-14">
        <SectionTitle title="Membros" />
        <div className="flex flex-col gap-4">
          {(members ?? []).map((m) => {
            const profile = m.profile as unknown as { full_name: string; email: string } | null;
            const perms = new Set(((m.perms ?? []) as Array<{ permission: StaffPermission }>).map((p) => p.permission));
            return (
              <Card key={m.user_id} className="p-5">
                <details>
                  <summary className="cursor-pointer flex flex-wrap items-center gap-3">
                    <span className="font-medium">{profile?.full_name || profile?.email}</span>
                    <span className="text-sm text-ink-mute">{profile?.email}</span>
                    <Badge tone={m.role === "administrador" ? "accent" : "neutral"}>{m.role === "administrador" ? "Administrador" : "Operador"}</Badge>
                    {!m.active && <Badge tone="danger">Inativo</Badge>}
                  </summary>
                  <form action={updateStaffAccess} className="mt-5 flex flex-col gap-4">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField
                        label="Papel"
                        name="role"
                        id={`role-${m.user_id}`}
                        required
                        defaultValue={m.role}
                        disabled={!isAdmin}
                        options={[{ value: "operador", label: "Operador" }, { value: "administrador", label: "Administrador" }]}
                      />
                      <CheckboxField name="active" id={`active-${m.user_id}`} label="Acesso ativo" defaultChecked={m.active} className="sm:mt-8" />
                    </div>
                    {!isAdmin && <input type="hidden" name="role" value={m.role} />}
                    <fieldset className="grid gap-2 sm:grid-cols-3">
                      <legend className="text-sm font-medium mb-2">Permissões (operadores)</legend>
                      {STAFF_PERMISSIONS.map((p) => (
                        <CheckboxField key={p} id={`${m.user_id}-${p}`} name="permissions" value={p} label={PERMISSION_LABELS[p].label} defaultChecked={perms.has(p)} />
                      ))}
                    </fieldset>
                    <TextField label="Motivo da alteração" name="reason" required minLength={3} id={`reason-${m.user_id}`} />
                    <SubmitButton size="sm" className="self-start">Salvar</SubmitButton>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle title="Convites recentes" />
        <ul className="divide-y divide-line border-y border-line text-sm">
          {(invites ?? []).map((i) => (
            <li key={i.id} className="py-3 flex flex-wrap gap-3 items-center">
              <span className="font-medium">{i.email}</span>
              <Badge>{i.role === "administrador" ? "Administrador" : "Operador"}</Badge>
              {i.accepted_at ? (
                <Badge tone="success">Aceito em {formatDateTime(i.accepted_at)}</Badge>
              ) : i.revoked_at ? (
                <Badge tone="neutral">Substituído</Badge>
              ) : new Date(i.expires_at) < new Date() ? (
                <Badge tone="danger">Expirado</Badge>
              ) : (
                <Badge tone="warning">Expira em {formatDateTime(i.expires_at)}</Badge>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
