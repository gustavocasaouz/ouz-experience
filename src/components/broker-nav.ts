import type { Viewer } from "@/server/auth/viewer";

/** Menu do portal do corretor (mesmo em /corretor, /agenda e /notificacoes). */
export function brokerNav(viewer: Viewer) {
  const approved = viewer.broker?.status === "aprovado";
  return [
    { href: "/corretor", label: "Início" },
    ...(approved
      ? [
          { href: "/corretor/propostas", label: "Minhas propostas" },
          { href: "/corretor/pre-lancamento", label: "Pré-lançamento" },
        ]
      : []),
    { href: "/corretor/cadastro", label: "Meu cadastro" },
    ...(approved ? [{ href: "/agenda", label: "Agenda" }] : []),
    { href: "/notificacoes", label: "Notificações" },
  ];
}
