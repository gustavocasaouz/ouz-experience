"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutbox } from "@/server/notifications/outbox";
import { ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, filesFrom, objectPath, validateUpload } from "@/server/files";
import { brasiliaLocalToUtcIso, parseBRL } from "@/lib/format";
import { back, failOn, guard, optStr, str } from "./util";

const flush = () => after(() => processOutbox(30).catch(() => undefined));
const obra = (dev: string) => `/admin/empreendimentos/${dev}/acompanhamento`;
const unitHub = (unit: string, anchor = "") => `/admin/unidades/${unit}${anchor}`;

// ---------------------------------------------------------------------------
// Acompanhamento (permissão Conteúdo)
// ---------------------------------------------------------------------------
export async function addMilestone(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", obra(dev));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("development_milestones").insert({
    development_id: dev,
    stage: str(fd, "stage"),
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    forecast_date: optStr(fd, "forecast_date"),
    sort_order: Number(str(fd, "sort_order") || 0),
    is_published: str(fd, "is_published") === "on",
  });
  failOn(error, obra(dev));
  back(obra(dev), "ok", "Marco criado.");
}

export async function updateMilestone(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", obra(dev));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("development_milestones")
    .update({ is_published: str(fd, "is_published") === "on", completed_on: optStr(fd, "completed_on") })
    .eq("id", str(fd, "id"));
  failOn(error, obra(dev));
  back(obra(dev), "ok", "Marco atualizado.");
}

export async function changeForecast(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", obra(dev));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_change_milestone_forecast", {
    p_milestone_id: str(fd, "id"),
    p_new_date: optStr(fd, "new_date"),
    p_reason: str(fd, "reason"),
    p_visible: str(fd, "visible") === "on",
  });
  failOn(error, obra(dev));
  back(obra(dev), "ok", "Previsão alterada; histórico registrado.");
}

export async function publishUpdate(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = obra(dev);
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { data: up, error } = await supabase
    .from("development_updates")
    .insert({ development_id: dev, title: str(fd, "title"), body: optStr(fd, "body"), published_at: str(fd, "publish") === "on" ? new Date().toISOString() : null })
    .select("id")
    .single();
  failOn(error, path);
  let order = 0;
  for (const f of filesFrom(fd, "media")) {
    const isVideo = f.type === "video/mp4";
    const err = isVideo ? (f.size > 50 * 1024 * 1024 ? "Vídeo acima de 50 MB." : null) : await validateUpload(f, ALLOWED_IMAGE_TYPES, 15 * 1024 * 1024);
    if (err) back(path, "erro", `${err} (${f.name}). A atualização foi criada sem esse arquivo.`);
    const key = objectPath(`empreendimento/${dev}/atualizacoes`, f);
    const r = await supabase.storage.from("client-media").upload(key, f, { contentType: f.type });
    if (r.error) back(path, "erro", "Falha no envio de mídia.");
    await supabase.from("development_update_media").insert({ update_id: up!.id, kind: isVideo ? "video" : "imagem", storage_path: key, sort_order: order++ });
  }
  const url = str(fd, "video_url");
  if (url) {
    if (!url.startsWith("https://")) back(path, "erro", "O link do vídeo precisa começar com https://");
    await supabase.from("development_update_media").insert({ update_id: up!.id, kind: "video", external_url: url, caption: optStr(fd, "video_caption"), sort_order: order++ });
  }
  back(path, "ok", str(fd, "publish") === "on" ? "Atualização publicada." : "Atualização salva como rascunho.");
}

export async function toggleUpdate(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", obra(dev));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("development_updates")
    .update({ published_at: str(fd, "publish") === "1" ? new Date().toISOString() : null })
    .eq("id", str(fd, "id"));
  failOn(error, obra(dev));
  back(obra(dev), "ok", "Atualização alterada.");
}

