"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, objectPath, validateUpload } from "@/server/files";
import { back, failOn, guard, lines, optStr, str } from "./util";

const STAGES = ["pre_lancamento", "lancamento", "em_obra", "em_entrega", "entregue"] as const;
const MODES = ["aberto", "restrito", "teaser", "oculto"] as const;
const UNIT_STATUSES = ["disponivel", "reservada", "vendida", "bloqueada", "indisponivel"] as const;
const MATERIAL_KINDS = ["apresentacao", "planta", "material_comercial", "tabela", "comunicado", "outro"] as const;

const base = (id: string, tab = "") => `/admin/empreendimentos/${id}${tab}`;

function revalidatePublic() {
  revalidatePath("/", "layout");
}

async function uploadImage(file: File | null, prefix: string, path: string) {
  if (!file || file.size === 0) return undefined;
  const err = await validateUpload(file, ALLOWED_IMAGE_TYPES, 15 * 1024 * 1024);
  if (err) back(path, "erro", err);
  const supabase = await createSupabaseServerClient();
  const key = objectPath(prefix, file);
  const { error } = await supabase.storage.from("public-media").upload(key, file, { contentType: file.type });
  failOn(error, path, "Falha ao enviar a imagem.");
  return key;
}

export async function createDevelopment(fd: FormData) {
  const path = "/admin/empreendimentos";
  await guard("conteudo", path);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, "Identificador deve ter letras minúsculas, números e hífen."),
      stage: z.enum(STAGES),
      city: z.string().trim().min(2).max(120),
    })
    .safeParse({ name: str(fd, "name"), slug: str(fd, "slug"), stage: str(fd, "stage"), city: str(fd, "city") || "Florianópolis" });
  if (!parsed.success) back(path, "erro", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("developments").insert(parsed.data).select("id").single();
  failOn(error, path);
  await supabase.from("development_public_content").insert({ development_id: data!.id });
  back(base(data!.id), "ok", "Empreendimento criado (não publicado e oculto para corretores).");
}

export async function updateDevelopment(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id);
  await guard("conteudo", path);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/),
      stage: z.enum(STAGES),
      city: z.string().trim().min(2).max(120),
      sort_order: z.coerce.number().int().min(0).max(999),
    })
    .safeParse({ name: str(fd, "name"), slug: str(fd, "slug"), stage: str(fd, "stage"), city: str(fd, "city"), sort_order: str(fd, "sort_order") || "0" });
  if (!parsed.success) back(path, "erro", "Revise os dados gerais.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("developments")
    .update({ ...parsed.data, is_published: str(fd, "is_published") === "on" })
    .eq("id", id);
  failOn(error, path);
  revalidatePublic();
  back(path, "ok", "Dados gerais salvos.");
}

export async function updatePublicContent(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id);
  await guard("conteudo", path);
  const cover = await uploadImage(fd.get("cover") as File | null, `empreendimentos/${id}`, path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("development_public_content").upsert({
    development_id: id,
    headline: optStr(fd, "headline"),
    summary: optStr(fd, "summary"),
    body: optStr(fd, "body"),
    neighborhood: optStr(fd, "neighborhood"),
    highlights: lines(fd, "highlights").slice(0, 20),
    ...(cover ? { cover_image_path: cover } : {}),
  });
  failOn(error, path);
  revalidatePublic();
  back(path, "ok", "Conteúdo público salvo.");
}

export async function updateTeaser(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id);
  await guard("conteudo", path);
  const image = await uploadImage(fd.get("image") as File | null, `teasers/${id}`, path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("development_teasers").upsert({
    development_id: id,
    title: str(fd, "title") || "Em breve",
    message: optStr(fd, "message"),
    ...(image ? { image_path: image } : {}),
  });
  failOn(error, path);
  back(path, "ok", "Teaser salvo.");
}

export async function updateBrokerContent(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/restrito");
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("development_broker_content").upsert({
    development_id: id,
    presentation: optStr(fd, "presentation"),
    highlights: lines(fd, "highlights").slice(0, 30),
    payment_conditions: optStr(fd, "payment_conditions"),
    early_information: optStr(fd, "early_information"),
  });
  failOn(error, path);
  back(path, "ok", "Conteúdo restrito salvo.");
}

export async function uploadMaterial(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/restrito");
  await guard("conteudo", path);
  const kind = str(fd, "kind");
  const title = str(fd, "title");
  const file = fd.get("file");
  if (!(MATERIAL_KINDS as readonly string[]).includes(kind) || !title || !(file instanceof File)) back(path, "erro", "Informe tipo, título e arquivo.");
  const f = file as File;
  const err = await validateUpload(f, [...ALLOWED_DOC_TYPES, "image/webp"], 50 * 1024 * 1024);
  if (err) back(path, "erro", err);
  const supabase = await createSupabaseServerClient();
  const key = objectPath(id, f);
  const up = await supabase.storage.from("broker-content").upload(key, f, { contentType: f.type });
  failOn(up.error, path, "Falha no envio do arquivo.");
  const { error } = await supabase.from("broker_materials").insert({
    development_id: id,
    kind,
    title: title.slice(0, 200),
    storage_path: key,
    is_published: str(fd, "is_published") === "on",
  });
  failOn(error, path);
  back(path, "ok", "Material enviado.");
}

