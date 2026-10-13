import { ButtonLink, EmptyState, Wordmark } from "@/design-system";

export default function NotFound() {
  return (
    <main id="conteudo" className="container-page py-16 flex flex-col gap-10 max-w-xl">
      <Wordmark />
      <EmptyState title="Página não encontrada" action={<ButtonLink href="/" variant="secondary">Voltar ao início</ButtonLink>}>
        O endereço pode ter mudado ou você não tem acesso a este conteúdo.
      </EmptyState>
    </main>
  );
}