export async function addProgressReport(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = obra(dev);
  await guard("conteudo", path);
  const items = str(fd, "items")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [label, pct] = l.split(/[;\t]/);
      return { label: (label ?? "").trim(), percent: Number((pct ?? "").replace(",", ".").replace("%", "")) };
    });
  if (items.some((i) => !i.label || !Number.isFinite(i.percent) || i.percent < 0 || i.percent > 100)) back(path, "erro", "Itens no formato ETAPA;PERCENTUAL (0 a 100).");
  const overall = Number(str(fd, "overall").replace(",", "."));
  if (!Number.isFinite(overall) || overall < 0 || overall > 100) back(path, "erro", "Percentual geral entre 0 e 100.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("progress_reports").insert({
    development_id: dev,
    reference_date: str(fd, "reference_date"),
    overall_percent: overall,
    items,
    notes: optStr(fd, "notes"),
    published_at: str(fd, "publish") === "on" ? new Date().toISOString() : null,
  });
  failOn(error, path);
  back(path, "ok", "Evolução física registrada.");
}

export async function addAnnouncement(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = obra(dev);
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ development_id: dev, unit_id: optStr(fd, "unit_id"), title: str(fd, "title"), body: str(fd, "body") })
    .select("id")
    .single();
  failOn(error, path);
  if (str(fd, "publish") === "on") {
    const { data: n, error: e2 } = await supabase.rpc("admin_publish_announcement", { p_id: data!.id });
    failOn(e2, path);
    flush();
    back(path, "ok", `Comunicado publicado; ${n} cliente(s) avisado(s).`);
  }
  back(path, "ok", "Comunicado salvo como rascunho.");
}

export async function publishAnnouncement(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", obra(dev));
  const supabase = await createSupabaseServerClient();
  const { data: n, error } = await supabase.rpc("admin_publish_announcement", { p_id: str(fd, "id") });
  failOn(error, obra(dev));
  flush();
  back(obra(dev), "ok", `Comunicado publicado; ${n} cliente(s) avisado(s).`);
}

// ---------------------------------------------------------------------------
// Unidade: documentos (Documentos), financeiro (Financeiro), atendimento
// ---------------------------------------------------------------------------
export async function createDocument(fd: FormData) {
  const unit = optStr(fd, "unit_id");
  const dev = optStr(fd, "development_id");
  const path = unit ? unitHub(unit, "#documentos") : obra(dev!);
  await guard("documentos", path);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, "erro", "Selecione o arquivo.");
  const f = file as File;
  const err = await validateUpload(f, ALLOWED_DOC_TYPES, 50 * 1024 * 1024);
  if (err) back(path, "erro", err);
  const supabase = await createSupabaseServerClient();
  let docId = optStr(fd, "document_id");
  if (!docId) {
    const { data, error } = await supabase
      .from("documents")
      .insert({ unit_id: unit, development_id: unit ? null : dev, category: str(fd, "category"), title: str(fd, "title"), description: optStr(fd, "description"), visible_to_client: str(fd, "visible") === "on" })
      .select("id")
      .single();
    failOn(error, path);
    docId = data!.id;
  }
  const key = objectPath(unit ?? `empreendimento/${dev}`, f);
  const up = await supabase.storage.from("client-documents").upload(key, f, { contentType: f.type });
  if (up.error) back(path, "erro", "Falha no envio do arquivo.");
  const { data: v, error } = await supabase.rpc("admin_add_document_version", { p_document_id: docId, p_storage_path: key, p_mime: f.type, p_size: f.size, p_notes: optStr(fd, "notes") });
  failOn(error, path);
  flush();
  back(path, "ok", `Documento publicado (versão ${v}).`);
}

export async function upsertContract(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#financeiro");
  await guard("financeiro", path);
  const value = parseBRL(str(fd, "contract_value"));
  if (!value) back(path, "erro", "Informe o valor contratado.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("financial_contracts")
    .upsert({ unit_id: unit, contract_value: value, signed_on: optStr(fd, "signed_on"), notes: optStr(fd, "notes"), last_updated_at: new Date().toISOString() }, { onConflict: "unit_id" });
  failOn(error, path);
  back(path, "ok", "Contrato financeiro salvo.");
}

export async function addInstallment(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#financeiro");
  await guard("financeiro", path);
  const money = (k: string) => (str(fd, k) ? parseBRL(str(fd, k)) : null);
  const original = money("original_amount");
  if (original === null) back(path, "erro", "Informe o valor original.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("installments").insert({
    contract_id: str(fd, "contract_id"),
    number: Number(str(fd, "number")),
    kind: str(fd, "kind") || "parcela",
    due_date: optStr(fd, "due_date"), // vazio só é aceito para a parcela das chaves (regra do banco)
    original_amount: original,
    monetary_update: money("monetary_update"),
    interest: money("interest"),
    fine: money("fine"),
    updated_amount: money("updated_amount"),
  });
  failOn(error, path);
  back(path, "ok", "Parcela lançada.");
}

