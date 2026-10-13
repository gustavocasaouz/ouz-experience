import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/server/notifications/outbox";
import { serverEnv } from "@/server/env";

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
  const result = await processOutbox(50);
  return NextResponse.json(result);
}
