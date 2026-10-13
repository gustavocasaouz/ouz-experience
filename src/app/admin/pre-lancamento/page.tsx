import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { createCampaign } from "@/server/actions/admin/commercial";

export const metadata = { title: "Pré-lançamento" };
const STATUS = { rascunho: "Rascunho", aberta: "Aberta", encerrada: "Encerrada" } as const;

export default async function AdminPrelaunch({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/pre-lancamento");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: campaigns }, { data: devs }] = await Promise.all([
    supabase.from("prelaunch_campaigns").select("id, name, status, created_at, development:developments(name), regs:prelaunch_registrations(count)").order("created_at", { ascending: false }),
    supabase.from("developments").select("id, name").order("sort_order"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Pré-lançamento" description="Registro de interesse e prioridade. Não é proposta, não reserva unidade e não há cobrança." />
      <Flash searchParams={searchParams} />
      {!campaigns?.length ? (
        <EmptyState title="Nenhuma campanha" />
      ) : (
        <ul className="divide-y divide-line border-y border-line mb-14">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/pre-lancamento/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 px-2 hover:bg-sand/40">
                <span>
                  <span className="eyebrow mr-3">{(c.development as unknown as { name: string }).name}</span>
                  <span className="font-medium">{c.name}</span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-ink-mute">{(c.regs as unknown as Array<{ count: number }>)[0]?.count ?? 0} registros</span>
                  <Badge tone={c.status === "aberta" ? "success" : "neutral"}>{STATUS[c.status as keyof typeof STATUS]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SectionTitle title="Nova campanha" />
      <Card className="p-6">
        <form action={createCampaign} className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Empreendimento" name="development_id" required options={(devs ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <TextField label="Nome" name="name" required />
          <TextField label="Máximo de registros por cliente" name="max" type="number" min={1} max={20} defaultValue="1" required />
          <TextField label="Critério de prioridade (exibido aos corretores)" name="priority_criteria" defaultValue="Ordem cronológica de registro" />
          <SubmitButton className="self-start">Criar</SubmitButton>
        </form>
      </Card>
    </>
  );
}
