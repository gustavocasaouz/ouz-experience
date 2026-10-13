import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { cx } from "@/design-system/cx";
import { staffWith } from "@/components/admin/require-perm";
import type { SP } from "@/components/admin/flash";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Chamados" };
const FILTERS = ["abertos", "aguardando_cliente", "resolvido", "encerrado", "todos"];
const OPEN = ["aberto", "em_analise", "agendado", "em_atendimento"];

export default async function AdminTickets({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["atendimento"], "/admin/chamados");
  if (denied) return denied;
  const sp = await searchParams;
  const f = typeof sp.status === "string" ? sp.status : "abertos";
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("tickets")
    .select("id, number, category, title, status, priority, scheduled_at, informed_deadline, created_at, unit:units(code, development:developments(name))")
    .order("created_at", { ascending: true })
    .limit(300);
  q = f === "abertos" ? q.in("status", OPEN) : f === "todos" ? q : q.eq("status", f);
  const { data } = await q;
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Chamados" description="A cobertura de garantia é avaliada manualmente pela equipe, nunca automaticamente." />
      <nav aria-label="Filtrar" className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((x) => (
          <Link key={x} href={`/admin/chamados?status=${x}`} aria-current={x === f ? "page" : undefined}
            className={cx("px-3 py-1.5 text-xs rounded-full border", x === f ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink")}>
            {x === "abertos" ? "Em aberto" : x === "todos" ? "Todos" : TICKET_STATUS_LABELS[x]}
          </Link>
        ))}
      </nav>
      {!data?.length ? <EmptyState title="Nenhum chamado neste filtro" /> : (
        <Table head={["Nº", "Assunto", "Unidade", "Categoria", "Prioridade", "Situação", "Aberto"]} caption="Chamados">
          {data.map((t) => {
            const u = t.unit as unknown as { code: string; development: { name: string } };
            return (
              <tr key={t.id}>
                <Td>#{t.number}</Td>
                <Td><Link className="font-medium hover:underline underline-offset-4" href={`/admin/chamados/${t.id}`}>{t.title}</Link></Td>
                <Td>{u.development.name} · {u.code}</Td>
                <Td>{TICKET_CATEGORY_LABELS[t.category]}</Td>
                <Td><Badge tone={t.priority === "urgente" ? "danger" : t.priority === "alta" ? "warning" : "neutral"}>{TICKET_PRIORITY_LABELS[t.priority]}</Badge></Td>
                <Td>{TICKET_STATUS_LABELS[t.status]}</Td>
                <Td className="text-sm whitespace-nowrap">{formatDateTime(t.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
