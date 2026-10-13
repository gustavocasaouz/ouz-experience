import { AuthCard } from "@/components/auth/auth-card";
import { InviteAcceptor } from "@/components/auth/invite-acceptor";
import { getViewer } from "@/server/auth/viewer";

export const metadata = { title: "Convite" };

export default async function InvitePage() {
  const viewer = await getViewer();
  return (
    <AuthCard eyebrow="OUZ Experience" title="Convite">
      <InviteAcceptor signedInAs={viewer?.email ?? null} />
    </AuthCard>
  );
}
