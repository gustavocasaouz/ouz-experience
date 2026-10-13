import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { createClientRecord } from "@/server/actions/admin/clients";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: { searchParams: SP }) {
  const { viewer, denied } = await staffWith(["clientes", "atendimento"], "/admin/clientes");
  if (denied) return denied;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().replace(/[%,()]/g, "") : "";
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("clients")
    .select("id, full_name, email, user_id, is_demo, data_source, units:client_units(count)")
    .order("full_name")
    .limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await query;
  const canEdit = hasPermission(viewer, "clientes");

  return (
    <>
      <PageHeader eyebrow="Administração" title="Clientes" description="O acesso do cliente é liberado somente por convite ao e-mail cadastrado. CPF nunca é usado como credencial." />
      <Flash searchParams={searchParams} />
      <form className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="border border-line bg-surface px-3 py-2 text-sm w-72" />
      </form>
      {!data?.length ? (
        <EmptyState title="Nenhum cliente encontrado" />
      ) : (
        <Table head={["Cliente", "Unidades", "Conta", "Origem"]} caption="Clientes">
          {data.map((c) => (
            <tr key={c.id}>
              <Td>
                <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:underline underline-offset-4">{c.full_name}</Link>
                <span className="block text-xs text-ink-mute">{c.email}</span>
              </Td>
              <Td>{(c.units as unknown as Array<{ count: number }>)[0]?.count ?? 0}</Td>
              <Td>{c.user_id ? <Badge tone="success">Ativada</Badge> : <Badge tone="warning">Aguardando convite</Badge>}</Td>
              <Td className="text-xs text-ink-mute">{c.data_source}{c.is_demo ? " · demo" : ""}</Td>
            </tr>
          ))}
        </Table>
      )}
      {canEdit && (
        <section className="mt-14">
          <SectionTitle title="Novo cliente" />
          <Card className="p-6">
            <form action={createClientRecord} className="grid gap-5 sm:grid-cols-2">
              <TextField label="Nome completo ou razão social" name="full_name" required />
              <TextField label="E-mail" name="email" type="email" required hint="O convite será enviado para este e-mail." />
              <TextField label="Telefone" name="phone" type="tel" />
              <TextField label="CPF ou CNPJ" name="document" hint="Usado para identificação e detecção de duplicidade; nunca como senha." />
              <SubmitButton className="self-start">Cadastrar</SubmitButton>
            </form>
          </Card>
        </section>
      )}
    </>
  );
}
