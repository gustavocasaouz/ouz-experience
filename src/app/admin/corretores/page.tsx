import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { cx } from "@/design-system/cx";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { BROKER_STATUS_LABELS, type BrokerStatus } from "@/server/auth/permissions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Corretores" };
const FILTERS: Array<BrokerStatus | "todos"> = ["pendente", "ajustes_solicitados", "aprovado", "suspenso", "recusado", "revogado", "todos"];

export default async function BrokersPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["corretores"], "/admin/corretores");
  if (denied) return denied;
  const sp = await searchParams;
  const status = (typeof sp.status === "string" ? sp.status : "pendente") as BrokerStatus | "todos";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("broker_profiles")
    .select("user_id, full_name, email, creci_number, creci_uf, city, region, agency_name, status, created_at, status_changed_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (status !== "todos") query = query.eq("status", status);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;

  return (
    <>
      <PageHeader eyebrow="Administração" title="Corretores" description="Análise de cadastros. Aprovar não libera empreendimentos: use Empreendimentos › Acesso." />
      <Flash searchParams={searchParams} />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/corretores?status=${f}`}
              aria-current={f === status ? "page" : undefined}
              className={cx("px-3 py-1.5 text-xs rounded-full border", f === status ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink")}
            >
              {f === "todos" ? "Todos" : BROKER_STATUS_LABELS[f]}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="border border-line bg-surface px-3 py-2 text-sm w-64" />
        </form>
      </div>
      {!data?.length ? (
        <EmptyState title="Nenhum corretor neste filtro" />
      ) : (
        <Table head={["Nome", "CRECI", "Cidade", "Imobiliária", "Status", "Cadastro"]} caption="Corretores">
          {data.map((b) => (
            <tr key={b.user_id} className="hover:bg-sand/40">
              <Td>
                <Link href={`/admin/corretores/${b.user_id}`} className="font-medium underline-offset-4 hover:underline">{b.full_name}</Link>
                <span className="block text-xs text-ink-mute">{b.email}</span>
              </Td>
              <Td>{b.creci_number}/{b.creci_uf}</Td>
              <Td>{b.city} · {b.region}</Td>
              <Td>{b.agency_name ?? "—"}</Td>
              <Td><Badge tone={b.status === "aprovado" ? "success" : b.status === "pendente" || b.status === "ajustes_solicitados" ? "warning" : "danger"}>{BROKER_STATUS_LABELS[b.status as BrokerStatus]}</Badge></Td>
              <Td className="whitespace-nowrap">{formatDateTime(b.created_at)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
