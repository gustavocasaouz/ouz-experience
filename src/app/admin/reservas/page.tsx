import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { cx } from "@/design-system/cx";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { runDeadlinesNow } from "@/server/actions/admin/commercial";
import { hasPermission } from "@/server/auth/viewer";
import { ACTIVE_RESERVATION_STATUSES, RESERVATION_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Reservas" };
const FILTERS = ["ativas", "documentacao_enviada", "aguardando_conferencia", "pendencias_documentacao", "documentacao_validada", "expirada", "cancelada", "convertida"];

export default async function AdminReservations({ searchParams }: { searchParams: SP }) {
  const { viewer, denied } = await staffWith(["comercial", "documentos"], "/admin/reservas");
  if (denied) return denied;
  const sp = await searchParams;
  const f = typeof sp.status === "string" ? sp.status : "ativas";
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("reservations")
    .select("id, status, starts_at, expires_at, docs_submitted_at, regularization_deadline, ended_at, broker:broker_profiles(full_name), unit:units(code), development:developments(name), proposal:proposals(client_name)")
    .order("expires_at", { ascending: true })
    .limit(300);
  q = f === "ativas" ? q.in("status", [...ACTIVE_RESERVATION_STATUSES]) : q.eq("status", f);
  const { data } = await q;
  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Reservas"
        description="Uma reserva ativa por unidade. Os prazos são processados automaticamente no servidor a cada minuto."
        actions={hasPermission(viewer, "comercial") ? (
          <form action={runDeadlinesNow}><SubmitButton size="sm" variant="secondary">Processar prazos agora</SubmitButton></form>
        ) : undefined}
      />
      <Flash searchParams={searchParams} />
      <nav aria-label="Filtrar" className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((x) => (
          <Link key={x} href={`/admin/reservas?status=${x}`} aria-current={x === f ? "page" : undefined}
            className={cx("px-3 py-1.5 text-xs rounded-full border", x === f ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink")}>
            {x === "ativas" ? "Ativas" : RESERVATION_STATUS_LABELS[x]}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <EmptyState title="Nenhuma reserva neste filtro" />
      ) : (
        <Table head={["Unidade", "Cliente", "Corretor", "Situação", "Prazo", "Início"]} caption="Reservas">
          {data.map((r) => {
            const deadline = r.status === "aguardando_documentos" ? r.expires_at : r.status === "pendencias_documentacao" ? r.regularization_deadline : null;
            return (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/reservas/${r.id}`} className="font-medium hover:underline underline-offset-4">
                    {(r.development as unknown as { name: string }).name} · {(r.unit as unknown as { code: string }).code}
                  </Link>
                </Td>
                <Td>{(r.proposal as unknown as { client_name: string }).client_name}</Td>
                <Td>{(r.broker as unknown as { full_name: string }).full_name}</Td>
                <Td><Badge tone={["documentacao_enviada", "aguardando_conferencia"].includes(r.status) ? "info" : r.status === "documentacao_validada" ? "success" : r.status === "pendencias_documentacao" ? "warning" : "neutral"}>{RESERVATION_STATUS_LABELS[r.status]}</Badge></Td>
                <Td className="whitespace-nowrap text-sm">{deadline ? formatDateTime(deadline) : r.docs_submitted_at ? `Enviada ${formatDateTime(r.docs_submitted_at)}` : "—"}</Td>
                <Td className="whitespace-nowrap text-sm text-ink-mute">{formatDateTime(r.starts_at)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
