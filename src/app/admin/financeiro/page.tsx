import Link from "next/link";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/design-system";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { ImportForm } from "@/components/admin/import-form";
import { ReceiptForm } from "@/components/admin/receipt-form";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { answerInquiry } from "@/server/actions/admin/experience";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Financeiro" };

type Unit = { id: string; code: string; development: { name: string } };

export default async function AdminFinance({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["financeiro"], "/admin/financeiro");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: receipts }, { data: inquiries }, { data: imports }] = await Promise.all([
    supabase.from("payment_receipts").select("id, storage_path, informed_amount, informed_paid_on, client_note, uploaded_at, contract:financial_contracts(unit:units(id, code, development:developments(name))), installment:installments(number, due_date)").eq("status", "enviado").order("uploaded_at"),
    supabase.from("financial_inquiries").select("id, message, created_at, contract:financial_contracts(unit:units(id, code, development:developments(name)))").eq("status", "aberta").order("created_at"),
    supabase.from("financial_imports").select("file_name, rows_count, summary, imported_at").order("imported_at", { ascending: false }).limit(10),
  ]);
  const unitOf = (r: { contract: unknown }) => (r.contract as { unit: Unit }).unit;
  return (
    <>
      <PageHeader eyebrow="Administração" title="Financeiro dos clientes" description="Conferência de comprovantes, esclarecimentos e importação. Não é ERP: valores informados pela OUZ." />
      <Flash searchParams={searchParams} />
      <section className="mb-14">
        <SectionTitle title={`Comprovantes aguardando conferência (${receipts?.length ?? 0})`} />
        {!receipts?.length ? <EmptyState title="Nada para conferir" /> : (
          <ul className="divide-y divide-line border-y border-line">
            {receipts.map((r) => {
              const u = unitOf(r);
              const inst = r.installment as unknown as { number: number; due_date: string } | null;
              return (
                <li key={r.id} className="py-4 flex flex-col gap-2 text-sm">
                  <p>
                    <Link className="font-medium underline" href={`/admin/unidades/${u.id}#financeiro`}>{u.development.name} · {u.code}</Link>
                    {" · "}{inst ? `parcela ${inst.number} (${formatDate(inst.due_date + "T12:00:00Z")})` : "sem parcela indicada"}
                    {" · "}{r.informed_amount ? formatBRL(r.informed_amount) : "valor não informado"}
                    {r.informed_paid_on ? ` em ${formatDate(r.informed_paid_on + "T12:00:00Z")}` : ""}
                    {" · "}<a className="underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${r.storage_path}`}>abrir arquivo</a>
                  </p>
                  {r.client_note && <p className="text-ink-soft">Cliente: {r.client_note}</p>}
                  <ReceiptForm ret="/admin/financeiro" id={r.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="mb-14">
        <SectionTitle title={`Pedidos de esclarecimento (${inquiries?.length ?? 0})`} />
        {!inquiries?.length ? <EmptyState title="Nenhum pedido aberto" /> : (
          <ul className="divide-y divide-line border-y border-line">
            {inquiries.map((q) => {
              const u = unitOf(q);
              return (
                <li key={q.id} className="py-4 text-sm flex flex-col gap-2">
                  <p className="text-xs text-ink-mute">{formatDateTime(q.created_at)} · <Link className="underline" href={`/admin/unidades/${u.id}#financeiro`}>{u.development.name} · {u.code}</Link></p>
                  <p>{q.message}</p>
                  <form action={answerInquiry} className="flex flex-col gap-2">
                    <input type="hidden" name="return_to" value="/admin/financeiro" />
                    <input type="hidden" name="inquiry_id" value={q.id} />
                    <textarea name="response" required rows={2} className="border border-line bg-surface p-2" aria-label="Resposta" />
                    <label className="text-xs flex items-center gap-2"><input type="checkbox" name="close" /> Encerrar após responder</label>
                    <button className="text-xs underline self-start">Responder ao cliente</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <SectionTitle title="Importar parcelas (CSV)" />
        <Card className="p-6 flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Separador ponto e vírgula. Cabeçalho exato:
            <code className="block bg-sand p-2 mt-2 text-xs break-all">empreendimento;unidade;numero;tipo;vencimento;valor_original;atualizacao;juros;multa;valor_atualizado;valor_pago;data_pagamento;situacao;referencia_externa</code>
            Empreendimento pelo nome ou identificador (ex.: soho). Datas DD/MM/AAAA. Valores em reais (1.234,56). A unidade precisa ter contrato financeiro cadastrado. Se houver qualquer erro, nada é gravado. Parcelas com o mesmo número são atualizadas.
          </p>
          <ImportForm />
          {imports?.length ? (
            <ul className="text-xs text-ink-mute border-t border-line pt-3 space-y-1">
              {imports.map((i, k) => <li key={k}>{formatDateTime(i.imported_at)} · {i.file_name} · {i.rows_count} linha(s) · {JSON.stringify(i.summary)}</li>)}
            </ul>
          ) : null}
        </Card>
      </section>
    </>
  );
}
