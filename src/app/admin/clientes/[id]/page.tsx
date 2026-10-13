import { notFound } from "next/navigation";
import { Badge, Card, DataList, EmptyState, PageHeader, SectionTitle, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { ClientInviteForm } from "@/components/admin/client-invite-form";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { linkClientUnit, unlinkClientUnit, updateClientIdentity } from "@/server/actions/admin/clients";
import { formatCnpj, formatCpf, maskDocument } from "@/domain/documentos";
import { CLIENT_RELATION_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["clientes", "atendimento"], "/admin/clientes");
  if (denied) return denied;
  const { id } = await params;
  const canEdit = hasPermission(viewer, "clientes");
  const supabase = await createSupabaseServerClient();
  const [{ data: c }, { data: identity }, { data: links }, { data: invites }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    // Atendimento não tem acesso (RLS): retorna vazio.
    supabase.from("client_identities").select("document_type, document_number").eq("client_id", id).maybeSingle(),
    supabase.from("client_units").select("id, relation, active, linked_at, unlinked_at, unit:units(id, code, development:developments(name))").eq("client_id", id).order("linked_at"),
    canEdit ? supabase.from("client_invitations").select("created_at, expires_at, accepted_at, revoked_at").eq("client_id", id).order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: null }),
  ]);
  if (!c) notFound();

  let unitOptions: Array<{ value: string; label: string }> = [];
  if (canEdit) {
    const { data: units } = await supabase.from("units").select("id, code, development:developments(name)").order("code").limit(2000);
    unitOptions = (units ?? []).map((u) => ({ value: u.id, label: `${(u.development as unknown as { name: string }).name} — ${u.code}` }));
    unitOptions.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }
  const doc = identity ? (identity.document_type === "cpf" ? formatCpf(identity.document_number) : formatCnpj(identity.document_number)) : null;

  return (
    <>
      <PageHeader
        eyebrow="Cliente"
        title={c.full_name}
        description={c.user_id ? <Badge tone="success">Conta ativada</Badge> : <Badge tone="warning">Aguardando aceite do convite</Badge>}
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-12">
          <section>
            <SectionTitle title="Dados" />
            <DataList
              items={[
                { label: "E-mail", value: c.email },
                { label: "Telefone", value: c.phone ?? "—" },
                {
                  label: "CPF/CNPJ",
                  value: !canEdit && !doc ? "Restrito à permissão “Clientes”" : doc ? (
                    <details><summary className="cursor-pointer">{maskDocument(identity!.document_number)}</summary>{doc}</details>
                  ) : "Não informado",
                },
                { label: "Origem do dado", value: `${c.data_source}${c.external_ref ? ` · ${c.external_ref}` : ""}` },
              ]}
            />
            {canEdit && (
              <form action={updateClientIdentity} className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-end">
                <input type="hidden" name="client_id" value={id} />
                <TextField label={doc ? "Corrigir CPF/CNPJ" : "Informar CPF/CNPJ"} name="document" required />
                <SubmitButton variant="secondary">Salvar documento</SubmitButton>
              </form>
            )}
          </section>
          <section>
            <SectionTitle title="Unidades" />
            {!links?.length ? (
              <EmptyState title="Nenhuma unidade vinculada" />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {links.map((l) => {
                  const u = l.unit as unknown as { id: string; code: string; development: { name: string } };
                  return (
                    <li key={l.id} className={`py-3 flex items-center justify-between gap-3 ${l.active ? "" : "opacity-60"}`}>
                      <span>
                        {u.development.name} — <a className="underline" href={`/admin/unidades/${u.id}`}><strong>{u.code}</strong></a> · {CLIENT_RELATION_LABELS[l.relation]}
                        <span className="block text-xs text-ink-mute">
                          Vinculado em {formatDateTime(l.linked_at)}
                          {l.unlinked_at ? ` · encerrado em ${formatDateTime(l.unlinked_at)}` : ""}
                        </span>
                      </span>
                      {canEdit && l.active && (
                        <form action={unlinkClientUnit}>
                          <input type="hidden" name="client_id" value={id} />
                          <input type="hidden" name="link_id" value={l.id} />
                          <button className="text-sm underline underline-offset-4">Encerrar vínculo</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && (
              <form action={linkClientUnit} className="mt-6 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                <input type="hidden" name="client_id" value={id} />
                <SelectField label="Unidade" name="unit_id" required placeholder="Selecione" options={unitOptions} />
                <SelectField label="Vínculo" name="relation" required options={Object.entries(CLIENT_RELATION_LABELS).map(([value, label]) => ({ value, label }))} />
                <SubmitButton>Vincular</SubmitButton>
              </form>
            )}
          </section>
        </div>
        {canEdit && (
          <aside>
            <Card className="p-6 flex flex-col gap-4 xl:sticky xl:top-6">
              <h2 className="font-display text-xl">Convite de acesso</h2>
              <ClientInviteForm clientId={id} hasAccount={Boolean(c.user_id)} />
              {invites?.length ? (
                <ul className="text-xs text-ink-mute space-y-1 border-t border-line pt-3">
                  {invites.map((i, k) => (
                    <li key={k}>
                      {formatDateTime(i.created_at)} —{" "}
                      {i.accepted_at ? "aceito" : i.revoked_at ? "substituído" : new Date(i.expires_at) < new Date() ? "expirado" : "pendente"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
