import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card, RestrictedState, Wordmark } from "@/design-system";
import { EnvironmentBanner } from "@/components/environment-banner";
import { requireViewer } from "@/server/auth/viewer";
import { BROKER_STATUS_LABELS } from "@/server/auth/permissions";
import { signOut } from "@/server/actions/auth";
import { availableContexts } from "@/components/app-shell";
import { InstallPrompt } from "@/components/pwa";

export const metadata = { title: "Minha conta" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ restrito?: string; escolher?: string }> }) {
  const { restrito, escolher } = await searchParams;
  const viewer = await requireViewer("/conta");
  const contexts = availableContexts(viewer);
  // Um único contexto: vai direto, salvo quando a pessoa pediu para ver a conta.
  if (contexts.length === 1 && !restrito && escolher === undefined && contexts[0] !== "admin") redirect(`/${contexts[0]}`);

  return (
    <>
      <EnvironmentBanner />
      <header className="container-page flex h-16 items-center justify-between">
        <Wordmark subtitle="Experience" />
        <form action={signOut}>
          <button className="text-sm text-ink-soft hover:text-ink underline underline-offset-4">Sair</button>
        </form>
      </header>
      <main id="conteudo" className="container-page max-w-3xl py-10 flex flex-col gap-8">
        <div>
          <p className="eyebrow mb-2">Minha conta</p>
          <h1 className="font-display text-4xl">Olá{viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}</h1>
          <p className="text-ink-soft mt-2">{viewer.email}</p>
        </div>

        <InstallPrompt />

        {restrito === "admin" && <RestrictedState>A administração é exclusiva da equipe OUZ, com acesso concedido por convite.</RestrictedState>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6 flex flex-col gap-3">
            <p className="eyebrow">Cliente</p>
            {viewer.isClient ? (
              <>
                <p className="text-sm text-ink-soft">Acompanhe suas unidades, documentos e solicitações.</p>
                <ButtonLink href="/cliente" className="self-start">Abrir área do cliente</ButtonLink>
              </>
            ) : (
              <p className="text-sm text-ink-soft">
                O acesso de cliente é liberado por convite da OUZ, enviado ao e-mail cadastrado no seu contrato. Recebeu um convite? Abra o link do e-mail.
              </p>
            )}
          </Card>
          <Card className="p-6 flex flex-col gap-3">
            <p className="eyebrow">Corretor</p>
            {viewer.broker ? (
              <>
                <Badge tone={viewer.broker.status === "aprovado" ? "success" : "warning"} className="self-start">
                  {BROKER_STATUS_LABELS[viewer.broker.status]}
                </Badge>
                <ButtonLink href="/corretor" className="self-start">Abrir portal do corretor</ButtonLink>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">É corretor? Faça seu cadastro profissional para análise da OUZ.</p>
                <ButtonLink href="/corretor/cadastro" variant="secondary" className="self-start">Cadastrar como corretor</ButtonLink>
              </>
            )}
          </Card>
          {viewer.staff && (
            <Card className="p-6 flex flex-col gap-3 sm:col-span-2">
              <p className="eyebrow">Equipe OUZ</p>
              <p className="text-sm text-ink-soft">
                {viewer.staff.role === "administrador" ? "Administrador" : "Operador"}
                {viewer.staff.mfaOk ? " · verificação em duas etapas ativa nesta sessão" : " · verificação em duas etapas pendente nesta sessão"}
              </p>
              <ButtonLink href="/admin" className="self-start">Abrir administração</ButtonLink>
            </Card>
          )}
        </div>

        <div className="text-sm text-ink-soft flex flex-wrap gap-6 border-t border-line pt-6">
          <Link href="/entrar/redefinir" className="underline underline-offset-4">Alterar senha</Link>
          <Link href="/entrar/mfa?next=/conta" className="underline underline-offset-4">Verificação em duas etapas</Link>
        </div>
      </main>
    </>
  );
}
