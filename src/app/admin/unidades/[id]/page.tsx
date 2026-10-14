import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CheckboxField, EmptyState, PageHeader, SectionTitle, SelectField, Table, Td, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { ReceiptForm } from "@/components/admin/receipt-form";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { updateUnitDetails } from "@/server/actions/admin/developments";
import {
  addIndexedInstallment, addInstallment, addPunchItem, freezeIndex, setContractIndex, createDocument, registerPayment, answerInquiry, updateBooking, updateCustomization, updateDelivery, updatePunchItem, upsertContract,
} from "@/server/actions/admin/experience";
import {
  CUSTOMIZATION_STATUS_LABELS, DOCUMENT_CATEGORY_LABELS, INSTALLMENT_KIND_LABELS, INSTALLMENT_STATUS_LABELS, PUNCH_STATUS_LABELS, RECEIPT_STATUS_LABELS,
} from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime, formatDue, utcToBrasiliaLocalInput } from "@/lib/format";

const d = (v: string | null) => (v ? formatDate(v + "T12:00:00Z") : "—");

export default async function AdminUnitHub({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["documentos", "financeiro", "atendimento", "clientes", "comercial"], "/admin");
  if (denied) return denied;
  const { id } = await params;
  const can = {
    docs: hasPermission(viewer, "documentos"),
    fin: hasPermission(viewer, "financeiro"),
    att: hasPermission(viewer, "atendimento"),
    cli: hasPermission(viewer, "clientes") || hasPermission(viewer, "atendimento"),
    com: hasPermission(viewer, "comercial"),
  };
  const supabase = await createSupabaseServerClient();
  const { data: unit } = await supabase.from("units").select("id, code, tower, floor, typology, bedrooms, private_area_m2, parking, development:developments(id, name)").eq("id", id).maybeSingle();
  if (!unit) notFound();
  const dev = unit.development as unknown as { id: string; name: string };
  const ret = `/admin/unidades/${id}`;

  const [clients, docs, contract, custom, bookings, punch, delivery] = await Promise.all([
    can.cli ? supabase.from("client_units").select("relation, active, client:clients(id, full_name, email)").eq("unit_id", id).eq("active", true) : Promise.resolve({ data: null }),
    can.docs ? supabase.from("documents").select("id, category, title, visible_to_client, versions:document_versions(version_number, storage_path, uploaded_at)").eq("unit_id", id).order("created_at") : Promise.resolve({ data: null }),
    can.fin ? supabase.from("financial_contracts").select("id, contract_value, signed_on, notes, last_updated_at, index_name, base_index_value, late_interest_monthly_pct, late_fine_pct, post_habite_index, index_frozen_month").eq("unit_id", id).maybeSingle() : Promise.resolve({ data: null }),
    can.att ? supabase.from("customization_requests").select("*").eq("unit_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    can.att ? supabase.from("appointment_bookings").select("id, kind, status, slot:appointment_slots(starts_at, location)").eq("unit_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    can.att ? supabase.from("punch_list_items").select("*").eq("unit_id", id).order("created_at") : Promise.resolve({ data: null }),
    can.att ? supabase.from("unit_deliveries").select("*").eq("unit_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = contract.data as { id: string; contract_value: string; signed_on: string | null; notes: string | null; last_updated_at: string; index_name: string | null; base_index_value: string | null; late_interest_monthly_pct: string | null; late_fine_pct: string | null; post_habite_index: string | null; index_frozen_month: string | null } | null;
  const [inst, receipts, inquiries] = c
    ? await Promise.all([
        supabase.from("installments_view").select("*").eq("contract_id", c.id).order("due_date").order("number"),
        supabase.from("payment_receipts").select("*").eq("contract_id", c.id).order("uploaded_at", { ascending: false }),
        supabase.from("financial_inquiries").select("*").eq("contract_id", c.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  type I = { id: string; number: number; kind: string; due_date: string | null; late_days: number | null; indexed: boolean; index_quantity: string | null; index_value: string | null; inpc_factor: string | null; index_month: string | null; is_estimate: boolean; original_amount: string; monetary_update: string | null; interest: string | null; fine: string | null; updated_amount: string | null; paid_amount: string; paid_on: string | null; display_status: string; data_source: string };

  return (
    <>
      <Link href={`/admin/empreendimentos/${dev.id}/unidades`} className="text-sm text-ink-soft hover:text-ink">← Unidades do {dev.name}</Link>
      <PageHeader eyebrow={dev.name} title={`Unidade ${unit.code}`} description={[unit.typology, unit.private_area_m2 ? `${Number(unit.private_area_m2).toLocaleString("pt-BR")} m²` : null, unit.parking].filter(Boolean).join(" · ") || undefined} />
      <Flash searchParams={searchParams} />
      <nav aria-label="Seções" className="flex flex-wrap gap-4 text-sm mb-10">
        {can.com && <a className="underline" href="#dados">Dados</a>}
        {can.cli && <a className="underline" href="#clientes">Clientes</a>}
        {can.docs && <a className="underline" href="#documentos">Documentos</a>}
        {can.fin && <a className="underline" href="#financeiro">Financeiro</a>}
        {can.att && <a className="underline" href="#personalizacao">Personalização</a>}
        {can.att && <a className="underline" href="#entrega">Vistoria e entrega</a>}
      </nav>
      <div className="flex flex-col gap-16">
        {can.com && (
          <section id="dados">
            <SectionTitle title="Dados da unidade" />
            <Card className="p-6">
              <form action={updateUnitDetails} className="grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="unit_id" value={id} />
                <TextField label="Tipologia" name="typology" id="ud-t" defaultValue={unit.typology ?? ""} />
                <TextField label="Área privativa (m²)" name="private_area_m2" id="ud-a" inputMode="decimal" defaultValue={unit.private_area_m2 ? Number(unit.private_area_m2).toString().replace(".", ",") : ""} />
                <TextField label="Vagas" name="parking" id="ud-p" defaultValue={unit.parking ?? ""} placeholder="ex.: 7/7A no subsolo + 4C no térreo" />
                <TextField label="Dormitórios/suítes" name="bedrooms" id="ud-b" type="number" min={0} defaultValue={unit.bedrooms ?? ""} />
                <TextField label="Torre" name="tower" id="ud-to" defaultValue={unit.tower ?? ""} />
                <TextField label="Andar" name="floor" id="ud-f" type="number" defaultValue={unit.floor ?? ""} />
                <SubmitButton size="sm" variant="secondary" className="self-start">Salvar dados</SubmitButton>
              </form>
              <p className="text-xs text-ink-mute mt-3">Situação (disponível, vendida…) em Empreendimentos › Unidades. Preço pela tabela de preços (Comercial).</p>
            </Card>
          </section>
        )}
        {can.cli && (
          <section id="clientes">
            <SectionTitle title="Clientes vinculados" />
            {!(clients.data as unknown[] | null)?.length ? <p className="text-sm text-ink-mute">Nenhum cliente vinculado.</p> : (
              <ul className="text-sm space-y-1">
                {(clients.data as unknown as Array<{ relation: string; client: { id: string; full_name: string; email: string } }>).map((r) => (
                  <li key={r.client.id}><Link className="underline" href={`/admin/clientes/${r.client.id}`}>{r.client.full_name}</Link> · {r.client.email} · {r.relation}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {can.docs && (
          <section id="documentos">
            <SectionTitle title="Documentos da unidade" />
            <ul className="divide-y divide-line border-y border-line mb-6">
              {((docs.data ?? []) as Array<{ id: string; category: string; title: string; visible_to_client: boolean; versions: Array<{ version_number: number; storage_path: string; uploaded_at: string }> }>).map((doc) => {
                const vs = doc.versions.sort((a, b) => b.version_number - a.version_number);
                return (
                  <li key={doc.id} className="py-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
                      <span className="font-medium">{doc.title}</span>
                      {!doc.visible_to_client && <Badge tone="warning">Oculto ao cliente</Badge>}
                      {vs[0] && <a className="text-sm underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${vs[0].storage_path}`}>v{vs[0].version_number}</a>}
                    </div>
                    <form action={createDocument} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="unit_id" value={id} />
                      <input type="hidden" name="document_id" value={doc.id} />
                      <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-xs" aria-label={`Nova versão de ${doc.title}`} />
                      <input name="notes" placeholder="Nota da versão" className="border border-line bg-surface px-2 py-1 text-xs" aria-label="Nota da versão" />
                      <SubmitButton size="sm" variant="ghost">Nova versão</SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
            <Card className="p-6">
              <form action={createDocument} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="unit_id" value={id} />
                <SelectField label="Categoria" name="category" id="doc-cat" required options={Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
                <TextField label="Título" name="title" id="doc-title" required />
                <TextField label="Descrição" name="description" id="doc-desc" className="sm:col-span-2" />
                <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-sm sm:col-span-2" aria-label="Arquivo" />
                <CheckboxField name="visible" id="doc-vis" label="Visível ao cliente" defaultChecked />
                <SubmitButton size="sm" className="self-start">Publicar documento</SubmitButton>
              </form>
              <p className="text-xs text-ink-mute mt-3">Contratos já assinados são enviados como arquivo. Assinatura eletrônica será uma integração futura.</p>
            </Card>
          </section>
        )}

        {can.fin && (
          <section id="financeiro">
            <SectionTitle title="Financeiro do cliente" />
            <Card className="p-6 mb-6">
              <form action={upsertContract} className="grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="unit_id" value={id} />
                <TextField label="Valor contratado (R$)" name="contract_value" id="fc-val" required inputMode="decimal" defaultValue={c ? Number(c.contract_value).toFixed(2).replace(".", ",") : ""} />
                <TextField label="Assinado em" name="signed_on" id="fc-date" type="date" defaultValue={c?.signed_on ?? ""} />
                <TextField label="Observação" name="notes" id="fc-notes" defaultValue={c?.notes ?? ""} />
                <SubmitButton size="sm" variant="secondary" className="self-start">{c ? "Atualizar contrato" : "Cadastrar contrato"}</SubmitButton>
              </form>
              {c && <p className="text-xs text-ink-mute mt-3">Última atualização exibida ao cliente: {formatDateTime(c.last_updated_at)}</p>}
              {c?.index_name && (
                <form action={freezeIndex} className="flex flex-wrap items-end gap-3 mt-6 pt-6 border-t border-line">
                  <input type="hidden" name="unit_id" value={id} />
                  <input type="hidden" name="contract_id" value={c.id} />
                  <TextField label="Fixar correção a partir de (mês)" name="month" id="fc-fz" type="month" defaultValue={c.index_frozen_month?.slice(0, 7) ?? ""} hint={c.index_frozen_month ? `Fixada desde ${c.index_frozen_month.slice(5, 7)}/${c.index_frozen_month.slice(0, 4)}: nenhum CUB/INPC posterior é aplicado.` : "Os índices estão sendo aplicados normalmente."} />
                  <SubmitButton size="sm" variant="secondary">Fixar correção</SubmitButton>
                  {c.index_frozen_month && <button name="liberar" value="1" className="text-sm underline underline-offset-4">Voltar a corrigir</button>}
                </form>
              )}
              {c && (
                <form action={setContractIndex} className="grid gap-4 sm:grid-cols-3 mt-6 pt-6 border-t border-line">
                  {/* Encargos de atraso automáticos exigem a correção pelo CUB. */}
                  <input type="hidden" name="unit_id" value={id} />
                  <input type="hidden" name="contract_id" value={c.id} />
                  <SelectField label="Correção monetária" name="index_name" id="fc-idx" defaultValue={c.index_name ?? ""} placeholder="Sem índice (valores informados)" options={[{ value: "CUB-SC", label: "CUB-SC (mensal)" }]} />
                  <TextField label="CUB-base do contrato (R$)" name="base_index_value" id="fc-base" inputMode="decimal" defaultValue={c.base_index_value ? Number(c.base_index_value).toFixed(2).replace(".", ",") : ""} />
                  <TextField label="Juros de atraso (% ao mês, pro rata die)" name="late_interest" id="fc-li" inputMode="decimal" defaultValue={c.late_interest_monthly_pct ? Number(c.late_interest_monthly_pct).toString().replace(".", ",") : ""} />
                  <TextField label="Multa moratória (%)" name="late_fine" id="fc-lf" inputMode="decimal" defaultValue={c.late_fine_pct ? Number(c.late_fine_pct).toString().replace(".", ",") : ""} />
                  <CheckboxField label="Após o Habite-se, corrigir pelo INPC" name="post_inpc" id="fc-inpc" defaultChecked={c.post_habite_index === "INPC"} />
                  <SubmitButton size="sm" variant="secondary" className="self-end">Salvar correção e encargos</SubmitButton>
                  <p className="text-xs text-ink-mute sm:col-span-3">Com juros e multa preenchidos, parcelas vencidas recebem os encargos automaticamente e são atualizadas todo dia (juros simples ÷ 30 por dia de atraso; multa sobre parcela + juros). Vazios: juros e multa são informados manualmente.</p>
                </form>
              )}
            </Card>
            {c && (
              <>
                {((inst.data ?? []) as I[]).length > 0 && (
                  <Table head={["Nº", "Tipo", "Venc.", "Original", "Atualiz./Juros/Multa", "Atualizado", "Pago", "Situação", "Baixa"]} caption="Parcelas">
                    {((inst.data ?? []) as I[]).map((i) => (
                      <tr key={i.id}>
                        <Td>{i.number}</Td>
                        <Td>{INSTALLMENT_KIND_LABELS[i.kind]}</Td>
                        <Td className="whitespace-nowrap">{formatDue(i.due_date)}{i.late_days ? <span className="block text-xs text-danger">{i.late_days} dia(s) de atraso</span> : null}</Td>
                        <Td className="whitespace-nowrap">{formatBRL(i.original_amount)}{i.index_quantity && <span className="block text-xs text-ink-mute">{Number(i.index_quantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} CUB{i.indexed ? "" : " · sem reajuste"}{i.inpc_factor ? ` · INPC ×${Number(i.inpc_factor).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}` : ""}</span>}</Td>
                        <Td className="text-xs whitespace-nowrap">{[i.monetary_update, i.interest, i.fine].map((v) => (v ? formatBRL(v) : "—")).join(" / ")}</Td>
                        <Td className="whitespace-nowrap">{i.updated_amount ? formatBRL(i.updated_amount) : "—"}{i.is_estimate && !["paga", "cancelada", "renegociada"].includes(i.display_status) && <span className="block text-xs text-warning">estimativa{i.index_value ? ` (CUB ${formatBRL(i.index_value)})` : ""}</span>}</Td>
                        <Td className="whitespace-nowrap">{Number(i.paid_amount) > 0 ? `${formatBRL(i.paid_amount)}${i.paid_on ? ` ${d(i.paid_on)}` : ""}` : "—"}</Td>
                        <Td>{INSTALLMENT_STATUS_LABELS[i.display_status]}<span className="block text-xs text-ink-mute">{i.data_source}</span></Td>
                        <Td>
                          {!["paga", "cancelada", "renegociada"].includes(i.display_status) && (
                            <form action={registerPayment} className="flex flex-col gap-1 min-w-40">
                              <input type="hidden" name="unit_id" value={id} />
                              <input type="hidden" name="installment_id" value={i.id} />
                              <input name="amount" placeholder="Valor" inputMode="decimal" required className="border border-line px-2 py-1 text-xs" aria-label="Valor pago" />
                              <input name="paid_on" type="date" required className="border border-line px-2 py-1 text-xs" aria-label="Data do pagamento" />
                              <input name="reason" placeholder="Motivo/origem" className="border border-line px-2 py-1 text-xs" aria-label="Motivo" />
                              <button className="text-xs underline text-left">Registrar baixa</button>
                            </form>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
                <Card className="p-6 my-6">
                  <h3 className="font-medium mb-3">Lançar parcela</h3>
                  {c.index_name ? (
                    <>
                      <form action={addIndexedInstallment} className="grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="unit_id" value={id} />
                        <input type="hidden" name="contract_id" value={c.id} />
                        <TextField label="Nº" name="number" id="ix-n" type="number" min={1} required />
                        <SelectField label="Tipo" name="kind" id="ix-k" options={Object.entries(INSTALLMENT_KIND_LABELS).map(([value, label]) => ({ value, label }))} defaultValue="parcela" />
                        <TextField label="Vencimento (vazio = na entrega das chaves)" name="due_date" id="ix-d" type="date" />
                        <TextField label="Valor original (R$)" name="original_amount" id="ix-o" inputMode="decimal" required />
                        <CheckboxField label="Reajusta pelo CUB" name="indexed" id="ix-i" defaultChecked />
                        <SubmitButton size="sm" className="self-start">Lançar</SubmitButton>
                      </form>
                      <p className="text-xs text-ink-mute mt-3">Os CUBs são calculados pelo CUB-base do contrato; o valor reajustado é calculado com o CUB do mês do vencimento.</p>
                    </>
                  ) : (
                  <>
                  <form action={addInstallment} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="unit_id" value={id} />
                    <input type="hidden" name="contract_id" value={c.id} />
                    <TextField label="Nº" name="number" id="in-n" type="number" min={1} required />
                    <SelectField label="Tipo" name="kind" id="in-k" options={Object.entries(INSTALLMENT_KIND_LABELS).map(([value, label]) => ({ value, label }))} defaultValue="parcela" />
                    <TextField label="Vencimento (vazio = na entrega das chaves)" name="due_date" id="in-d" type="date" />
                    <TextField label="Valor original" name="original_amount" id="in-o" inputMode="decimal" required />
                    <TextField label="Atualização" name="monetary_update" id="in-u" inputMode="decimal" />
                    <TextField label="Juros" name="interest" id="in-j" inputMode="decimal" />
                    <TextField label="Multa" name="fine" id="in-m" inputMode="decimal" />
                    <TextField label="Valor atualizado" name="updated_amount" id="in-a" inputMode="decimal" />
                    <SubmitButton size="sm" className="self-start">Lançar</SubmitButton>
                  </form>
                  <p className="text-xs text-ink-mute mt-3">Sem índice configurado, o sistema não calcula correção, juros ou multa: informe os valores da OUZ. Para muitas parcelas, use a importação em Financeiro.</p>
                  </>
                  )}
                </Card>
                <ReceiptsAndInquiries ret={ret} receipts={receipts.data ?? []} inquiries={inquiries.data ?? []} />
              </>
            )}
          </section>
        )}

        {can.att && (
          <section id="personalizacao">
            <SectionTitle title="Personalização" />
            {!custom.data?.length ? <EmptyState title="Nenhuma solicitação" /> : (
              <div className="flex flex-col gap-4">
                {(custom.data as Array<{ id: string; title: string; description: string; status: string; ouz_response: string | null; quote_amount: string | null; quote_valid_until: string | null; created_at: string }>).map((r) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-3 mb-2"><span className="font-medium">{r.title}</span><Badge>{CUSTOMIZATION_STATUS_LABELS[r.status]}</Badge><span className="text-xs text-ink-mute">{formatDateTime(r.created_at)}</span></div>
                    <p className="text-sm text-ink-soft whitespace-pre-line mb-4">{r.description}</p>
                    <form action={updateCustomization} className="grid gap-3 sm:grid-cols-4">
                      <input type="hidden" name="unit_id" value={id} />
                      <input type="hidden" name="id" value={r.id} />
                      <SelectField label="Situação" name="status" id={`cs-${r.id}`} defaultValue={r.status} options={Object.entries(CUSTOMIZATION_STATUS_LABELS).filter(([v]) => v !== "aprovada").map(([value, label]) => ({ value, label }))} />
                      <TextField label="Orçamento (R$)" name="quote" id={`cq-${r.id}`} inputMode="decimal" defaultValue={r.quote_amount ? Number(r.quote_amount).toFixed(2).replace(".", ",") : ""} />
                      <TextField label="Válido até" name="valid_until" id={`cv-${r.id}`} type="date" defaultValue={r.quote_valid_until ?? ""} />
                      <TextField label="Resposta ao cliente" name="response" id={`cr-${r.id}`} defaultValue={r.ouz_response ?? ""} />
                      <SubmitButton size="sm" variant="secondary" className="self-start">Salvar e avisar</SubmitButton>
                    </form>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {can.att && (
          <section id="entrega">
            <SectionTitle title="Vistoria, pendências e entrega" />
            <h3 className="font-medium mb-2">Agendamentos</h3>
            {!(bookings.data as unknown[] | null)?.length ? <p className="text-sm text-ink-mute mb-6">Nenhum agendamento. Publique horários em <Link className="underline" href="/admin/entregas">Entregas</Link>.</p> : (
              <ul className="divide-y divide-line border-y border-line mb-6 text-sm">
                {(bookings.data as unknown as Array<{ id: string; kind: string; status: string; slot: { starts_at: string; location: string | null } }>).map((b) => (
                  <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                    <span>{b.kind === "vistoria" ? "Vistoria" : "Entrega de chaves"} · {formatDateTime(b.slot.starts_at)} · <Badge>{b.status}</Badge></span>
                    {b.status === "agendada" && (
                      <form action={updateBooking} className="flex gap-2">
                        <input type="hidden" name="unit_id" value={id} />
                        <input type="hidden" name="booking_id" value={b.id} />
                        <SubmitButton size="sm" variant="ghost" name="status" value="realizada">Realizada</SubmitButton>
                        <SubmitButton size="sm" variant="ghost" name="status" value="nao_compareceu">Não compareceu</SubmitButton>
                        <SubmitButton size="sm" variant="ghost" name="status" value="cancelada">Cancelar</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="font-medium mb-2">Pendências</h3>
            <ul className="divide-y divide-line border-y border-line mb-4">
              {((punch.data ?? []) as Array<{ id: string; location: string | null; description: string; status: string; ouz_note: string | null; client_note: string | null }>).map((p) => (
                <li key={p.id} className="py-3">
                  <p className="text-sm">{p.location && <span className="eyebrow mr-2">{p.location}</span>}{p.description} <Badge>{PUNCH_STATUS_LABELS[p.status]}</Badge></p>
                  {p.client_note && <p className="text-xs text-danger mt-1">Cliente: {p.client_note}</p>}
                  <form action={updatePunchItem} className="flex flex-wrap items-center gap-2 mt-2">
                    <input type="hidden" name="unit_id" value={id} />
                    <input type="hidden" name="id" value={p.id} />
                    <select name="status" defaultValue={["aberta", "em_andamento", "resolvida"].includes(p.status) ? p.status : "em_andamento"} className="border border-line bg-surface px-2 py-1 text-xs" aria-label="Situação">
                      <option value="aberta">Aberta</option><option value="em_andamento">Em andamento</option><option value="resolvida">Resolvida</option>
                    </select>
                    <input name="ouz_note" defaultValue={p.ouz_note ?? ""} placeholder="Nota ao cliente" className="border border-line bg-surface px-2 py-1 text-xs" aria-label="Nota ao cliente" />
                    <button className="text-xs underline">Salvar</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addPunchItem} className="flex flex-wrap items-end gap-3 mb-8">
              <input type="hidden" name="unit_id" value={id} />
              <TextField label="Local" name="location" id="pl-loc" />
              <TextField label="Pendência" name="description" id="pl-desc" required />
              <SubmitButton size="sm" variant="secondary">Registrar pendência</SubmitButton>
            </form>
            <Card className="p-6">
              <h3 className="font-medium mb-3">Entrega</h3>
              <form action={updateDelivery} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="unit_id" value={id} />
                <TextField label="Vistoria realizada em (Brasília)" name="inspection_done_at" id="dl-i" type="datetime-local" defaultValue={utcToBrasiliaLocalInput((delivery.data as { inspection_done_at?: string } | null)?.inspection_done_at)} />
                <TextField label="Chaves entregues em (Brasília)" name="keys_delivered_at" id="dl-k" type="datetime-local" defaultValue={utcToBrasiliaLocalInput((delivery.data as { keys_delivered_at?: string } | null)?.keys_delivered_at)} />
                <TextField label="Recebido por" name="received_by" id="dl-r" defaultValue={(delivery.data as { received_by?: string } | null)?.received_by ?? ""} />
                <TextArea label="Observações" name="notes" id="dl-n" rows={2} defaultValue={(delivery.data as { notes?: string } | null)?.notes ?? ""} />
                <SubmitButton size="sm" className="self-start">Salvar entrega</SubmitButton>
              </form>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}

function ReceiptsAndInquiries({ ret, receipts, inquiries }: { ret: string; receipts: Array<Record<string, unknown>>; inquiries: Array<Record<string, unknown>> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="font-medium mb-3">Comprovantes</h3>
        {!receipts.length ? <p className="text-sm text-ink-mute">Nenhum.</p> : receipts.map((r) => (
          <div key={String(r.id)} className="border-t border-line py-3 text-sm flex flex-col gap-2">
            <span>
              <a className="underline" target="_blank" rel="noopener" href={`/arquivos/client-documents/${r.storage_path}`}>Comprovante</a> · {formatDateTime(String(r.uploaded_at))}
              {r.informed_amount ? ` · ${formatBRL(String(r.informed_amount))}` : ""} · <Badge>{RECEIPT_STATUS_LABELS[String(r.status)]}</Badge>
            </span>
            {r.status === "enviado" && <ReceiptForm ret={ret} id={String(r.id)} />}
          </div>
        ))}
      </Card>
      <Card className="p-6">
        <h3 className="font-medium mb-3">Pedidos de esclarecimento</h3>
        {!inquiries.length ? <p className="text-sm text-ink-mute">Nenhum.</p> : inquiries.map((q) => (
          <div key={String(q.id)} className="border-t border-line py-3 text-sm flex flex-col gap-2">
            <p>{String(q.message)}</p>
            {q.response ? <p className="text-ink-soft">Resposta: {String(q.response)}</p> : (
              <form action={answerInquiry} className="flex flex-col gap-2">
                <input type="hidden" name="return_to" value={ret} />
                <input type="hidden" name="inquiry_id" value={String(q.id)} />
                <textarea name="response" required rows={2} className="border border-line bg-surface p-2" aria-label="Resposta" />
                <label className="text-xs flex items-center gap-2"><input type="checkbox" name="close" /> Encerrar após responder</label>
                <button className="text-xs underline self-start">Responder</button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
