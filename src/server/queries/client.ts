import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import type { DevelopmentStage } from "@/lib/labels";

export type ClientUnit = {
  linkId: string;
  relation: string;
  unit: { id: string; code: string; tower: string | null; floor: number | null; typology: string | null; private_area_m2: string | null; parking: string | null };
  development: { id: string; slug: string; name: string; stage: DevelopmentStage; habite_se_date: string | null; client_delivery_enabled: boolean; cover_image_path: string | null };
};

/** O RLS garante que só retornam vínculos do próprio cliente. */
export async function listMyUnits(): Promise<ClientUnit[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("client_units")
    .select(
      "id, relation, unit:units(id, code, tower, floor, typology, private_area_m2, parking, development:developments(id, slug, name, stage, habite_se_date, client_delivery_enabled, content:development_public_content(cover_image_path)))",
    )
    .eq("active", true);
  type Row = {
    id: string;
    relation: string;
    unit: ClientUnit["unit"] & { development: Omit<ClientUnit["development"], "cover_image_path"> & { content: { cover_image_path: string | null } | null } };
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.unit)
    .map((r) => ({
      linkId: r.id,
      relation: r.relation,
      unit: r.unit,
      development: { ...r.unit.development, cover_image_path: r.unit.development.content?.cover_image_path ?? null },
    }));
}
