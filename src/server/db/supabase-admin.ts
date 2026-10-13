import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { requireServerSecret } from "@/server/env";

/**
 * Cliente com chave secreta: IGNORA o RLS. Uso restrito a operações de sistema
 * (rate limit, outbox, inserção de leads, resolução de e-mail para notificações).
 * Nunca use para ler dados em nome de um usuário.
 */
export function createSupabaseAdminClient() {
  return createClient(publicEnv.supabaseUrl, requireServerSecret("secretKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
