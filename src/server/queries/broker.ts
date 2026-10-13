import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import type { BrokerAccessMode, DevelopmentStage } from "@/lib/labels";

export type BrokerDevelopmentCard = {
  id: string;
  slug: string;
  name: string;
  stage: DevelopmentStage;
  mode: BrokerAccessMode;
  full: boolean;
};

/** Cartões visíveis ao corretor. `full` vem do banco (mesma função usada no RLS). */
export async function listBrokerDevelopments(): Promise<BrokerDevelopmentCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("developments")
    .select("id, slug, name, stage, broker_access_mode")
    .neq("broker_access_mode", "oculto")
    .order("sort_order");
  const devs = data ?? [];
  const access = await Promise.all(devs.map((d) => supabase.rpc("broker_can_access_development", { p_development_id: d.id })));
  return devs.map((d, i) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    stage: d.stage,
    mode: d.broker_access_mode,
    full: access[i]?.data === true,
  }));
}
