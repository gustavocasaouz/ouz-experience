import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Cliente anônimo sem cookies: só enxerga o que o RLS libera para "anon". Permite cache das páginas públicas. */
export function createSupabasePublicClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, { auth: { persistSession: false } });
}

export function publicMediaUrl(path: string | null | undefined) {
  if (!path || !publicEnv.supabaseUrl) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/public-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