// Correção pelo CUB-SC: o banco calcula os CUBs e o valor reajustado (estimado até o CUB do mês ser cadastrado).
export async function setContractIndex(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#financeiro");
  await guard("financeiro", path);
  const indexed = str(fd, "index_name") === "CUB-SC";
  const base = indexed ? parseBRL(str(fd, "base_index_value")) : null;
  if (indexed && !base) back(path, "erro", "Informe o CUB-base do contrato.");
  const pct = (k: string) => (str(fd, k) ? Number(str(fd, k).replace(",", ".")) : null);
  const interest = pct("late_interest"), fine = pct("late_fine");
  if ((interest === null) !== (fine === null) || [interest, fine].some((v) => v !== null && !(v >= 0))) back(path, "erro", "Informe juros e multa (ou deixe ambos vazios).");
  const contract = str(fd, "contract_id");
  const supabase = await createSupabaseServerClient();
  if (!indexed) failOn((await supabase.rpc("admin_set_contract_charges", { p_contract_id: contract, p_interest_pct: null, p_fine_pct: null })).error, path);
  failOn((await supabase.rpc("admin_set_contract_index", { p_contract_id: contract, p_index: indexed ? "CUB-SC" : null, p_base: base })).error, path);
  if (indexed) failOn((await supabase.rpc("admin_set_contract_charges", { p_contract_id: contract, p_interest_pct: interest, p_fine_pct: fine })).error, path);
  failOn((await supabase.rpc("admin_set_contract_post_index", { p_contract_id: contract, p_index: indexed && str(fd, "post_inpc") === "on" ? "INPC" : null })).error, path);
  back(path, "ok", indexed ? "Correção e encargos salvos." : "Correção pelo índice removida.");
}

export async function addIndexedInstallment(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#financeiro");
  await guard("financeiro", path);
  const original = parseBRL(str(fd, "original_amount"));
  if (!original) back(path, "erro", "Informe o valor original.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_add_indexed_installment", {
    p_contract_id: str(fd, "contract_id"),
    p_number: Number(str(fd, "number")),
    p_kind: str(fd, "kind") || "parcela",
    p_due: optStr(fd, "due_date"),
    p_original: original,
    p_indexed: str(fd, "indexed") === "on",
  });
  failOn(error, path);
  back(path, "ok", "Parcela lançada.");
}

export async function setIndexValue(fd: FormData) {
  const path = "/admin/financeiro#indices";
  await guard("financeiro", path);
  const index = str(fd, "index") === "INPC" ? "INPC" : "CUB-SC";
  const month = str(fd, "month"); // AAAA-MM
  const raw = str(fd, "value");
  // CUB em reais (3.171,96); INPC em % com sinal (0,48 ou -0,12).
  const value = index === "INPC" ? (raw ? Number(raw.replace("%", "").replace(",", ".")) : NaN) : parseBRL(raw);
  if (!/^\d{4}-\d{2}$/.test(month) || value === null || !Number.isFinite(value)) back(path, "erro", "Informe o mês e o valor do índice.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_set_index_value", { p_index: index, p_month: `${month}-01`, p_value: value, p_note: optStr(fd, "note") });
  failOn(error, path);
  back(path, "ok", `${index} de ${month.slice(5)}/${month.slice(0, 4)} salvo; ${data ?? 0} parcela(s) em aberto recalculada(s).`);
}

