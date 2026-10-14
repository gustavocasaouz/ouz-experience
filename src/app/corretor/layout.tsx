import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/server/auth/viewer";
import { brokerNav } from "@/components/broker-nav";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/corretor");
  const nav = brokerNav(viewer);
  return (
    <AppShell viewer={viewer} area="corretor" nav={nav}>
      {children}
    </AppShell>
  );
}
