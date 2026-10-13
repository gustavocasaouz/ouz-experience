import { PortalShell } from "@/components/portal-shell";
import { requireViewer } from "@/server/auth/viewer";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/notificacoes");
  return <PortalShell viewer={viewer}>{children}</PortalShell>;
}
