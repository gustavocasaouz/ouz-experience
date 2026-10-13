import { AppShell } from "@/components/app-shell";
import { RestrictedState, ButtonLink } from "@/design-system";
import { requireViewer } from "@/server/auth/viewer";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/cliente");
  return (
    <AppShell viewer={viewer} area="cliente" nav={[{ href: "/cliente", label: "Minhas unidades" }]}>
      {viewer.isClient ? (
        children
      ) : (
        <RestrictedState
          title="Área exclusiva de clientes OUZ"
          action={<ButtonLink href="/conta?escolher" variant="secondary">Minha conta</ButtonLink>}
        >
          O acesso é liberado por convite enviado ao e-mail cadastrado no seu contrato. Se você é cliente e não recebeu, fale com a OUZ.
        </RestrictedState>
      )}
    </AppShell>
  );
}
