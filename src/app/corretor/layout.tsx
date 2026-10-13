import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/server/auth/viewer";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/corretor");
  const approved = viewer.broker?.status === "aprovado";
  const nav = [
    { href: "/corretor", label: "Início" },
    ...(approved ? [{ href: "/corretor/empreendimentos", label: "Empreendimentos" }] : []),
    { href: "/corretor/cadastro", label: "Meu cadastro" },
  ];
  return (
    <AppShell viewer={viewer} area="corretor" nav={nav}>
      {children}
    </AppShell>
  );
}
