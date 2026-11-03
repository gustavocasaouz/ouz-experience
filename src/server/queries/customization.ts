import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type CustomizationChoice = { id: string; title: string; description: string | null; price: number; is_standard: boolean };
export type CustomizationItem = { id: string; category: string; title: string; description: string | null; is_published: boolean; choices: CustomizationChoice[] };

/** Itens do catálogo (com opções, padrão primeiro) e, se houver unidade, as escolhas dela. O RLS confere o acesso. */
export async function customizationCatalog(developmentId: string, unitId?: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: items }, { data: sel }] = await Promise.all([
    supabase
      .from("customization_items")
      .select("id, category, title, description, is_published, sort_order, choices:customization_choices(id, title, description, price, is_standard, sort_order)")
      .eq("development_id", developmentId)
      .order("sort_order")
      .order("title"),
    unitId
      ? supabase.from("customization_selections").select("item_id, choice_id").eq("unit_id", unitId)
      : Promise.resolve({ data: [] as Array<{ item_id: string; choice_id: string }> }),
  ]);
  type Row = Omit<CustomizationItem, "choices"> & { choices: Array<CustomizationChoice & { price: string | number; sort_order: number }> };
  return {
    items: ((items ?? []) as unknown as Row[]).map((i) => ({
      ...i,
      choices: i.choices
        .map((c) => ({ ...c, price: Number(c.price) }))
        .sort((a, b) => Number(b.is_standard) - Number(a.is_standard) || a.sort_order - b.sort_order || a.price - b.price),
    })) as CustomizationItem[],
    selected: Object.fromEntries((sel ?? []).map((s) => [s.item_id, s.choice_id])) as Record<string, string>,
  };
}
