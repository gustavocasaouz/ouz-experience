import Link from "next/link";
import { Wordmark } from "@/design-system";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-sand/50">
      <div className="container-page py-12 grid gap-10 md:grid-cols-4 text-sm text-ink-soft">
        <div className="md:col-span-2 flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm">Construtora e incorporadora de empreendimentos de alto padrão em Florianópolis.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-col gap-2">
          <Link href="/empreendimentos" className="hover:text-ink">Empreendimentos</Link>
          <Link href="/novidades" className="hover:text-ink">Novidades</Link>
          <Link href="/eventos" className="hover:text-ink">Eventos</Link>
          <Link href="/interesse" className="hover:text-ink">Tenho interesse</Link>
        </nav>
        <nav aria-label="Acesso e políticas" className="flex flex-col gap-2">
          <Link href="/entrar?next=/cliente" className="hover:text-ink">Área do cliente</Link>
          <Link href="/corretor" className="hover:text-ink">Portal do corretor</Link>
          <Link href="/privacidade" className="hover:text-ink">Privacidade</Link>
          <Link href="/termos" className="hover:text-ink">Termos de uso</Link>
        </nav>
      </div>
      <div className="container-page pb-8 text-xs text-ink-mute">© {new Date().getFullYear()} OUZ. Imagens e textos ilustrativos até a publicação oficial.</div>
    </footer>
  );
}
