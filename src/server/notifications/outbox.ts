import "server-only";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";
import { serverEnv } from "@/server/env";
import { publicEnv } from "@/lib/env";
import { renderTemplate } from "./templates";

type OutboxRow = {
  id: string;
  dedupe_key: string;
  template: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  payload: Record<string, unknown>;
};

/** Enfileira um e-mail. Repetir a mesma dedupe_key não gera segundo envio. */
export async function enqueueEmail(input: {
  dedupeKey: string;
  template: string;
  recipientUserId?: string;
  recipientEmail?: string;
  payload?: Record<string, unknown>;
}) {
  const { error } = await createSupabaseAdminClient()
    .from("notification_outbox")
    .upsert(
      {
        dedupe_key: input.dedupeKey,
        template: input.template,
        recipient_user_id: input.recipientUserId ?? null,
        recipient_email: input.recipientEmail ?? null,
        payload: input.payload ?? {},
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  if (error) console.error("outbox_enqueue_error", { template: input.template, code: error.code });
}

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

/** Processa a fila. Idempotente: lotes travados com SKIP LOCKED; Resend recebe Idempotency-Key. */
export async function processOutbox(limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_outbox_batch", { p_limit: limit });
  if (error) throw new Error(`claim_outbox_batch: ${error.message}`);
  const rows = (data ?? []) as OutboxRow[];
  const resend = serverEnv.emailMode === "resend" ? new Resend(serverEnv.resendApiKey) : null;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      let to = row.recipient_email;
      if (!to && row.recipient_user_id) {
        const { data: p } = await admin.from("profiles").select("email").eq("id", row.recipient_user_id).maybeSingle();
        to = p?.email ?? null;
      }
      if (!to) throw new Error("destinatário sem e-mail");
      const email = renderTemplate(row.template, row.payload, publicEnv.appUrl);
      let providerId: string | null = null;

      if (resend) {
        if (!serverEnv.emailFrom) throw new Error("EMAIL_FROM não configurado");
        const res = await resend.emails.send(
          { from: serverEnv.emailFrom, to, subject: email.subject, html: email.html, text: email.text },
          { idempotencyKey: row.dedupe_key },
        );
        if (res.error) throw new Error(res.error.message);
        providerId = res.data?.id ?? null;
      } else {
        // Modo log: nada sai do servidor. Em desenvolvimento, mostra o texto (inclui links de convite) no console local.
        console.info(`[email:log] ${row.template} → ${maskEmail(to)} | ${email.subject}`);
        if (serverEnv.appEnv === "development") console.info(email.text);
        providerId = `log:${row.id}`;
      }

      await admin.rpc("complete_outbox_item", { p_id: row.id, p_ok: true, p_provider_id: providerId, p_error: null });
      if ("secret_link" in row.payload) {
        await admin.from("notification_outbox").update({ payload: { ...row.payload, secret_link: "[removido após envio]" } }).eq("id", row.id);
      }
      sent++;
    } catch (e) {
      failed++;
      await admin.rpc("complete_outbox_item", { p_id: row.id, p_ok: false, p_provider_id: null, p_error: (e as Error).message });
    }
  }
  return { claimed: rows.length, sent, failed };
}
