"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getViewer } from "@/server/auth/viewer";
import { processOutbox } from "@/server/notifications/outbox";
import { checkRateLimit } from "@/server/security/rate-limit";
import { ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, filesFrom, objectPath, validateUpload } from "@/server/files";
import { parseBRL } from "@/lib/format";
import { dbErrorMessage } from "./types";

const flush = () => after(() => processOutbox(10).catch(() => undefined));
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function back(path: string, kind: "ok" | "erro", msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}
async function limited(scope: string) {
  const viewer = await getViewer();
  if (!viewer) redirect("/entrar");
  if (!(await checkRateLimit(scope, 30, 3600, viewer.userId))) return false;
  return true;
}

const unitPath = (unitId: string, tab = "") => `/cliente/unidades/${unitId}${tab}`;

export async function requestCustomization(fd: FormData) {
  const unit = s(fd, "unit_id");
  const path = unitPath(unit, "/personalizacao");
  if (!(await limited("customization"))) back(path, "erro", "Muitas solicitações. Tente mais tarde.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_create_customization", { p_unit_id: unit, p_title: s(fd, "title"), p_description: s(fd, "description") });
  if (error) back(path, "erro", dbErrorMessage(error, "Revise o título e a descrição."));
  flush();
  back(path, "ok", "Solicitação enviada à OUZ.");
}

export async function decideCustomization(fd: FormData) {
  const unit = s(fd, "unit_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_decide_customization", { p_id: s(fd, "id"), p_approve: s(fd, "decision") === "aprovar" });
  if (error) back(unitPath(unit, "/personalizacao"), "erro", dbErrorMessage(error));
  flush();
  back(unitPath(unit, "/personalizacao"), "ok", "Resposta registrada.");
}

export async function bookSlot(fd: FormData) {
  const unit = s(fd, "unit_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_book_slot", { p_slot_id: s(fd, "slot_id"), p_unit_id: unit });
  if (error) back(unitPath(unit, "/entrega"), "erro", dbErrorMessage(error));
  flush();
  back(unitPath(unit, "/entrega"), "ok", "Agendamento confirmado.");
}

export async function cancelBooking(fd: FormData) {
  const unit = s(fd, "unit_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_cancel_booking", { p_booking_id: s(fd, "booking_id") });
  back(unitPath(unit, "/entrega"), error ? "erro" : "ok", error ? dbErrorMessage(error) : "Agendamento cancelado.");
}

export async function respondPunchItem(fd: FormData) {
  const unit = s(fd, "unit_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_respond_punch_item", { p_id: s(fd, "id"), p_accept: s(fd, "decision") === "aceitar", p_note: s(fd, "note") });
  if (error) back(unitPath(unit, "/entrega"), "erro", dbErrorMessage(error));
  flush();
  back(unitPath(unit, "/entrega"), "ok", "Resposta registrada.");
}

