import Link from "next/link";
import { RestrictedState, Wordmark } from "@/design-system";
import { DeleteAccountForm } from "@/components/auth/forms";
import { requireViewer } from "@/server/auth/viewer";

export const metadata = { title: "Excluir conta" };

export default async function DeleteAccountPage() {
  const viewer = await requireViewer("/conta/excluir");

  return (
    <>
      <header className="container-page flex h-16 items-center justify-between">
        <Wordmark subtitle="Experience" />
        <Link href="/conta?escolher" className="text-sm text-ink-soft hover:text-ink underline underline-offset-4">Voltar</Link>
      </header>
      <main id="conteudo" className="container-page max-w-xl py-10 flex flex-col gap-6">
        <div>
          <p className="eyebrow mb-2">Minha conta</p>
          <h1 className="font-display text-4xl">Excluir conta</h1>
          <p className="text-ink-soft mt-2">{viewer.email}</p>
        </div>

        {viewer.staff ? (
          <RestrictedState>Contas da equipe OUZ são removidas pela administração. Fale com um administrador.</RestrictedState>
        ) : (
          <>
            <div className="border border-line bg-surface p-5 flex flex-col gap-4 text-sm">
              <div>
                <p className="font-medium">O que é apagado agora</p>
                <ul className="list-disc pl-5 mt-1 text-ink-soft flex flex-col gap-1">
                  <li>Seu acesso ao OUZ Experience (e-mail, senha e Face ID), em todos os aparelhos.</li>
                  <li>Seu nome e telefone do perfil, seus avisos e suas preferências de comunicação.</li>
                  {viewer.broker && <li>Seu cadastro de corretor e os documentos enviados, quando não houver propostas ou reservas.</li>}
                </ul>
              </div>
              <div>
                <p className="font-medium">O que a OUZ precisa guardar</p>
                <p className="text-ink-soft mt-1">
                  Contratos, parcelas, documentos da unidade, chamados e, para corretores, propostas e reservas ficam com a OUZ pelo
                  prazo exigido em lei, sem ligação com o seu acesso. Veja a <Link href="/privacidade" className="underline">política de privacidade</Link>.
                </p>
              </div>
              <p className="text-ink-soft">
                Se você é cliente e quiser voltar a usar o app, a OUZ pode enviar um convite novo para o e-mail do contrato.
              </p>
            </div>
            <DeleteAccountForm />
          </>
        )}
      </main>
    </>
  );
}
