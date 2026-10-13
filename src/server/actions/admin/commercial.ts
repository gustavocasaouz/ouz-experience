"use server";

import { after } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutbox } from "@/server/notifications/outbox";
import { brasiliaLocalToUtcIso, parseBRL } from "@/lib/format";
import { back, failOn, guard, optStr, str } from "./util";

const flush = () => after(() => processOutbox(20).catch(() => undefined));
const devPath = (id: string) => `/admin/empreendimentos/${id}/comercial`;

// ---------------------------------------------------------------------------
// Configurações, tabelas, políticas e checklist
// ---------------------------------------------------------------------------
export async function updateCommercialSettings(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("comercial", path);
  const parsed = z
    .object({
      sales_mode: z.enum(["fechado", "pre_lancamento", "aberto"]),
      reservation_hours: z.coerce.number().int().min(1).max(720),
      regularization_hours: z.coerce.number().int().min(1).max(720),
      keys_expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .safeParse({
      sales_mode: str(fd, "sales_mode"),
      reservation_hours: str(fd, "reservation_hours"),
      regularization_hours: str(fd, "regularization_hours"),
      keys_expected_date: optStr(fd, "keys_expected_date"),
    });
  if (!parsed.success) back(path, "erro", "Revise as configurações.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("development_commercial_settings")
    .update({
      ...parsed.data,
      regularization_expires: str(fd, "regularization_expires") === "on",
      show_queue_position: str(fd, "show_queue_position") === "on",
    })
    .eq("development_id", id);
  failOn(error, path);
  back(path, "ok", "Configurações comerciais salvas.");
}

export async function createPriceTableDraft(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_create_price_table_draft", { p_development_id: id, p_copy_current: str(fd, "copy") === "on" });
  failOn(error, path);
  back(path, "ok", "Rascunho de tabela criado.");
}

/** Linhas "UNIDADE;PREÇO" (ou tabulação, vindo de planilha). Valida tudo antes de gravar. */
export async function saveDraftPrices(fd: FormData) {
  const id = str(fd, "development_id");
  const tableId = str(fd, "price_table_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { data: units } = await supabase.from("units").select("id, code").eq("development_id", id);
  const byCode = new Map((units ?? []).map((u) => [u.code.trim().toUpperCase(), u.id]));
  const rows: Array<{ price_table_id: string; unit_id: string; price: number }> = [];
  const errors: string[] = [];
  str(fd, "prices")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const [code, value] = line.split(/[;\t]/).map((x) => x?.trim());
      const unitId = byCode.get((code ?? "").toUpperCase());
      const price = parseBRL(value ?? "");
      if (!unitId) errors.push(`linha ${i + 1}: unidade "${code}" não encontrada`);
      else if (!price || price <= 0) errors.push(`linha ${i + 1}: preço inválido`);
      else rows.push({ price_table_id: tableId, unit_id: unitId, price });
    });
  if (errors.length) back(path, "erro", `Nada foi gravado. ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}`);
  if (!rows.length) back(path, "erro", "Informe ao menos uma linha UNIDADE;PREÇO.");
  const { error } = await supabase.from("price_table_items").upsert(rows, { onConflict: "price_table_id,unit_id" });
  failOn(error, path, "Não foi possível gravar os preços (o rascunho ainda existe?).");
  back(path, "ok", `${rows.length} preço(s) gravado(s) no rascunho.`);
}

export async function deletePriceTableDraft(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("price_tables").delete().eq("id", str(fd, "price_table_id")).eq("status", "rascunho");
  failOn(error, path);
  back(path, "ok", "Rascunho descartado.");
}

export async function publishPriceTable(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_publish_price_table", { p_price_table_id: str(fd, "price_table_id"), p_notes: optStr(fd, "notes") });
  failOn(error, path);
  back(path, "ok", "Tabela publicada. Propostas já enviadas mantêm a versão usada; a fila será reavaliada na próxima promoção.");
}

export async function createPolicyDraft(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_create_sales_policy_draft", { p_development_id: id });
  failOn(error, path);
  back(path, "ok", "Rascunho de política criado (copiado da vigente, se houver).");
}

const NUM_KEYS = [
  "preco_minimo",
  "desconto_maximo_percentual",
  "entrada_minima_percentual",
  "percentual_minimo_ate_chaves",
  "prazo_maximo_meses",
  "parcelas_max_quantidade",
  "reforcos_max_quantidade",
  "permuta_max_percentual",
] as const;
const BOOL_KEYS = ["permuta_permitida", "exigir_analise_com_permuta", "exigir_analise_pessoa_juridica", "sempre_exigir_analise"] as const;

export async function savePolicyDraft(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const padrao: Record<string, number | boolean> = {};
  for (const k of NUM_KEYS) {
    const raw = str(fd, k);
    if (!raw) continue;
    const n = k === "preco_minimo" ? parseBRL(raw) : Number(raw.replace(",", "."));
    if (n === null || !Number.isFinite(n) || n < 0) back(path, "erro", `Valor inválido em ${k}.`);
    padrao[k] = n as number;
  }
  for (const k of BOOL_KEYS) if (str(fd, k) === "on") padrao[k] = true;
  if (str(fd, "permuta_permitida") !== "on") padrao.permuta_permitida = false;

  let overrides: { por_tipologia?: unknown; por_unidade?: unknown } = {};
  const rawOverrides = str(fd, "overrides");
  if (rawOverrides) {
    try {
      overrides = JSON.parse(rawOverrides);
    } catch {
      back(path, "erro", "As regras por tipologia/unidade precisam ser um JSON válido.");
    }
  }
  const isObj = (v: unknown) => v === undefined || (typeof v === "object" && v !== null && !Array.isArray(v));
  if (!isObj(overrides.por_tipologia) || !isObj(overrides.por_unidade)) back(path, "erro", "Formato: {\"por_tipologia\": {...}, \"por_unidade\": {...}}.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("sales_policies")
    .update({
      rules: { padrao, por_tipologia: overrides.por_tipologia ?? {}, por_unidade: overrides.por_unidade ?? {} },
      notes: optStr(fd, "notes"),
    })
    .eq("id", str(fd, "policy_id"))
    .eq("status", "rascunho");
  failOn(error, path);
  back(path, "ok", "Rascunho de política salvo.");
}

export async function publishPolicy(fd: FormData) {
  const id = str(fd, "development_id");
  const path = devPath(id);
  await guard("politicas", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_publish_sales_policy", { p_policy_id: str(fd, "policy_id"), p_notes: optStr(fd, "notes") });
  failOn(error, path);
  back(path, "ok", "Política publicada.");
}

export async function addChecklistItem(fd: FormData) {
  const devId = str(fd, "development_id") || null;
  const path = devId ? devPath(devId) : "/admin/reservas";
  await guard("comercial", path);
  const personType = str(fd, "person_type");
  if (!["pf", "pj"].includes(personType) || str(fd, "label").length < 2) back(path, "erro", "Informe o tipo e o nome do documento.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("document_checklist_items").insert({
    development_id: devId,
    person_type: personType,
    label: str(fd, "label").slice(0, 200),
    description: optStr(fd, "description"),
    required: str(fd, "required") === "on",
    sort_order: Number(str(fd, "sort_order") || 0),
  });
  failOn(error, path);
  back(path, "ok", "Item do checklist adicionado. Vale para reservas criadas a partir de agora.");
}

export async function toggleChecklistItem(fd: FormData) {
  const devId = str(fd, "development_id") || null;
  const path = devId ? devPath(devId) : "/admin/reservas";
  await guard("comercial", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("document_checklist_items").update({ active: str(fd, "active") === "1" }).eq("id", str(fd, "item_id"));
  failOn(error, path);
  back(path, "ok", "Checklist atualizado.");
}

// ---------------------------------------------------------------------------
// Propostas e fila
// ---------------------------------------------------------------------------
export async function decideProposal(fd: FormData) {
  const id = str(fd, "proposal_id");
  const path = `/admin/propostas/${id}`;
  await guard("comercial", path);
  const approve = str(fd, "decision") === "aprovar";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_decide_proposal", { p_proposal_id: id, p_approve: approve, p_reason: optStr(fd, "reason") });
  failOn(error, path);
  flush();
  const status = (data as { status: string }).status;
  back(path, "ok", approve ? (status === "reservada" ? "Aprovada: reserva criada." : "Aprovada: proposta entrou na fila da unidade.") : "Proposta não aprovada.");
}

export async function setQueuePriority(fd: FormData) {
  const id = str(fd, "proposal_id");
  const path = `/admin/propostas/${id}`;
  await guard("comercial", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_queue_priority", {
    p_proposal_id: id,
    p_priority: Number(str(fd, "priority") || 0),
    p_reason: str(fd, "reason"),
  });
  failOn(error, path);
  back(path, "ok", "Prioridade alterada e auditada.");
}

// ---------------------------------------------------------------------------
// Reservas e conferência
// ---------------------------------------------------------------------------
const resPath = (id: string) => `/admin/reservas/${id}`;

export async function startReview(fd: FormData) {
  const id = str(fd, "reservation_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_start_document_review", { p_reservation_id: id });
  failOn(error, resPath(id));
  back(resPath(id), "ok", "Conferência iniciada.");
}

export async function reviewItem(fd: FormData) {
  const id = str(fd, "reservation_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_review_reservation_item", {
    p_item_id: str(fd, "item_id"),
    p_approve: str(fd, "decision") === "aprovar",
    p_reason: optStr(fd, "reason"),
  });
  failOn(error, resPath(id));
  back(resPath(id), "ok", "Item conferido.");
}

export async function concludeReview(fd: FormData) {
  const id = str(fd, "reservation_id");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_conclude_document_review", { p_reservation_id: id });
  failOn(error, resPath(id));
  flush();
  back(resPath(id), "ok", data === "documentacao_validada" ? "Documentação validada." : "Pendências registradas; prazo de regularização iniciado.");
}

export async function extendReservation(fd: FormData) {
  const id = str(fd, "reservation_id");
  await guard("comercial", resPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_extend_reservation", { p_reservation_id: id, p_hours: Number(str(fd, "hours")), p_reason: str(fd, "reason") });
  failOn(error, resPath(id));
  flush();
  back(resPath(id), "ok", "Prazo estendido e auditado.");
}

export async function cancelReservation(fd: FormData) {
  const id = str(fd, "reservation_id");
  await guard("comercial", resPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_cancel_reservation", { p_reservation_id: id, p_reason: str(fd, "reason") });
  failOn(error, resPath(id));
  flush();
  back(resPath(id), "ok", "Reserva cancelada; a fila da unidade foi processada.");
}

export async function convertReservation(fd: FormData) {
  const id = str(fd, "reservation_id");
  await guard("comercial", resPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_convert_reservation", { p_reservation_id: id, p_reason: optStr(fd, "reason") });
  failOn(error, resPath(id));
  flush();
  back(resPath(id), "ok", "Venda registrada; unidade marcada como vendida e fila encerrada.");
}

export async function runDeadlinesNow() {
  await guard("comercial", "/admin/reservas");
  const supabase = await createSupabaseServerClient();
  // A rotina roda sozinha a cada minuto no banco (pg_cron). Este atalho só antecipa a execução.
  const { error } = await supabase.rpc("admin_run_deadlines");
  failOn(error, "/admin/reservas");
  flush();
  back("/admin/reservas", "ok", "Prazos processados.");
}

// ---------------------------------------------------------------------------
// Pré-lançamento
// ---------------------------------------------------------------------------
const plPath = (id: string) => `/admin/pre-lancamento/${id}`;

export async function createCampaign(fd: FormData) {
  await guard("comercial", "/admin/pre-lancamento");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("prelaunch_campaigns")
    .insert({
      development_id: str(fd, "development_id"),
      name: str(fd, "name") || "Registro de interesse",
      max_registrations_per_client: Number(str(fd, "max") || 1),
      priority_criteria: str(fd, "priority_criteria") || "Ordem cronológica de registro",
      terms: optStr(fd, "terms"),
    })
    .select("id")
    .single();
  failOn(error, "/admin/pre-lancamento");
  back(plPath(data!.id), "ok", "Campanha criada como rascunho.");
}

export async function setCampaignStatus(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_campaign_status", { p_campaign_id: id, p_status: str(fd, "status"), p_reason: optStr(fd, "reason") });
  failOn(error, plPath(id));
  back(plPath(id), "ok", "Status da campanha atualizado.");
}

export async function createWave(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("prelaunch_waves").insert({ campaign_id: id, name: str(fd, "name") || "Onda", sort_order: Number(str(fd, "sort_order") || 0) });
  failOn(error, plPath(id));
  back(plPath(id), "ok", "Onda criada.");
}

export async function fillWave(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_fill_wave", { p_wave_id: str(fd, "wave_id"), p_count: Number(str(fd, "count") || 0) });
  failOn(error, plPath(id));
  flush();
  back(plPath(id), "ok", `${data} registro(s) incluído(s) na onda.`);
}

export async function openWaveWindow(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  let starts: string, ends: string;
  try {
    starts = brasiliaLocalToUtcIso(str(fd, "starts_at"));
    ends = brasiliaLocalToUtcIso(str(fd, "ends_at"));
  } catch {
    back(plPath(id), "erro", "Datas inválidas.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_open_wave_window", { p_wave_id: str(fd, "wave_id"), p_starts_at: starts!, p_ends_at: ends! });
  failOn(error, plPath(id));
  flush();
  back(plPath(id), "ok", `Janela liberada para ${data} registro(s); corretores notificados.`);
}

export async function resolveRegistration(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_resolve_prelaunch_registration", {
    p_id: str(fd, "registration_id"),
    p_accept: str(fd, "decision") === "aceitar",
    p_reason: str(fd, "reason"),
  });
  failOn(error, plPath(id));
  back(plPath(id), "ok", "Registro atualizado.");
}

export async function setRegistrationPriority(fd: FormData) {
  const id = str(fd, "campaign_id");
  await guard("comercial", plPath(id));
  const supabase = await createSupabaseServerClient();
  const raw = str(fd, "rank");
  const { error } = await supabase.rpc("admin_set_registration_priority", {
    p_id: str(fd, "registration_id"),
    p_rank: raw ? Number(raw) : null,
    p_reason: str(fd, "reason"),
  });
  failOn(error, plPath(id));
  back(plPath(id), "ok", "Prioridade registrada.");
}
