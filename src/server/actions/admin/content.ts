"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutbox } from "@/server/notifications/outbox";
import { getViewer, hasPermission } from "@/server/auth/viewer";
import { ALLOWED_IMAGE_TYPES, objectPath, validateUpload } from "@/server/files";
import { brasiliaLocalToUtcIso } from "@/lib/format";
import { back, failOn, guard, optStr, str } from "./util";

export async function updateSiteSection(fd: FormData) {
  const path = "/admin/conteudo";
  await guard("conteudo", path);
  const key = str(fd, "key");
  const items: Array<{ title: string; text: string }> = [];
  for (let i = 0; i < 6; i++) {
    const title = str(fd, `item_title_${i}`);
    const text = str(fd, `item_text_${i}`);
    if (title) items.push({ title, text });
  }
  const supabase = await createSupabaseServerClient();
  let image_path: string | undefined;
  const file = fd.get("image");
  if (file instanceof File && file.size > 0) {
    const err = await validateUpload(file, ALLOWED_IMAGE_TYPES, 15 * 1024 * 1024);
    if (err) back(path, "erro", err);
    image_path = objectPath("site", file);
    const up = await supabase.storage.from("public-media").upload(image_path, file, { contentType: file.type });
    failOn(up.error, path, "Falha no envio da imagem.");
  }
  const { error } = await supabase
    .from("site_sections")
    .update({
      eyebrow: optStr(fd, "eyebrow"),
      title: str(fd, "title") || "—",
      body: optStr(fd, "body"),
      items,
      is_placeholder: false,
      ...(image_path ? { image_path } : {}),
    })
    .eq("key", key);
  failOn(error, path);
  revalidatePath("/", "layout");
  back(path, "ok", "Seção atualizada.");
}

export async function saveNews(fd: FormData) {
  const path = "/admin/conteudo";
  await guard("conteudo", path);
  const slug = str(fd, "slug").toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(slug) || !str(fd, "title")) back(path, "erro", "Informe título e identificador válido (letras minúsculas, números e hífen).");
  const publish = str(fd, "publish") === "on";
  const supabase = await createSupabaseServerClient();
  const id = str(fd, "id");
  const row = {
    slug,
    title: str(fd, "title"),
    excerpt: optStr(fd, "excerpt"),
    body: optStr(fd, "body"),
    published_at: publish ? (str(fd, "published_at") ? brasiliaLocalToUtcIso(str(fd, "published_at")) : new Date().toISOString()) : null,
  };
  const { error } = id ? await supabase.from("news_posts").update(row).eq("id", id) : await supabase.from("news_posts").insert(row);
  failOn(error, path);
  revalidatePath("/", "layout");
  back(path, "ok", publish ? "Novidade publicada." : "Novidade salva como rascunho.");
}

export async function saveEvent(fd: FormData) {
  const path = "/admin/eventos";
  await guard("eventos", path);
  const audience = str(fd, "audience");
  if (!["geral", "clientes", "corretores_aprovados", "empreendimento", "convidados"].includes(audience)) back(path, "erro", "Público inválido.");
  if (audience === "empreendimento" && !str(fd, "development_id")) back(path, "erro", "Selecione o empreendimento.");
  let starts: string;
  let ends: string | null = null;
  try {
    starts = brasiliaLocalToUtcIso(str(fd, "starts_at"));
    ends = str(fd, "ends_at") ? brasiliaLocalToUtcIso(str(fd, "ends_at")) : null;
  } catch {
    back(path, "erro", "Data e hora inválidas.");
  }
  const capacity = str(fd, "capacity") ? Number(str(fd, "capacity")) : null;
  const supabase = await createSupabaseServerClient();
  const row = {
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    location_text: optStr(fd, "location_text"),
    online_url: optStr(fd, "online_url"),
    starts_at: starts!,
    ends_at: ends,
    audience,
    development_id: audience === "empreendimento" ? str(fd, "development_id") : null,
    capacity: capacity && capacity > 0 ? capacity : null,
    is_published: str(fd, "is_published") === "on",
    broker_group_id: audience === "corretores_aprovados" ? optStr(fd, "broker_group_id") : null,
    rsvp_enabled: str(fd, "rsvp_enabled") === "on",
    reminder_hours: Math.min(Math.max(Number(str(fd, "reminder_hours") || 24), 0), 336),
  };
  if (!row.title) back(path, "erro", "Informe o título.");
  const id = str(fd, "id");
  const { data: saved, error } = id
    ? await supabase.from("events").update(row).eq("id", id).select("id").single()
    : await supabase.from("events").insert(row).select("id").single();
  failOn(error, path);
  revalidatePath("/", "layout");
  back(audience === "convidados" ? `/admin/eventos/${saved!.id}` : path, "ok", audience === "convidados" ? "Evento salvo. Adicione os convidados." : "Evento salvo.");
}

export async function setLeadStatus(fd: FormData) {
  const path = "/admin/interessados";
  const viewer = await getViewer();
  if (!hasPermission(viewer, "atendimento") && !hasPermission(viewer, "comercial")) back(path, "erro", "Você não tem permissão para esta ação.");
  const status = str(fd, "status");
  if (!["novo", "em_contato", "encerrado"].includes(status)) back(path, "erro", "Status inválido.");
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.from("leads").update({ status, handled_by: claims?.claims.sub }).eq("id", str(fd, "id"));
  failOn(error, path);
  back(path, "ok", "Interessado atualizado.");
}

export async function retryOutboxItem(fd: FormData) {
  const path = "/admin/notificacoes";
  await guard("notificacoes", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_retry_outbox_item", { p_id: str(fd, "id") });
  failOn(error, path);
  after(() => processOutbox(10).catch(() => undefined));
  back(path, "ok", "Item reenfileirado.");
}

export async function processOutboxNow() {
  const path = "/admin/notificacoes";
  await guard("notificacoes", path);
  const r = await processOutbox(50);
  back(path, "ok", `Processados: ${r.claimed} · enviados: ${r.sent} · falhas: ${r.failed}.`);
}
