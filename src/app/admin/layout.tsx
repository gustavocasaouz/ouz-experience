import { AppShell } from "@/components/app-shell";
import { hasPermission, requireStaffPage } from "@/server/auth/viewer";
import type { StaffPermission } from "@/server/auth/permissions";

const NAV: Array<{ href: string; label: string; perm?: StaffPermission[] }> = [
  { href: "/admin", label: "Painel" },
  { href: "/notificacoes", label: "Minhas notificações" },
  { href: "/admin/corretores", label: "Corretores", perm: ["corretores"] },
  { href: "/admin/empreendimentos", label: "Empreendimentos", perm: ["conteudo", "comercial", "politicas", "documentos"] },
  { href: "/admin/grupos", label: "Grupos de corretores", perm: ["comercial"] },
  { href: "/admin/propostas", label: "Propostas", perm: ["comercial"] },
  { href: "/admin/reservas", label: "Reservas", perm: ["comercial", "documentos"] },
  { href: "/admin/pre-lancamento", label: "Pré-lançamento", perm: ["comercial"] },
  { href: "/admin/clientes", label: "Clientes", perm: ["clientes", "atendimento"] },
  { href: "/admin/chamados", label: "Chamados", perm: ["atendimento"] },
  { href: "/admin/personalizacoes", label: "Personalizações", perm: ["atendimento"] },
  { href: "/admin/entregas", label: "Vistorias e entregas", perm: ["atendimento"] },
  { href: "/admin/financeiro", label: "Financeiro", perm: ["financeiro"] },
  { href: "/admin/concierge", label: "Concierge", perm: ["concierge"] },
  { href: "/admin/eventos", label: "Eventos", perm: ["eventos"] },
  { href: "/admin/equipe", label: "Equipe", perm: ["administracao"] },
  { href: "/admin/notificacoes", label: "Envios de e-mail", perm: ["notificacoes"] },
  { href: "/admin/auditoria", label: "Auditoria", perm: ["auditoria"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaffPage("/admin");
  const nav = NAV.filter((n) => !n.perm || n.perm.some((p) => hasPermission(viewer, p)));
  return (
    <AppShell viewer={viewer} area="admin" nav={nav}>
      {children}
    </AppShell>
  );
}
