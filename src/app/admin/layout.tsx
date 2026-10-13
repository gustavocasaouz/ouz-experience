import { AppShell } from "@/components/app-shell";
import { hasPermission, requireStaffPage } from "@/server/auth/viewer";
import type { StaffPermission } from "@/server/auth/permissions";

const NAV: Array<{ href: string; label: string; perm?: StaffPermission[] }> = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/corretores", label: "Corretores", perm: ["corretores"] },
  { href: "/admin/empreendimentos", label: "Empreendimentos", perm: ["conteudo", "comercial", "politicas"] },
  { href: "/admin/grupos", label: "Grupos de corretores", perm: ["comercial"] },
  { href: "/admin/propostas", label: "Propostas", perm: ["comercial"] },
  { href: "/admin/reservas", label: "Reservas", perm: ["comercial", "documentos"] },
  { href: "/admin/pre-lancamento", label: "Pré-lançamento", perm: ["comercial"] },
  { href: "/admin/clientes", label: "Clientes", perm: ["clientes", "atendimento"] },
  { href: "/admin/conteudo", label: "Conteúdo do site", perm: ["conteudo"] },
  { href: "/admin/eventos", label: "Eventos", perm: ["eventos"] },
  { href: "/admin/interessados", label: "Interessados", perm: ["atendimento", "comercial"] },
  { href: "/admin/equipe", label: "Equipe", perm: ["administracao"] },
  { href: "/admin/notificacoes", label: "Notificações", perm: ["notificacoes"] },
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
