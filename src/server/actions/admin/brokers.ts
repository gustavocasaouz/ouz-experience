"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutbox } from "@/server/notifications/outbox";
import { back, failOn, guard, str } from "./util";

const STATUSES = ["aprovado", "recusado", "ajustes_solicitados", "suspenso", "revogado"] as const;

export async function setBrokerStatus(fd: FormData) {
  const id = str(fd, "user_id");
  const path = `/admin/corretores/${id}`;
  await guard("corretores", path);
  const status = str(fd, "status");
  if (!(STATUSES as readonly string[]).includes(status)) back(path, "erro", "Ação inválida.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_broker_status", { p_broker_user_id: id, p_status: status, p_reason: str(fd, "reason") || null });
  failOn(error, path);
  // A função do banco já enfileirou o e-mail (com dedupe); processamos logo após responder.
  after(() => processOutbox(10).catch(() => undefined));
  revalidatePath("/admin/corretores");
  back(path, "ok", "Status atualizado e corretor notificado.");
}
