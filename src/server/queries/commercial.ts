import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type UnitWithPrice = {
  id: string;
  code: string;
  tower: string | null;
  floor: number | null;
  typology: string | null;
  bedrooms: number | null;
  private_area_m2: string | null;
  status: string;
  price: number | null;
  /** Propostas na fila (null = exibição desligada ou sem acesso). */
  queueCount: number | null;
};

/** Unidades com preço vigente — o RLS só devolve preços a quem pode vê-los. */
export async function listUnitsWithPrices(developmentId: string): Promise<UnitWithPrice[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: units }, { data: prices }, { data: counts }] = await Promise.all([
    supabase.from("units").select("id, code, tower, floor, typology, bedrooms, private_area_m2, status").eq("development_id", developmentId).order("code"),
    supabase.rpc("current_unit_prices", { p_development_id: developmentId }),
    supabase.rpc("unit_queue_counts", { p_development_id: developmentId }),
  ]);
  const queue = new Map(((counts ?? []) as Array<{ unit_id: string; queue_count: number }>).map((c) => [c.unit_id, c.queue_count]));
  const map = new Map(((prices ?? []) as Array<{ unit_id: string; price: string }>).map((p) => [p.unit_id, Number(p.price)]));
  return (units ?? []).map((u) => ({ ...u, price: map.get(u.id) ?? null, queueCount: queue.get(u.id) ?? null })) as UnitWithPrice[];
}

export type BrokerProposal = {
  id: string;
  status: string;
  client_name: string | null;
  offered_price: string | null;
  submitted_at: string | null;
  created_at: string;
  unit: { code: string; development: { name: string; slug: string } } | null;
  /** Relação 1:1 (proposal_id é único em reservations): objeto ou null. */
  reservation: { id: string; status: string; expires_at: string; regularization_deadline: string | null } | null;
};

export async function listMyProposals(): Promise<BrokerProposal[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, status, client_name, offered_price, submitted_at, created_at, unit:units(code, development:developments(name, slug)), reservation:reservations(id, status, expires_at, regularization_deadline)")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as BrokerProposal[];
}

/** Texto curto da fila para o corretor (nunca revela valores ou corretores). */
export function queueLabel(n: number | null) {
  if (n === null) return null;
  if (n === 0) return "Sem fila";
  return n === 1 ? "1 proposta na fila" : `${n} propostas na fila`;
}
