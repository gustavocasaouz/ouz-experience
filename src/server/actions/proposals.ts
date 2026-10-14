"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getViewer } from "@/server/auth/viewer";
import { processOutbox } from "@/server/notifications/outbox";
import { checkRateLimit } from "@/server/security/rate-limit";
import { ALLOWED_DOC_TYPES, objectPath, validateUpload } from "@/server/files";
import { parseBRL } from "@/lib/format";
import { detectDocument } from "@/domain/documentos";
import { dbErrorMessage, type ActionState } from "./types";

const paymentSchema = z.object({
  kind: z.enum(["entrada", "parcela", "reforco", "chaves", "permuta"]),
  amount: z.number().positive(),
  quantity: z.number().int().min(1).max(600),
  first_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interval_months: z.number().int().min(1).max(24).optional(),
  description: z.string().max(200).optional(),
});

function readForm(fd: FormData) {
  let payments: unknown = [];
  try {
    payments = JSON.parse(String(fd.get("payments") ?? "[]"));
  } catch {
    payments = [];
  }
  const parsed = z.array(paymentSchema).max(60).safeParse(payments);
  return {
    id: (fd.get("id") as string) || null,
    unitId: String(fd.get("unit_id") ?? ""),
    registrationId: (fd.get("registration_id") as string) || null,
    clientName: String(fd.get("client_name") ?? "").trim(),
    clientDocument: String(fd.get("client_document") ?? "").trim(),
    offered: parseBRL(String(fd.get("offered_price") ?? "")),
    observations: String(fd.get("observations") ?? "").trim(),
    idempotencyKey: String(fd.get("idempotency_key") ?? ""),
    intent: String(fd.get("intent") ?? "draft"),
    payments: parsed.success ? parsed.data : null,
  };
}

/** Rascunho, envio e envio para análise. As decisões são das funções do banco; o corretor não vê as regras. */
export async function proposalAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.broker?.status !== "aprovado") return { error: "Acesso restrito a corretores aprovados." };
  const f = readForm(fd);
  if (!f.payments) return { error: "Revise as condições de pagamento (valores, quantidades e datas).", data: prev.data };
  if (!/^[\w:-]{8,80}$/.test(f.idempotencyKey)) return { error: "Formulário inválido. Recarregue a página." };

  const docOk = Boolean(detectDocument(f.clientDocument));
  const fieldErrors: Record<string, string[]> = {};
  if (f.clientDocument && !docOk) fieldErrors.client_document = ["CPF/CNPJ inválido: os dígitos verificadores não conferem."];
  if (f.intent !== "draft") {
    if (f.clientName.length < 2) fieldErrors.client_name = ["Informe o nome do cliente."];
    if (!f.clientDocument) fieldErrors.client_document = ["Informe o CPF ou CNPJ do cliente."];
    if (!f.offered) fieldErrors.offered_price = ["Informe o valor ofertado."];
    if (Object.keys(fieldErrors).length) {
      return { error: "Sem nome e CPF/CNPJ válidos a proposta não pode ser enviada. Corrija os campos destacados ou salve como rascunho.", fieldErrors, data: prev.data };
    }
  }

  if (!(await checkRateLimit("proposal", 60, 3600, viewer.userId))) return { error: "Muitas operações. Aguarde alguns minutos.", data: prev.data };
  const supabase = await createSupabaseServerClient();

  const { data: id, error } = await supabase.rpc("broker_save_proposal_draft", {
    p_id: f.id ?? (prev.data?.id as string | undefined) ?? null,
    p_unit_id: f.unitId,
    p_client_name: f.clientName,
    p_client_document: f.clientDocument,
    p_offered_price: f.offered,
    p_payments: f.payments,
    p_observations: f.observations,
    p_prelaunch_registration_id: f.registrationId,
    p_idempotency_key: f.idempotencyKey,
  });
  if (error || typeof id !== "string") return { error: dbErrorMessage(error, "Não foi possível salvar."), data: prev.data };

  if (f.intent === "draft") {
    revalidatePath("/corretor/propostas");
    return {
      ok: true,
      message: fieldErrors.client_document ? "Rascunho salvo, mas sem o CPF/CNPJ (inválido). Corrija antes de enviar." : "Rascunho salvo.",
      fieldErrors,
      data: { ...prev.data, id },
    };
  }

  const { data: result, error: submitError } = await supabase.rpc("broker_submit_proposal", {
    p_proposal_id: id,
    p_request_analysis: f.intent === "analysis",
  });
  if (submitError) return { error: dbErrorMessage(submitError, "Não foi possível enviar."), data: { ...prev.data, id } };
  const r = result as { status: string; within: boolean };
  if (r.status === "rascunho") {
    return {
      error:
        "As condições não se enquadram na política comercial vigente. Você pode ajustá-las ou enviar a proposta para análise da OUZ.",
      data: { ...prev.data, id, outside: true },
    };
  }
  after(() => processOutbox(10).catch(() => undefined));
  revalidatePath("/corretor/propostas");
  redirect(`/corretor/propostas/${id}?enviada=1`);
}

