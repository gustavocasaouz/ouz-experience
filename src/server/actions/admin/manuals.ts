"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { back, failOn, guard, optStr, str } from "./util";

/** Publica/oculta o manual e define o PDF completo (permissão Conteúdo). O conteúdo entra pela importação. */
export async function updateManual(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = `/admin/empreendimentos/${dev}/manuais`;
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("development_manuals")
    .update({ is_published: str(fd, "is_published") === "on", pdf_document_id: optStr(fd, "pdf_document_id") })
    .eq("id", str(fd, "manual_id"))
    .eq("development_id", dev);
  failOn(error, path);
  revalidatePath("/cliente", "layout");
  back(path, "ok", "Manual atualizado.");
}

/** Liga (ou desliga, com vazio) o arquivo de um anexo do manual. */
export async function setAttachmentFile(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = `/admin/empreendimentos/${dev}/manuais`;
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("manual_attachments").update({ document_id: optStr(fd, "document_id") }).eq("id", str(fd, "attachment_id"));
  failOn(error, path);
  revalidatePath("/cliente", "layout");
  back(path, "ok", "Anexo atualizado.");
}

export async function addAttachment(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = `/admin/empreendimentos/${dev}/manuais`;
  await guard("conteudo", path);
  const section = str(fd, "section_num");
  const title = str(fd, "title");
  if (!/^\d+(\.\d+)*$/.test(section)) back(path, "erro", "Informe o número da seção (ex.: 10.2.4).");
  if (title.length < 2) back(path, "erro", "Informe o nome do anexo.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("manual_attachments").insert({
    manual_id: str(fd, "manual_id"),
    section_num: section,
    title,
    document_id: optStr(fd, "document_id"),
    sort_order: 1000,
  });
  failOn(error, path, "Não foi possível criar o anexo (já existe um com esse nome nessa seção?).");
  revalidatePath("/cliente", "layout");
  back(path, "ok", "Anexo criado.");
}

export async function removeAttachment(fd: FormData) {
  const dev = str(fd, "development_id");
  const path = `/admin/empreendimentos/${dev}/manuais`;
  await guard("conteudo", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("manual_attachments").delete().eq("id", str(fd, "attachment_id"));
  failOn(error, path);
  revalidatePath("/cliente", "layout");
  back(path, "ok", "Anexo removido.");
}