export async function submitReceipt(fd: FormData) {
  const unit = s(fd, "unit_id");
  const path = unitPath(unit, "/financeiro");
  if (!(await limited("receipt"))) back(path, "erro", "Muitos envios. Tente mais tarde.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, "erro", "Selecione o comprovante.");
  const f = file as File;
  const err = await validateUpload(f, ALLOWED_DOC_TYPES, 10 * 1024 * 1024);
  if (err) back(path, "erro", err);
  const supabase = await createSupabaseServerClient();
  const key = objectPath(`${unit}/comprovantes`, f);
  const up = await supabase.storage.from("client-documents").upload(key, f, { contentType: f.type });
  if (up.error) back(path, "erro", "Falha no envio do arquivo.");
  const { error } = await supabase.rpc("client_submit_receipt", {
    p_contract_id: s(fd, "contract_id"),
    p_installment_id: s(fd, "installment_id") || null,
    p_storage_path: key,
    p_amount: parseBRL(s(fd, "amount")),
    p_paid_on: s(fd, "paid_on") || null,
    p_note: s(fd, "note"),
  });
  if (error) back(path, "erro", dbErrorMessage(error));
  flush();
  back(path, "ok", "Comprovante enviado. A parcela só é baixada depois da conferência da OUZ.");
}

export async function askFinancialQuestion(fd: FormData) {
  const unit = s(fd, "unit_id");
  const path = unitPath(unit, "/financeiro");
  if (!(await limited("inquiry"))) back(path, "erro", "Muitas solicitações. Tente mais tarde.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_create_inquiry", {
    p_contract_id: s(fd, "contract_id"),
    p_installment_id: s(fd, "installment_id") || null,
    p_message: s(fd, "message"),
  });
  if (error) back(path, "erro", dbErrorMessage(error, "Escreva sua dúvida."));
  flush();
  back(path, "ok", "Pedido de esclarecimento enviado ao financeiro da OUZ.");
}

// ---------------------------------------------------------------------------
// Chamados
// ---------------------------------------------------------------------------
async function uploadTicketFiles(ticketId: string, fd: FormData, path: string) {
  const files = filesFrom(fd, "files");
  if (files.length > 5) back(path, "erro", "Envie no máximo 5 arquivos por vez.");
  const supabase = await createSupabaseServerClient();
  for (const f of files) {
    const err = await validateUpload(f, [...ALLOWED_DOC_TYPES, ...ALLOWED_IMAGE_TYPES], 15 * 1024 * 1024);
    if (err) back(path, "erro", `${err} (${f.name})`);
    const key = objectPath(ticketId, f);
    const up = await supabase.storage.from("ticket-attachments").upload(key, f, { contentType: f.type });
    if (up.error) back(path, "erro", "Falha no envio de um anexo.");
    await supabase.rpc("add_ticket_attachment", { p_ticket_id: ticketId, p_storage_path: key, p_mime: f.type, p_size: f.size });
  }
}

export async function openTicket(fd: FormData) {
  const path = "/cliente/chamados/novo";
  if (!(await limited("ticket"))) back(path, "erro", "Muitos chamados abertos em sequência. Tente mais tarde.");
  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("client_open_ticket", {
    p_unit_id: s(fd, "unit_id"),
    p_category: s(fd, "category"),
    p_title: s(fd, "title"),
    p_description: s(fd, "description"),
  });
  if (error || typeof id !== "string") back(path, "erro", dbErrorMessage(error, "Revise os campos."));
  await uploadTicketFiles(id as string, fd, `/cliente/chamados/${id}`);
  flush();
  back(`/cliente/chamados/${id}`, "ok", "Chamado aberto. A OUZ vai analisar e responder por aqui.");
}

export async function replyTicket(fd: FormData) {
  const id = s(fd, "ticket_id");
  const path = `/cliente/chamados/${id}`;
  const supabase = await createSupabaseServerClient();
  if (s(fd, "body")) {
    const { error } = await supabase.rpc("post_ticket_message", { p_ticket_id: id, p_body: s(fd, "body"), p_internal: false });
    if (error) back(path, "erro", dbErrorMessage(error));
  }
  await uploadTicketFiles(id, fd, path);
  flush();
  back(path, "ok", "Mensagem enviada.");
}

export async function rateTicket(fd: FormData) {
  const id = s(fd, "ticket_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("client_rate_ticket", { p_ticket_id: id, p_rating: Number(s(fd, "rating")), p_comment: s(fd, "comment") });
  back(`/cliente/chamados/${id}`, error ? "erro" : "ok", error ? dbErrorMessage(error) : "Obrigado pela avaliação.");
}

// ---------------------------------------------------------------------------
// Agenda de eventos e notificações (clientes e corretores)
// ---------------------------------------------------------------------------
export async function rsvpEvent(fd: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("event_rsvp", {
    p_event_id: s(fd, "event_id"),
    p_attend: s(fd, "attend") === "1",
    p_guests: Number(s(fd, "guests") || 0),
  });
  if (error) back("/agenda", "erro", dbErrorMessage(error));
  flush();
  back("/agenda", "ok", data === "confirmado" ? "Presença confirmada." : data === "lista_espera" ? "Evento lotado: você está na lista de espera e será avisado se abrir vaga." : "Presença cancelada.");
}

export async function markNotificationsRead(fd: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = s(fd, "id");
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
  const link = s(fd, "link");
  if (link.startsWith("/") && !link.startsWith("//")) redirect(link);
  redirect("/notificacoes");
}