/** Fixa (ou libera, com mês vazio) a correção monetária de um contrato ou de todos os contratos do empreendimento. */
export async function freezeIndex(fd: FormData) {
  const unit = optStr(fd, "unit_id");
  const path = unit ? unitHub(unit, "#financeiro") : "/admin/financeiro#indices";
  await guard("financeiro", path);
  const month = str(fd, "month"); // AAAA-MM ou vazio
  const release = str(fd, "liberar") === "1";
  if (!release && !/^\d{4}-\d{2}$/.test(month)) back(path, "erro", "Informe o mês a partir do qual a correção fica fixada.");
  const p_month = release ? null : `${month}-01`;
  const supabase = await createSupabaseServerClient();
  const { error } = unit
    ? await supabase.rpc("admin_freeze_contract_index", { p_contract_id: str(fd, "contract_id"), p_month })
    : await supabase.rpc("admin_freeze_development_index", { p_development_id: str(fd, "development_id"), p_month });
  failOn(error, path);
  back(path, "ok", p_month ? `Correção fixada a partir de ${month.slice(5)}/${month.slice(0, 4)}.` : "Correção liberada: os índices voltam a ser aplicados.");
}

export async function setHabiteSe(fd: FormData) {
  const path = "/admin/financeiro#indices";
  await guard("financeiro", path);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_set_habite_se", { p_development_id: str(fd, "development_id"), p_date: optStr(fd, "date") });
  failOn(error, path);
  back(path, "ok", `Habite-se salvo; ${data ?? 0} parcela(s) em aberto recalculada(s).`);
}

export async function registerPayment(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#financeiro");
  await guard("financeiro", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_register_payment", {
    p_installment_id: str(fd, "installment_id"),
    p_amount: parseBRL(str(fd, "amount")),
    p_paid_on: optStr(fd, "paid_on"),
    p_reason: str(fd, "reason") || "Baixa manual",
  });
  failOn(error, path);
  back(path, "ok", "Pagamento registrado (auditado).");
}

export async function reviewReceipt(fd: FormData) {
  const path = str(fd, "return_to") || "/admin/financeiro";
  await guard("financeiro", path);
  const supabase = await createSupabaseServerClient();
  const approve = str(fd, "decision") !== "recusar";
  const { error } = await supabase.rpc("admin_review_receipt", {
    p_receipt_id: str(fd, "receipt_id"),
    p_approve: approve,
    p_note: optStr(fd, "note"),
    p_register_payment: approve && str(fd, "decision") === "validar_baixar",
    p_amount: str(fd, "amount") ? parseBRL(str(fd, "amount")) : null,
    p_paid_on: optStr(fd, "paid_on"),
  });
  failOn(error, path);
  flush();
  back(path, "ok", approve ? "Comprovante validado." : "Comprovante recusado; cliente avisado.");
}

export async function answerInquiry(fd: FormData) {
  const path = str(fd, "return_to") || "/admin/financeiro";
  await guard("financeiro", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_answer_inquiry", { p_id: str(fd, "inquiry_id"), p_response: str(fd, "response"), p_close: str(fd, "close") === "on" });
  failOn(error, path);
  flush();
  back(path, "ok", "Resposta enviada ao cliente.");
}

export async function updateCustomization(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#personalizacao");
  await guard("atendimento", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_customization", {
    p_id: str(fd, "id"),
    p_status: str(fd, "status"),
    p_response: optStr(fd, "response"),
    p_quote: str(fd, "quote") ? parseBRL(str(fd, "quote")) : null,
    p_valid_until: optStr(fd, "valid_until"),
  });
  failOn(error, path);
  flush();
  back(path, "ok", "Solicitação atualizada; cliente avisado.");
}

