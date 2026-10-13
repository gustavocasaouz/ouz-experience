import { EmptyState, PageHeader } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { markNotificationsRead } from "@/server/actions/client";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Notificações" };

export default async function Notifications() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title="Notificações"
        description={unread ? `${unread} não lida(s)` : "Tudo em dia."}
        actions={unread ? <form action={markNotificationsRead}><SubmitButton size="sm" variant="secondary">Marcar todas como lidas</SubmitButton></form> : undefined}
      />
      {!data?.length ? (
        <EmptyState title="Nenhuma notificação" />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {data.map((n) => (
            <li key={n.id} className={`py-4 ${n.read_at ? "opacity-70" : ""}`}>
              <form action={markNotificationsRead} className="flex flex-col gap-1">
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link ?? ""} />
                <p className="text-xs text-ink-mute">{formatDateTime(n.created_at)} {!n.read_at && <span className="ml-2 inline-block size-2 rounded-full bg-accent align-middle" aria-label="não lida" />}</p>
                <button className="text-left font-medium hover:underline underline-offset-4">{n.title}</button>
                {n.body && <p className="text-sm text-ink-soft">{n.body}</p>}
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
