"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { parseBRL } from "@/lib/format";
import { back, failOn, guard, optStr, str } from "./util";

// Catálogo de personalização do empreendimento (itens, padrão da construtora e upgrades). O RLS exige "conteudo".
const path = (id: string) => `/admin/empreendimentos/${id}/personalizacao`;
const done = (id: string, msg: string): never => {
  revalidatePath("/cliente", "layout");
  back(path(id), "ok", msg);
};

export async function addCustomizationItem(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", path(dev));
  const parsed = z
    .object({ category: z.string().min(2).max(60), title: z.string().min(2).max(120), sort_order: z.coerce.number().int().min(0).max(9999) })
    .safeParse({ category: str(fd, "category"), title: str(fd, "title"), sort_order: str(fd, "sort_order") || "0" });
  if (!parsed.success) back(path(dev), "erro", "Informe a categoria e o nome do item.");
  const standard = str(fd, "standard");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customization_items")
    .insert({ development_id: dev, ...parsed.data, description: optStr(fd, "description") })
    .select("id")
    .single();
  failOn(error, path(dev));
  if (standard) {
    const { error: e2 } = await supabase.from("customization_choices").insert({ item_id: data!.id, title: standard, price: 0, is_standard: true });
    failOn(e2, path(dev));
  }
  done(dev, "Item incluído no catálogo.");
}

export async function addCustomizationChoice(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", path(dev));
  const price = parseBRL(str(fd, "price")) ?? 0;
  const standard = str(fd, "is_standard") === "on";
  if (!str(fd, "title") || price < 0) back(path(dev), "erro", "Informe a opção e um valor válido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customization_choices").insert({
    item_id: str(fd, "item_id"),
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    price: standard ? 0 : price,
    is_standard: standard,
    sort_order: Number(str(fd, "sort_order")) || 0,
  });
  failOn(error, path(dev), "Não foi possível incluir a opção (cada item tem um só padrão).");
  done(dev, "Opção incluída.");
}

export async function updateCustomizationChoicePrice(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", path(dev));
  const price = parseBRL(str(fd, "price"));
  if (price === null || price < 0) back(path(dev), "erro", "Valor inválido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customization_choices").update({ price }).eq("id", str(fd, "id")).eq("is_standard", false);
  failOn(error, path(dev));
  done(dev, "Valor atualizado.");
}

export async function toggleCustomizationItem(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", path(dev));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customization_items").update({ is_published: str(fd, "publish") === "1" }).eq("id", str(fd, "id"));
  failOn(error, path(dev));
  done(dev, str(fd, "publish") === "1" ? "Item visível aos clientes." : "Item oculto dos clientes.");
}

export async function deleteCustomizationEntry(fd: FormData) {
  const dev = str(fd, "development_id");
  await guard("conteudo", path(dev));
  const table = str(fd, "kind") === "item" ? "customization_items" : "customization_choices";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(table).delete().eq("id", str(fd, "id"));
  failOn(error, path(dev));
  done(dev, "Removido do catálogo.");
}
