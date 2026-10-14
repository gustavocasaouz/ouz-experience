import Link from "next/link";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { cx } from "@/design-system/cx";
import { staffWith } from "@/components/admin/require-perm";
import type { SP } from "@/components/admin/flash";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { CONCIERGE_STATUS_LABELS, CONCIERGE_STATUS_TONE } from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";

export const metadata = { title: "Concierge" };
const OPEN = ["solicitada", "em_analise", "orcamento_enviado", "aprovada_cliente", "agendada", "em_execucao"];
const FILTERS = ["abertas", "solicitada", "aprovada_cliente", "agendada", "concluida", "cancelada", "todas"];

export default async function AdminConcierge({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["concierge"], "/admin/concierge");
  if (denied) return denied;
  const sp = await searchParams;
  const f = typeof sp.status === "string" ? sp.status : "abertas";
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("concierge_requests")
    .select("id, number, status, preferred_at, scheduled_at, service_amount, ouz_fee, created_at, service:concierge_services(name), unit:units(code, development:developments(name))")
    .order("created_at")
    .limit(300);
  q = f === "abertas" ? q.in("status", OPEN) : f === "todas" ? q : q.eq("status", f);
  const { data } = await q;
  return (
    <>
      <PageHeader
        eyebrow="Concierge"
        title="Solicitações"
        description="Operado pela OUZ: o sistema não contrata, não cobra e não confirma nada automaticamente."
        actions={<ButtonLink href="/admin/concierge/catalogo" variant="secondary" size="sm">Catálogo e prestadores</ButtonLink>}
      />
      <nav aria-label="Filtrar" className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((x) => (
          <Link key={x} href={`/admin/concierge?status=${x}`} aria-current={x === f ? "page" : undefined}
            className={cx("px-3 py-1.5 text-xs rounded-full border", x === f ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink")}>
            {x === "abertas" ? "Em andamento" : x === "todas" ? "Todas" : CONCIERGE_STATUS_LABELS[x]}
          </Link>
        ))}
      </nav>
      {!data?.length ? <EmptyState title="Nenhuma solicitação neste filtro" /> : (
        <Table head={["Nº", "Serviço", "Unidade", "Situação", "Data", "Valor"]} caption="Solicitações de concierge">
          {data.map((r) => {
            const u = r.unit as unknown as { code: string; development: { name: string } };
            return (
              <tr key={r.id}>
                <Td>#{r.number}</Td>
                <Td><Link className="font-medium hover:underline underline-offset-4" href={`/admin/concierge/${r.id}`}>{(r.service as unknown as { name: string }).name}</Link></Td>
                <Td>{u.development.name} · {u.code}</Td>
                <Td><Badge tone={CONCIERGE_STATUS_TONE[r.status]}>{CONCIERGE_STATUS_LABELS[r.status]}</Badge></Td>
                <Td className="text-sm whitespace-nowrap">{r.scheduled_at ? `Agendado ${formatDateTime(r.scheduled_at)}` : r.preferred_at ? `Prefere ${formatDateTime(r.preferred_at)}` : formatDateTime(r.created_at)}</Td>
                <Td className="text-sm whitespace-nowrap">{r.service_amount !== null ? formatBRL(Number(r.service_amount) + Number(r.ouz_fee ?? 0)) : "—"}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