export async function addPunchItem(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#entrega");
  await guard("atendimento", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("punch_list_items").insert({ unit_id: unit, location: optStr(fd, "location"), description: str(fd, "description") });
  failOn(error, path);
  back(path, "ok", "Pendência registrada.");
}

export async function updatePunchItem(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#entrega");
  await guard("atendimento", path);
  const status = str(fd, "status");
  if (!["aberta", "em_andamento", "resolvida"].includes(status)) back(path, "erro", "Situação inválida para a OUZ.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("punch_list_items")
    .update({ status, ouz_note: optStr(fd, "ouz_note"), resolved_at: status === "resolvida" ? new Date().toISOString() : null })
    .eq("id", str(fd, "id"));
  failOn(error, path);
  back(path, "ok", "Pendência atualizada.");
}

export async function updateDelivery(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#entrega");
  await guard("atendimento", path);
  const toIso = (k: string) => (str(fd, k) ? brasiliaLocalToUtcIso(str(fd, k)) : null);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("unit_deliveries").upsert({
    unit_id: unit,
    inspection_done_at: toIso("inspection_done_at"),
    keys_delivered_at: toIso("keys_delivered_at"),
    received_by: optStr(fd, "received_by"),
    notes: optStr(fd, "notes"),
  });
  failOn(error, path);
  back(path, "ok", "Entrega atualizada.");
}

export async function updateBooking(fd: FormData) {
  const unit = str(fd, "unit_id");
  const path = unitHub(unit, "#entrega");
  await guard("atendimento", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appointment_bookings").update({ status: str(fd, "status") }).eq("id", str(fd, "booking_id"));
  failOn(error, path);
  back(path, "ok", "Agendamento atualizado.");
}

export async function createSlots(fd: FormData) {
  const path = "/admin/entregas";
  await guard("atendimento", path);
  const start = brasiliaLocalToUtcIso(str(fd, "starts_at"));
  const minutes = Number(str(fd, "duration") || 60);
  const count = Math.min(Math.max(Number(str(fd, "count") || 1), 1), 40);
  const rows = Array.from({ length: count }, (_, i) => {
    const s = new Date(new Date(start).getTime() + i * minutes * 60_000);
    return { development_id: str(fd, "development_id"), kind: str(fd, "kind"), starts_at: s.toISOString(), ends_at: new Date(s.getTime() + minutes * 60_000).toISOString(), location: optStr(fd, "location") };
  });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appointment_slots").insert(rows);
  failOn(error, path);
  back(path, "ok", `${rows.length} horário(s) publicado(s).`);
}

export async function closeSlot(fd: FormData) {
  await guard("atendimento", "/admin/entregas");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appointment_slots").update({ is_open: false }).eq("id", str(fd, "slot_id"));
  failOn(error, "/admin/entregas");
  back("/admin/entregas", "ok", "Horário fechado.");
}

// ---------------------------------------------------------------------------
// Chamados (Atendimento)
// ---------------------------------------------------------------------------
export async function staffUpdateTicket(fd: FormData) {
  const id = str(fd, "ticket_id");
  const path = `/admin/chamados/${id}`;
  await guard("atendimento", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_ticket", {
    p_ticket_id: id,
    p_status: str(fd, "status"),
    p_priority: str(fd, "priority"),
    p_assigned_to: optStr(fd, "assigned_to"),
    p_scheduled_at: str(fd, "scheduled_at") ? brasiliaLocalToUtcIso(str(fd, "scheduled_at")) : null,
    p_informed_deadline: optStr(fd, "informed_deadline"),
    p_coverage: str(fd, "coverage"),
    p_coverage_note: optStr(fd, "coverage_note"),
  });
  failOn(error, path);
  flush();
  back(path, "ok", "Chamado atualizado.");
}

export async function staffReplyTicket(fd: FormData) {
  const id = str(fd, "ticket_id");
  const path = `/admin/chamados/${id}`;
  await guard("atendimento", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_ticket_message", { p_ticket_id: id, p_body: str(fd, "body"), p_internal: str(fd, "internal") === "on" });
  failOn(error, path);
  flush();
  back(path, "ok", str(fd, "internal") === "on" ? "Nota interna registrada." : "Resposta enviada ao cliente.");
}

// ---------------------------------------------------------------------------
// Eventos (Eventos)
// ---------------------------------------------------------------------------
export async function inviteToEvent(fd: FormData) {
  const id = str(fd, "event_id");
  const path = `/admin/eventos/${id}`;
  await guard("eventos", path);
  const emails = str(fd, "emails").split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean).slice(0, 500);
  if (!emails.length) back(path, "erro", "Informe ao menos um e-mail.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_invite_to_event", { p_event_id: id, p_emails: emails });
  failOn(error, path);
  const rows = (data ?? []) as Array<{ email: string; invited: boolean }>;
  const missing = rows.filter((r) => !r.invited).map((r) => r.email);
  back(path, missing.length ? "erro" : "ok", `${rows.length - missing.length} convidado(s).${missing.length ? ` Sem conta no Experience: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}` : ""}`);
}
