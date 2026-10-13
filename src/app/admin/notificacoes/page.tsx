import { Badge, EmptyState, PageHeader, Table, Td } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { processOutboxNow, retryOutboxItem } from "@/server/actions/admin/content";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Notificações" };
const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { enviado: "success", pendente: "warning", processando: "info", falhou: "danger", descartado: "neutral" };

export default async function NotificationsPage({ searchParams }: { searchParams: SP }) {
  const { denied } = await staffWith(["notificacoes"], "/admin/notificacoes");
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notification_outbox")
    .select("id, dedupe_key, template, status, attempts, last_error, created_at, sent_at, next_attempt_at, provider_message_id")
    .order("created_at", { ascending: false })
    .limit(200);
  const mode = process.env.EMAIL_MODE === "resend" && process.env.APP_ENV === "production" ? "Resend (envio real)" : "Log (nenhum e-mail sai do servidor)";
  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Notificações"
        description={`Fila de e-mails com proteção contra duplicidade. Modo atual: ${mode}.`}
        actions={
          <form action={processOutboxNow}>
            <SubmitButton variant="secondary" size="sm">Processar fila agora</SubmitButton>
          </form>
        }
      />
      <Flash searchParams={searchParams} />
      {!data?.length ? (
        <EmptyState title="Fila vazia" />
      ) : (
        <Table head={["Criado", "Modelo", "Chave", "Status", "Tentativas", ""]} caption="Fila de notificações">
          {data.map((n) => (
            <tr key={n.id}>
              <Td className="whitespace-nowrap">{formatDateTime(n.created_at)}</Td>
              <Td>{n.template}</Td>
              <Td className="text-xs text-ink-mute break-all max-w-56">{n.dedupe_key}</Td>
              <Td>
                <Badge tone={TONE[n.status]}>{n.status}</Badge>
                {n.sent_at && <span className="block text-xs text-ink-mute mt-1">{formatDateTime(n.sent_at)}</span>}
                {n.last_error && <span className="block text-xs text-danger mt-1">{n.last_error}</span>}
              </Td>
              <Td>{n.attempts}</Td>
              <Td>
                {(n.status === "falhou" || n.status === "descartado") && (
                  <form action={retryOutboxItem}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="text-xs underline underline-offset-4">Reprocessar</button>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
