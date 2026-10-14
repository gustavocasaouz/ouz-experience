import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { cx } from "@/design-system/cx";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE } from "@/lib/labels";
import { formatBRL, formatDateTime } from "@/lib/format";

export const metadata = { title: "Propostas" };
const FILTERS = ["em_analise", "na_fila", "reservada", "reprovada", "retirada", "expirada", "concluida", "todas"];

export default async function AdminProposals({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["comercial"], "/admin/propostas");
  if (denied) return denied;
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "em_analise";
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("proposals")
    .select("id, status, client_name, offered_price, table_price, within_policy, submitted_at, broker:broker_profiles(full_name), unit:units(code), development:developments(name)")
    .neq("status", "rascunho")
    .order("submitted_at", { ascending: status === "em_analise" })
    .limit(300);
  if (status !== "todas") q = q.eq("status", status);
  const { data } = await q;
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Propostas" description="Propostas em análise aguardam decisão da OUZ. Aprovação comercial não é contrato." />
      <Flash searchParams={searchParams} />
      <nav aria-label="Filtrar" className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/propostas?status=${f}`} aria-current={f === status ? "page" : undefined}
            className={cx("px-3 py-1.5 text-xs rounded-full border", f === status ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink")}>
            {f === "todas" ? "Todas" : PROPOSAL_STATUS_LABELS[f]}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <EmptyState title="Nenhuma proposta neste filtro" />
      ) : (
        <Table head={["Enviada", "Unidade", "Corretor", "Cliente", "Valor / tabela", "Situação"]} caption="Propostas">
          {data.map((p) => (
            <tr key={p.id}>
              <Td className="whitespace-nowrap text-sm">{formatDateTime(p.submitted_at)}</Td>
              <Td>
                <Link href={`/admin/propostas/${p.id}`} className="font-medium hover:underline underline-offset-4">
                  {(p.development as unknown as { name: string }).name} · {(p.unit as unknown as { code: string }).code}
                </Link>
              </Td>
              <Td>{(p.broker as unknown as { full_name: string } | null)?.full_name ?? "—"}</Td>
              <Td>{p.client_name}</Td>
              <Td className="whitespace-nowrap text-sm">{formatBRL(p.offered_price)}<span className="block text-xs text-ink-mute">{formatBRL(p.table_price)}</span></Td>
              <Td>
                <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                {p.status === "em_analise" && p.within_policy === false && <span className="block text-xs text-ink-mute mt-1">Fora da política</span>}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
