import Link from "next/link";
import { Card, PageHeader } from "@/design-system";
import { hasPermission, requireStaffPage } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { PERMISSION_LABELS } from "@/server/auth/permissions";

export const metadata = { title: "Administração" };

export default async function AdminHome() {
  const viewer = await requireStaffPage("/admin");
  const supabase = await createSupabaseServerClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const tiles: Array<{ label: string; value: number; href: string }> = [];
  if (hasPermission(viewer, "corretores")) {
    tiles.push({
      label: "Corretores aguardando análise",
      value: await count(supabase.from("broker_profiles").select("*", { count: "exact", head: true }).eq("status", "pendente")),
      href: "/admin/corretores?status=pendente",
    });
  }
  if (hasPermission(viewer, "comercial")) {
    tiles.push({
      label: "Propostas em análise",
      value: await count(supabase.from("proposals").select("id", { count: "exact", head: true }).eq("status", "em_analise")),
      href: "/admin/propostas?status=em_analise",
    });
  }
  if (hasPermission(viewer, "comercial") || hasPermission(viewer, "documentos")) {
    tiles.push({
      label: "Reservas aguardando conferência",
      value: await count(supabase.from("reservations").select("*", { count: "exact", head: true }).in("status", ["documentacao_enviada", "aguardando_conferencia"])),
      href: "/admin/reservas?status=documentacao_enviada",
    });
  }
  // Avisos para a equipe (nova proposta, reserva, chamado, comprovante…) ficam em "Minhas notificações".
  tiles.push({
    label: "Minhas notificações não lidas",
    value: await count(supabase.from("notifications").select("*", { count: "exact", head: true }).is("read_at", null)),
    href: "/notificacoes",
  });
  if (hasPermission(viewer, "clientes")) {
    tiles.push({
      label: "Clientes sem conta ativada",
      value: await count(supabase.from("clients").select("*", { count: "exact", head: true }).is("user_id", null)),
      href: "/admin/clientes",
    });
  }
  if (hasPermission(viewer, "atendimento")) {
    tiles.push({
      label: "Chamados em aberto",
      value: await count(supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ["aberto", "em_analise", "agendado", "em_atendimento"])),
      href: "/admin/chamados",
    });
  }
  if (hasPermission(viewer, "financeiro")) {
    tiles.push({
      label: "Comprovantes para conferir",
      value: await count(supabase.from("payment_receipts").select("id", { count: "exact", head: true }).eq("status", "enviado")),
      href: "/admin/financeiro",
    });
  }
  if (hasPermission(viewer, "concierge")) {
    tiles.push({
      label: "Concierge aguardando a OUZ",
      value: await count(supabase.from("concierge_requests").select("id", { count: "exact", head: true }).in("status", ["solicitada", "em_analise", "aprovada_cliente"])),
      href: "/admin/concierge",
    });
  }
  if (hasPermission(viewer, "notificacoes")) {
    tiles.push({
      label: "Notificações com falha",
      value: await count(supabase.from("notification_outbox").select("*", { count: "exact", head: true }).eq("status", "falhou")),
      href: "/admin/notificacoes",
    });
  }

  const perms = viewer.staff.role === "administrador" ? "todas" : viewer.staff.permissions.map((p) => PERMISSION_LABELS[p].label).join(", ") || "nenhuma";
  return (
    <>
      <PageHeader
        eyebrow="Administração do Experience"
        title="Painel"
        description={`${viewer.staff.role === "administrador" ? "Administrador" : "Operador"} · permissões: ${perms}`}
      />
      {tiles.length === 0 ? (
        <p className="text-ink-soft">Nenhum indicador disponível para as suas permissões.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href}>
              <Card className="p-6 hover:border-ink transition-colors h-full">
                <p className="font-display text-5xl">{t.value}</p>
                <p className="text-sm text-ink-soft mt-2">{t.label}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