const back = (path: string, kind: "ok" | "erro", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);

export async function withdrawProposal(fd: FormData) {
  const id = String(fd.get("id"));
  const path = `/corretor/propostas/${id}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("broker_withdraw_proposal", { p_proposal_id: id, p_reason: String(fd.get("reason") ?? "").slice(0, 500) });
  if (error) back(path, "erro", dbErrorMessage(error));
  after(() => processOutbox(10).catch(() => undefined));
  back(path, "ok", "Proposta retirada.");
}

export async function reviseProposal(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("broker_revise_proposal", { p_proposal_id: id });
  if (error || typeof data !== "string") back(`/corretor/propostas/${id}`, "erro", dbErrorMessage(error));
  redirect(`/corretor/propostas/${data}/editar`);
}

export async function updateObservations(fd: FormData) {
  const id = String(fd.get("id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("broker_update_observations", { p_proposal_id: id, p_observations: String(fd.get("observations") ?? "") });
  back(`/corretor/propostas/${id}`, error ? "erro" : "ok", error ? dbErrorMessage(error) : "Observações atualizadas.");
}

export async function uploadReservationFile(fd: FormData) {
  const proposalId = String(fd.get("proposal_id"));
  const reservationId = String(fd.get("reservation_id"));
  const itemId = String(fd.get("item_id"));
  const path = `/corretor/propostas/${proposalId}`;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, "erro", "Selecione um arquivo.");
  const f = file as File;
  const err = await validateUpload(f, ALLOWED_DOC_TYPES, 10 * 1024 * 1024);
  if (err) back(path, "erro", err);
  const supabase = await createSupabaseServerClient();
  const key = objectPath(reservationId, f);
  const up = await supabase.storage.from("proposal-documents").upload(key, f, { contentType: f.type });
  if (up.error) back(path, "erro", "Falha no envio do arquivo.");
  const { error } = await supabase.rpc("broker_add_reservation_file", { p_item_id: itemId, p_storage_path: key, p_mime: f.type, p_size: f.size });
  if (error) back(path, "erro", dbErrorMessage(error));
  back(path, "ok", "Arquivo anexado.");
}

export async function removeReservationFile(fd: FormData) {
  const proposalId = String(fd.get("proposal_id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("broker_remove_reservation_file", { p_file_id: String(fd.get("file_id")) });
  back(`/corretor/propostas/${proposalId}`, error ? "erro" : "ok", error ? dbErrorMessage(error) : "Arquivo removido.");
}

export async function submitReservationDocuments(fd: FormData) {
  const proposalId = String(fd.get("proposal_id"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("broker_submit_reservation_documents", { p_reservation_id: String(fd.get("reservation_id")) });
  if (error) back(`/corretor/propostas/${proposalId}`, "erro", dbErrorMessage(error));
  back(`/corretor/propostas/${proposalId}`, "ok", "Documentação completa enviada. A reserva aguarda a conferência da OUZ e não expira mais pelo prazo de envio.");
}

export async function registerPrelaunch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.broker?.status !== "aprovado") return { error: "Acesso restrito a corretores aprovados." };
  if (!(await checkRateLimit("prelaunch", 30, 3600, viewer.userId))) return { error: "Muitas tentativas. Aguarde." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("broker_register_prelaunch", {
    p_campaign_id: String(fd.get("campaign_id")),
    p_client_name: String(fd.get("client_name") ?? ""),
    p_client_document: String(fd.get("client_document") ?? ""),
    p_preferences: String(fd.get("preferences") ?? ""),
    p_idempotency_key: String(fd.get("idempotency_key") ?? ""),
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/corretor/pre-lancamento");
  const status = (data as { status?: string }).status;
  return {
    ok: true,
    message:
      status === "cancelado" ? "Registro não aceito." : "Interesse registrado. Isto não é proposta nem reserva, e não garante unidade ou preço.",
  };
}

export async function cancelPrelaunch(fd: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("broker_cancel_prelaunch_registration", { p_id: String(fd.get("id")) });
  back("/corretor/pre-lancamento", error ? "erro" : "ok", error ? dbErrorMessage(error) : "Registro cancelado.");
}