export async function toggleMaterial(fd: FormData) {
  const id = str(fd, "development_id");
  const path = base(id, "/restrito");
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("broker_materials").update({ is_published: str(fd, "publish") === "1" }).eq("id", str(fd, "material_id"));
  failOn(error, path);
  back(path, "ok", "Material atualizado.");
}

export async function setAccessMode(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/acesso");
  await guard("comercial", path);
  const mode = str(fd, "mode");
  if (!(MODES as readonly string[]).includes(mode)) back(path, "erro", "Modo inválido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_development_access_mode", { p_development_id: id, p_mode: mode, p_reason: optStr(fd, "reason") });
  failOn(error, path);
  back(path, "ok", "Modo de acesso atualizado.");
}

export async function grantAccess(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/acesso");
  await guard("comercial", path);
  const target = str(fd, "target"); // "broker:<uuid>" | "group:<uuid>"
  const [kind, targetId] = target.split(":");
  if (!targetId || (kind !== "broker" && kind !== "group")) back(path, "erro", "Selecione um corretor ou grupo.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_grant_development_access", {
    p_development_id: id,
    p_broker_user_id: kind === "broker" ? targetId : null,
    p_group_id: kind === "group" ? targetId : null,
    p_reason: optStr(fd, "reason"),
  });
  failOn(error, path);
  back(path, "ok", "Acesso concedido.");
}

export async function revokeAccess(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/acesso");
  await guard("comercial", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_development_access", { p_grant_id: str(fd, "grant_id"), p_reason: str(fd, "reason") });
  failOn(error, path);
  back(path, "ok", "Acesso revogado.");
}

export async function createUnit(fd: FormData) {
  const id = str(fd, "id");
  const path = base(id, "/unidades");
  await guard("comercial", path);
  const parsed = z
    .object({
      code: z.string().trim().min(1).max(30),
      tower: z.string().trim().max(30).optional(),
      floor: z.coerce.number().int().min(-5).max(200).optional(),
      typology: z.string().trim().max(80).optional(),
      bedrooms: z.coerce.number().int().min(0).max(20).optional(),
      private_area_m2: z.coerce.number().positive().max(100000).optional(),
      parking: z.string().trim().max(160).optional(),
      status: z.enum(UNIT_STATUSES),
    })
    .safeParse(
      Object.fromEntries(
        ["code", "tower", "floor", "typology", "bedrooms", "private_area_m2", "parking", "status"].map((k) => [k, (k === "private_area_m2" ? str(fd, k).replace(",", ".") : str(fd, k)) || undefined]),
      ),
    );
  if (!parsed.success) back(path, "erro", "Revise os dados da unidade.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("units").insert({ development_id: id, ...parsed.data });
  failOn(error, path);
  back(path, "ok", "Unidade cadastrada.");
}

/** Dados descritivos da unidade (ficha da unidade). Situação continua em updateUnitStatus. */
export async function updateUnitDetails(fd: FormData) {
  const unitId = str(fd, "unit_id");
  const path = `/admin/unidades/${unitId}`;
  await guard("comercial", path);
  const parsed = z
    .object({
      tower: z.string().trim().max(30).nullable(),
      floor: z.coerce.number().int().min(-5).max(200).nullable(),
      typology: z.string().trim().max(80).nullable(),
      bedrooms: z.coerce.number().int().min(0).max(20).nullable(),
      private_area_m2: z.coerce.number().positive().max(100000).nullable(),
      parking: z.string().trim().max(160).nullable(),
    })
    .safeParse(
      Object.fromEntries(
        ["tower", "floor", "typology", "bedrooms", "private_area_m2", "parking"].map((k) => [k, (k === "private_area_m2" && str(fd, k).includes(",") ? str(fd, k).replace(/\./g, "").replace(",", ".") : str(fd, k)) || null]),
      ),
    );
  if (!parsed.success) back(path, "erro", "Revise os dados da unidade.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("units").update(parsed.data).eq("id", unitId);
  failOn(error, path);
  back(path, "ok", "Dados da unidade salvos.");
}

export async function updateUnitStatus(fd: FormData) {
  const id = str(fd, "development_id");
  const path = base(id, "/unidades");
  await guard("comercial", path);
  const status = str(fd, "status");
  if (!(UNIT_STATUSES as readonly string[]).includes(status)) back(path, "erro", "Situação inválida.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("units").update({ status }).eq("id", str(fd, "unit_id")).eq("development_id", id);
  failOn(error, path);
  back(path, "ok", "Situação atualizada.");
}
