import { OuzSymbol } from "@/design-system";
import { RetryButton } from "./retry-button";

export const dynamic = "force-static";
export const metadata = { title: "Sem conexão" };

/** Página estática mostrada pelo service worker quando não há internet. Não contém dados pessoais. */
export default function Offline() {
  return (
    <main id="conteudo" className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <OuzSymbol className="size-12 text-ink" />
      <h1 className="font-display text-3xl">Sem conexão</h1>
      <p className="text-ink-soft max-w-sm">Verifique sua internet. Seus dados ficam protegidos e não são guardados neste aparelho.</p>
      <RetryButton />
    </main>
  );
}
