import Link from "next/link";
import { Wordmark } from "@/design-system";

/** Cabeçalho das páginas avulsas (privacidade, termos): o conteúdo institucional fica em ouzgroup.com.br. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Wordmark subtitle="Experience" />
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">← Voltar ao início</Link>
      </div>
    </header>
  );
}
