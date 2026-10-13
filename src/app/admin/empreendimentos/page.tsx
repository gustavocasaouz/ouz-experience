import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, SelectField, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createDevelopment } from "@/server/actions/admin/developments";
import { hasPermission } from "@/server/auth/viewer";
import { ACCESS_MODE_LABELS, STAGE_LABELS, type BrokerAccessMode, type DevelopmentStage } from "@/lib/labels";

export const metadata = { title: "Empreendimentos" };

export default async function AdminDevelopments({ searchParams }: { searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas"], "/admin/empreendimentos");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("developments").select("id, name, slug, stage, is_published, broker_access_mode, is_demo").order("sort_order");
  return (
    <>
      <PageHeader eyebrow="Administração" title="Empreendimentos" />
      <Flash searchParams={searchParams} />
      {!data?.length ? (
        <EmptyState title="Nenhum empreendimento cadastrado" />
      ) : (
        <Table head={["Nome", "Fase", "Site", "Corretores"]} caption="Empreendimentos">
          {data.map((d) => (
            <tr key={d.id}>
              <Td>
                <Link href={`/admin/empreendimentos/${d.id}`} className="font-medium hover:underline underline-offset-4">{d.name}</Link>
                {d.is_demo && <Badge tone="warning" className="ml-2">Demonstrativo</Badge>}
              </Td>
              <Td>{STAGE_LABELS[d.stage as DevelopmentStage]}</Td>
              <Td>{d.is_published ? <Badge tone="success">Publicado</Badge> : <Badge>Não publicado</Badge>}</Td>
              <Td>{ACCESS_MODE_LABELS[d.broker_access_mode as BrokerAccessMode].label}</Td>
            </tr>
          ))}
        </Table>
      )}
      {hasPermission(viewer, "conteudo") && (
        <section className="mt-14">
          <SectionTitle title="Novo empreendimento" />
          <Card className="p-6">
            <form action={createDevelopment} className="grid gap-5 sm:grid-cols-2">
              <TextField label="Nome" name="name" required />
              <TextField label="Identificador na URL" name="slug" required hint="Ex.: uman (letras minúsculas, números e hífen)" />
              <SelectField label="Fase" name="stage" required options={Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }))} />
              <TextField label="Cidade" name="city" defaultValue="Florianópolis" required />
              <SubmitButton className="self-start">Criar</SubmitButton>
            </form>
          </Card>
        </section>
      )}
    </>
  );
}
