"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { assertStaff, AuthorizationError } from "@/server/auth/viewer";
import { documentHash } from "@/server/security/document-hash";
import { enqueueEmail } from "@/server/notifications/outbox";
import { detectDocument, isPlausiblePhone, normalizePhone } from "@/domain/documentos";
import { publicEnv } from "@/lib/env";
import { dbErrorMessage, type ActionState } from "../types";
import { back, failOn, guard, str } from "./util";

const clientSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome.").max(200),
  email: z.email("E-mail inválido.").transform((v) => v.toLowerCase()),
  phone: z.string().trim().optional().refine((v) => !v || isPlausiblePhone(v), "Telefone inválido."),
  document: z.string().trim().optional(),
});

export async function createClientRecord(fd: FormData) {
  const path = "/admin/clientes";
  await guard("clientes", path);
  const parsed = clientSchema.safeParse({ full_name: str(fd, "full_name"), email: str(fd, "email"), phone: str(fd, "phone"), document: str(fd, "document") });
  if (!parsed.success) back(path, "erro", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data!;
  const doc = d.document ? detectDocument(d.document) : null;
  if (d.document && !doc) back(path, "erro", "CPF/CNPJ inválido (dígitos verificadores não conferem).");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ full_name: d.full_name, email: d.email, phone: d.phone ? normalizePhone(d.phone) : null })
    .select("id")
    .single();
  failOn(error, path);
  if (doc) {
    const { error: e2 } = await supabase
      .from("client_identities")
      .insert({ client_id: data!.id, document_type: doc.kind, document_number: doc.value, document_hash: documentHash(doc.value) });
    if (e2) back(`/admin/clientes/${data!.id}`, "erro", e2.code === "23505" ? "Cliente criado, mas já existe outro cadastro com este CPF/CNPJ. Verifique duplicidade." : dbErrorMessage(e2));
  }
  back(`/admin/clientes/${data!.id}`, "ok", "Cliente cadastrado. Vincule as unidades e envie o convite.");
}

export async function updateClientIdentity(fd: FormData) {
  const id = str(fd, "client_id");
  const path = `/admin/clientes/${id}`;
  await guard("clientes", path);
  const doc = detectDocument(str(fd, "document"));
  if (!doc) back(path, "erro", "CPF/CNPJ inválido (dígitos verificadores não conferem).");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("client_identities")
    .upsert({ client_id: id, document_type: doc!.kind, document_number: doc!.value, document_hash: documentHash(doc!.value), updated_at: new Date().toISOString() });
  failOn(error, path, "Não foi possível salvar o documento.");
  back(path, "ok", "Documento salvo.");
}

export async function linkClientUnit(fd: FormData) {
  const id = str(fd, "client_id");
  const path = `/admin/clientes/${id}`;
  await guard("clientes", path);
  const relation = str(fd, "relation");
  if (!["titular", "cotitular", "procurador"].includes(relation)) back(path, "erro", "Vínculo inválido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("client_units")
    .upsert({ client_id: id, unit_id: str(fd, "unit_id"), relation, active: true, unlinked_at: null }, { onConflict: "client_id,unit_id" });
  failOn(error, path);
  back(path, "ok", "Unidade vinculada.");
}

export async function unlinkClientUnit(fd: FormData) {
  const id = str(fd, "client_id");
  const path = `/admin/clientes/${id}`;
  await guard("clientes", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("client_units")
    .update({ active: false, unlinked_at: new Date().toISOString() })
    .eq("id", str(fd, "link_id"))
    .eq("client_id", id);
  failOn(error, path);
  back(path, "ok", "Vínculo encerrado (histórico preservado).");
}

export async function inviteClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await assertStaff("clientes");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  const id = str(fd, "client_id");
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase.from("clients").select("email").eq("id", id).maybeSingle();
  const { data: token, error } = await supabase.rpc("create_client_invitation", { p_client_id: id });
  if (error || typeof token !== "string" || !client) return { error: dbErrorMessage(error, "Não foi possível criar o convite.") };
  const link = `${publicEnv.appUrl}/entrar/convite#tipo=cliente&token=${token}`;
  await enqueueEmail({ dedupeKey: `email:convite_cliente:${token.slice(0, 16)}`, template: "convite_cliente", recipientEmail: client.email, payload: { secret_link: link } });
  revalidatePath(`/admin/clientes/${id}`);
  return { ok: true, message: `Convite enviado para ${client.email}. Válido por 7 dias.`, data: { link } };
}
