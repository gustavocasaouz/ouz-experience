import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { setLeadStatus } from "@/server/actions/admin/content";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Interessados" };
const LABEL: Record<string, string> = { novo: "Novo", em_contato: "Em contato", encerrado: "Encerrado" };

export default async function LeadsPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["atendimento", "comercial"], "/admin/interessados");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("id, full_name, email, phone, message, is_broker, marketing_opt_in, status, created_at, development:developments(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  return (
    <>
      <PageHeader eyebrow="Administração" title="Interessados" description="Contatos recebidos pelo formulário público." />
      <Flash searchParams={searchParams} />
      {!data?.length ? (
        <EmptyState title="Nenhum contato recebido" />
      ) : (
        <Table head={["Recebido", "Contato", "Interesse", "Mensagem", "Status"]} caption="Interessados">
          {data.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap">{formatDateTime(l.created_at)}</Td>
              <Td>
                <span className="font-medium">{l.full_name}</span>
                <span className="block text-xs text-ink-mute">{l.email}{l.phone ? ` · ${l.phone}` : ""}</span>
                <span className="flex gap-1 mt-1">
                  {l.is_broker && <Badge>Corretor</Badge>}
                  {l.marketing_opt_in && <Badge tone="info">Aceita comunicações</Badge>}
                </span>
              </Td>
              <Td>{(l.development as unknown as { name: string } | null)?.name ?? "—"}</Td>
              <Td className="max-w-xs text-ink-soft">{l.message ?? "—"}</Td>
              <Td>
                <form action={setLeadStatus} className="flex gap-2 items-center">
                  <input type="hidden" name="id" value={l.id} />
                  <label htmlFor={`l-${l.id}`} className="sr-only">Status</label>
                  <select id={`l-${l.id}`} name="status" defaultValue={l.status} className="border border-line bg-surface px-2 py-1 text-sm">
                    {Object.entries(LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                  <button className="text-xs underline underline-offset-4">Salvar</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
