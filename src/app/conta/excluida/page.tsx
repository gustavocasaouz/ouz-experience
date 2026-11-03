import { ButtonLink, SuccessState, Wordmark } from "@/design-system";
import { ForgetBiometric } from "@/components/biometric";

export const metadata = { title: "Conta excluída" };

export default function DeletedAccountPage() {
  return (
    <>
      <header className="container-page flex h-16 items-center">
        <Wordmark subtitle="Experience" />
      </header>
      <main id="conteudo" className="container-page max-w-xl py-10">
        <ForgetBiometric />
        <SuccessState title="Sua conta foi excluída" action={<ButtonLink href="/">Voltar ao início</ButtonLink>}>
          O acesso foi apagado em todos os aparelhos. Obrigado por ter usado o OUZ Experience.
        </SuccessState>
      </main>
    </>
  );
}
