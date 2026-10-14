"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutbox } from "@/server/notifications/outbox";
import { detectDocument } from "@/domain/documentos";
import { brasiliaLocalToUtcIso, parseBRL } from "@/lib/format";
import { back, failOn, guard, optStr, str } from "./util";

const flush = () => after(() => processOutbox(20).catch(() => undefined));
const req = (id: string) => `/admin/concierge/${id}`;
const CATALOG = "/admin/concierge/catalogo";

export async function conciergeTransition(fd: FormData) {
  const id = str(fd, "id");
  await guard("concierge", req(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_concierge_transition", { p_id: id, p_to: str(fd, "to"), p_note: optStr(fd, "note") });
  failOn(error, req(id));
  flush();
  back(req(id), "ok", "Situação atualizada; cliente avisado.");
}

export async function conciergeQuote(fd: FormData) {
  const id = str(fd, "id");
  await guard("concierge", req(id));
  const amount = parseBRL(str(fd, "service_amount"));
  if (amount === null) back(req(id), "erro", "Informe o valor do serviço (pode ser 0).");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_concierge_quote", {
    p_id: id,
    p_service_amount: amount,
    p_ouz_fee: str(fd, "ouz_fee") ? parseBRL(str(fd, "ouz_fee")) : 0,
    p_conditions: optStr(fd, "conditions"),
    p_valid_until: optStr(fd, "valid_until"),
    p_provider_id: optStr(fd, "provider_id"),
  });
  failOn(error, req(id));
  flush();
  back(req(id), "ok", "Orçamento enviado para aprovação do cliente.");
}

export async function conciergeSchedule(fd: FormData) {
  const id = str(fd, "id");
  await guard("concierge", req(id));
  let at: string;
  try {
    at = brasiliaLocalToUtcIso(str(fd, "scheduled_at"));
  } catch {
    back(req(id), "erro", "Data e hora inválidas.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_concierge_schedule", { p_id: id, p_scheduled_at: at!, p_provider_id: optStr(fd, "provider_id"), p_note: optStr(fd, "note") });
  failOn(error, req(id));
  flush();
  back(req(id), "ok", "Agendado; cliente avisado.");
}

export async function conciergeOccurrence(fd: FormData) {
  const id = str(fd, "id");
  await guard("concierge", req(id));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_concierge_occurrence", { p_id: id, p_kind: str(fd, "kind"), p_description: str(fd, "description"), p_visible: str(fd, "visible") === "on" });
  failOn(error, req(id));
  flush();
  back(req(id), "ok", "Ocorrência registrada.");
}

export async function saveConciergeService(fd: FormData) {
  await guard("concierge", CATALOG);
  const supabase = await createSupabaseServerClient();
  const row = {
    development_id: str(fd, "development_id"),
    category: str(fd, "category"),
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    pricing_note: optStr(fd, "pricing_note"),
    cancellation_policy: optStr(fd, "cancellation_policy"),
    requires_quote: str(fd, "requires_quote") === "on",
    active: str(fd, "active") === "on",
    sort_order: Number(str(fd, "sort_order") || 0),
  };
  const id = str(fd, "id");
  const { error } = id ? await supabase.from("concierge_services").update(row).eq("id", id) : await supabase.from("concierge_services").insert(row);
  failOn(error, CATALOG);
  back(CATALOG, "ok", "Serviço salvo.");
}

export async function saveProvider(fd: FormData) {
  await guard("concierge", CATALOG);
  const docRaw = str(fd, "document");
  const doc = docRaw ? detectDocument(docRaw) : null;
  if (docRaw && !doc) back(CATALOG, "erro", "CPF/CNPJ do prestador inválido.");
  const supabase = await createSupabaseServerClient();
  const row = {
    name: str(fd, "name"),
    document: doc?.value ?? null,
    contact_name: optStr(fd, "contact_name"),
    phone: optStr(fd, "phone"),
    email: optStr(fd, "email"),
    categories: fd.getAll("categories").map(String),
    notes: optStr(fd, "notes"),
    active: str(fd, "active") === "on",
  };
  const id = str(fd, "id");
  const { error } = id ? await supabase.from("concierge_providers").update(row).eq("id", id) : await supabase.from("concierge_providers").insert(row);
  failOn(error, CATALOG);
  back(CATALOG, "ok", "Prestador salvo. O Experience não contrata nem paga prestadores: isso é feito pela OUZ fora do sistema.");
}
