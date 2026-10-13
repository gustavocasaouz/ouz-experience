import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";

export async function clientIpHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Retorna true se a ação pode prosseguir. Falha aberta só se o banco estiver indisponível em desenvolvimento. */
export async function checkRateLimit(scope: string, max: number, windowSeconds: number, subject?: string) {
  const key = `${scope}:${subject ?? (await clientIpHash())}`;
  const { data, error } = await createSupabaseAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate_limit_error", { scope, code: error.code });
    return process.env.APP_ENV !== "production";
  }
  return data === true;
}
