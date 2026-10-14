import Link from "next/link";
import { Card, EmptyState, PageHeader, SectionTitle, SelectField, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { ImportForm } from "@/components/admin/import-form";
import { ReceiptForm } from "@/components/admin/receipt-form";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { answerInquiry, setHabiteSe, setIndexValue } from "@/server/actions/admin/experience";
import { formatBRL, formatDate, formatDateTime, formatDue, requestNow } from "@/lib/format";

export const metadata = { title: "Financeiro" };

type Unit = { id: string; code: string; development: { name: string } };

export default async function AdminFinance({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["financeiro"], "/admin/financeiro");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const [{ data: receipts }, { data: inquiries }, { data: imports }, { data: cub }, { count: estimates }, { data: inpc }, { data: devs }] = await Promise.all([
    supabase.from("payment_receipts").select("id, storage_path, informed_amount, informed_paid_on, client_note, uploaded_at, contract:financial_contracts(unit:units(id, code, development:developments(name))), installment:installments(number, due_date)").eq("status", "enviado").order("uploaded_at"),
    supabase.from("financial_inquiries").select("id, message, created_at, contract:financial_contracts(unit:units(id, code, development:developments(name)))").eq("status", "aberta").order("created_at"),
    supabase.from("financial_imports").select("file_name, rows_count, summary, imported_at").order("imported_at", { ascending: false }).limit(10),
    supabase.from("index_values").select("reference_month, value, source_note, created_at").eq("index_name", "CUB-SC").order("reference_month", { ascending: false }).limit(12),
    supabase.from("installments").select("id", { count: "exact", head: true }).eq("is_estimate", true).in("status", ["aberta", "parcialmente_paga"]),
    supabase.from("index_values").select("reference_month, value, source_note, created_at").eq("index_name", "INPC").order("reference_month", { ascending: false }).limit(12),
    supabase.from("developments").select("id, name, habite_se_date").eq("is_demo", false).order("sort_order"),
  ]);
  const thisMonth = new Date(requestNow()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const lastCub = cub?.[0]?.reference_month?.slice(0, 7);
  const my = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
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
              const inst = r.installment as unknown as { number: number; due_date: string | null } | null;
              return (
                <li key={r.id} className="py-4 flex flex-col gap-2 text-sm">
                  <p>
                    <Link className="font-medium underline" href={`/admin/unidades/${u.id}#financeiro`}>{u.development.name} · {u.code}</Link>
                    {" · "}{inst ? `parcela ${inst.number} (${formatDue(inst.due_date)})` : "sem parcela indicada"}
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
      <section id="indices" className="mb-14">
        <SectionTitle title="Índices mensais (CUB-SC e INPC)" />
        <Card className="p-6 flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Cadastre o CUB-SC (Sinduscon) e o INPC (IBGE, variação mensal em %) assim que forem publicados; as parcelas em aberto são recalculadas na hora.
            Até o Habite-se, vale o CUB do mês do vencimento; depois, nos contratos com INPC, o valor fica no CUB do mês do Habite-se corrigido pelo INPC acumulado.
            Enquanto faltar o índice do mês, o cliente vê <strong>estimativa</strong>. Parcelas pagas não mudam.
          </p>
          {lastCub && lastCub < thisMonth && <p className="text-sm text-warning">O CUB de {my(thisMonth)} ainda não foi cadastrado.</p>}
          <p className="text-xs text-ink-mute">{estimates ?? 0} parcela(s) em aberto exibidas como estimativa.</p>
          <form action={setIndexValue} className="grid gap-3 sm:grid-cols-5 items-end">
            <SelectField label="Índice" name="index" id="cub-i" defaultValue="CUB-SC" options={[{ value: "CUB-SC", label: "CUB-SC (R$)" }, { value: "INPC", label: "INPC (% no mês)" }]} />
            <TextField label="Mês" name="month" id="cub-m" type="month" required max={thisMonth} defaultValue={thisMonth} />
            <TextField label="Valor" name="value" id="cub-v" required inputMode="decimal" placeholder="CUB 3.171,96 · INPC 0,48" />
            <TextField label="Fonte/observação" name="note" id="cub-n" placeholder="Sinduscon/SC ou IBGE" />
            <SubmitButton size="sm" className="self-end">Salvar e recalcular</SubmitButton>
          </form>
          {cub?.length ? (
            <Table head={["Mês", "CUB-SC", "Fonte", "Cadastrado em"]} caption="Últimos valores do CUB-SC">
              {cub.map((c) => (
                <tr key={c.reference_month}>
                  <Td>{my(c.reference_month)}</Td>
                  <Td>{formatBRL(c.value)}</Td>
                  <Td className="text-xs text-ink-mute">{c.source_note ?? "—"}</Td>
                  <Td className="text-xs text-ink-mute">{formatDateTime(c.created_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : <EmptyState title="Nenhum CUB cadastrado" />}
          {inpc?.length ? (
            <Table head={["Mês", "INPC (variação)", "Fonte", "Cadastrado em"]} caption="Últimos valores do INPC">
              {inpc.map((c) => (
                <tr key={c.reference_month}>
                  <Td>{my(c.reference_month)}</Td>
                  <Td>{Number(c.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</Td>
                  <Td className="text-xs text-ink-mute">{c.source_note ?? "—"}</Td>
                  <Td className="text-xs text-ink-mute">{formatDateTime(c.created_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : <p className="text-xs text-ink-mute">Nenhum INPC cadastrado (necessário a partir do Habite-se).</p>}
          <div className="border-t border-line pt-4">
            <h3 className="font-medium mb-1">Habite-se</h3>
            <p className="text-xs text-ink-mute mb-3">A partir do mês do Habite-se, contratos marcados com INPC passam a ser corrigidos pelo INPC.</p>
            <ul className="flex flex-col gap-3">
              {(devs ?? []).map((dv) => (
                <li key={dv.id}>
                  <form action={setHabiteSe} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="development_id" value={dv.id} />
                    <TextField label={dv.name} name="date" id={`hs-${dv.id}`} type="date" defaultValue={dv.habite_se_date ?? ""} />
                    <SubmitButton size="sm" variant="secondary">Salvar</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </Card>
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
