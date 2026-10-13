import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { listMyUnits } from "./client";

/** Unidade do cliente atual (ou null). Toda leitura posterior ainda passa pelo RLS. */
export async function myUnit(unitId: string) {
  return (await listMyUnits()).find((x) => x.unit.id === unitId) ?? null;
}

export async function developmentFeed(developmentId: string, unitId: string) {
  const supabase = await createSupabaseServerClient();
  const [milestones, changes, updates, progress, announcements] = await Promise.all([
    supabase.from("development_milestones").select("id, stage, title, description, forecast_date, completed_on, sort_order").eq("development_id", developmentId).order("sort_order").order("forecast_date"),
    supabase.from("milestone_forecast_changes").select("milestone_id, previous_date, new_date, reason, changed_at").order("changed_at", { ascending: false }),
    supabase.from("development_updates").select("id, title, body, published_at, media:development_update_media(id, kind, storage_path, external_url, caption, sort_order)").eq("development_id", developmentId).order("published_at", { ascending: false }).limit(30),
    supabase.from("progress_reports").select("id, reference_date, overall_percent, items, notes").eq("development_id", developmentId).order("reference_date", { ascending: false }).limit(24),
    supabase.from("announcements").select("id, title, body, published_at, unit_id").eq("development_id", developmentId).order("published_at", { ascending: false }).limit(20),
  ]);
  return {
    milestones: milestones.data ?? [],
    changes: changes.data ?? [],
    updates: (updates.data ?? []) as Array<{
      id: string; title: string; body: string | null; published_at: string;
      media: Array<{ id: string; kind: string; storage_path: string | null; external_url: string | null; caption: string | null; sort_order: number }>;
    }>,
    progress: (progress.data ?? []) as Array<{ id: string; reference_date: string; overall_percent: string; items: Array<{ label: string; percent: number }>; notes: string | null }>,
    announcements: (announcements.data ?? []).filter((a) => !a.unit_id || a.unit_id === unitId),
  };
}
