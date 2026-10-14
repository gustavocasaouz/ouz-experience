import { AppShell } from "@/components/app-shell";
import type { Viewer } from "@/server/auth/viewer";

/** Páginas comuns a clientes e corretores (agenda, notificações): usa o contexto principal da pessoa. */
export function PortalShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const area = viewer.isClient ? "cliente" : viewer.broker ? "corretor" : "cliente";
  const nav =
    area === "cliente"
      ? [
          { href: "/cliente", label: "Minhas unidades" },
          { href: "/cliente/chamados", label: "Chamados" },
          { href: "/cliente/concierge", label: "Concierge" },
          { href: "/agenda", label: "Agenda" },
          { href: "/notificacoes", label: "Notificações" },
        ]
      : [
          { href: "/corretor", label: "Início" },
          { href: "/corretor/propostas", label: "Minhas propostas" },
          { href: "/agenda", label: "Agenda" },
          { href: "/notificacoes", label: "Notificações" },
        ];
  return (
    <AppShell viewer={viewer} area={area} nav={nav}>
      {children}
    </AppShell>
  );
}
