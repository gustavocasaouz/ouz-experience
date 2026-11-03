import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/server/notifications/outbox";
import { serverEnv } from "@/server/env";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const expected = serverEnv.cronSecret;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Vercel Cron chama esta rota com "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  // Lembrete mensal das manutenções do manual (portal + e-mail); antes do envio, para sair no mesmo lote.
  const { data: maintenance, error } = await createSupabaseAdminClient().rpc("queue_maintenance_reminders");
  if (error) console.error("maintenance_reminders_error", { code: error.code });
  const result = await processOutbox(50);
  return NextResponse.json({ ...result, maintenance: maintenance ?? 0 });
}
