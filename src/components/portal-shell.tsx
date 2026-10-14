import { AppShell } from "@/components/app-shell";
import { brokerNav } from "@/components/broker-nav";
import type { Viewer } from "@/server/auth/viewer";

/** Páginas comuns (agenda, notificações): usa o contexto principal da pessoa — cliente, corretor ou equipe. */
export function PortalShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const area = viewer.isClient ? "cliente" : viewer.broker ? "corretor" : viewer.staff ? "admin" : "cliente";
  const nav =
    area === "cliente"
      ? [
          { href: "/cliente", label: "Minhas unidades" },
          { href: "/cliente/chamados", label: "Chamados" },
          { href: "/cliente/concierge", label: "Concierge" },
          { href: "/agenda", label: "Agenda" },
          { href: "/notificacoes", label: "Notificações" },
        ]
      : area === "corretor"
        ? brokerNav(viewer)
        : [
            { href: "/admin", label: "Painel" },
            { href: "/notificacoes", label: "Minhas notificações" },
          ];
  return (
    <AppShell viewer={viewer} area={area} nav={nav}>
      {children}
    </AppShell>
  );
}
