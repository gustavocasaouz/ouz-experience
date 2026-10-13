import Link from "next/link";
import { Card, EmptyState, PageHeader, SectionTitle, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createGroup } from "@/server/actions/admin/groups";

export const metadata = { title: "Grupos de corretores" };

export default async function GroupsPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/grupos");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("broker_groups").select("id, name, description, members:broker_group_members(count)").order("name");
  return (
    <>
      <PageHeader eyebrow="Administração" title="Grupos de corretores" description="Use grupos para liberar empreendimentos restritos (ex.: UMAN) a várias pessoas de uma vez." />
      <Flash searchParams={searchParams} />
      {!data?.length ? (
        <EmptyState title="Nenhum grupo criado" />
      ) : (
        <ul className="divide-y divide-line border-y border-line mb-14">
          {data.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/grupos/${g.id}`} className="flex justify-between py-4 hover:bg-sand/40 px-2">
                <span>
                  <span className="font-medium">{g.name}</span>
                  {g.description && <span className="block text-sm text-ink-mute">{g.description}</span>}
                </span>
                <span className="text-sm text-ink-soft">{(g.members as unknown as Array<{ count: number }>)[0]?.count ?? 0} corretores</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SectionTitle title="Novo grupo" />
      <Card className="p-6">
        <form action={createGroup} className="grid gap-5 sm:grid-cols-2">
          <TextField label="Nome" name="name" required />
          <TextField label="Descrição" name="description" />
          <SubmitButton className="self-start">Criar grupo</SubmitButton>
        </form>
      </Card>
    </>
  );
}
