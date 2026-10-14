import Link from "next/link";
import { Wordmark } from "@/design-system";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-sand/50">
      <div className="container-page py-12 grid gap-10 md:grid-cols-4 text-sm text-ink-soft">
        <div className="md:col-span-2 flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm">Vamos além do metro quadrado. Unimos design e tecnologia para criar empreendimentos exclusivos.</p>
          <address className="not-italic text-xs leading-relaxed">
            Rod. José Carlos Daux, 5500 · Sala 210, Bloco Lagoa B<br />Cacupé, Florianópolis/SC · 88032-005
          </address>
          <p className="flex flex-wrap gap-4 text-xs">
            <a className="hover:text-ink" href="https://wa.me/5548991682087" target="_blank" rel="noopener noreferrer">WhatsApp +55 48 99168-2087</a>
            <a className="hover:text-ink" href="mailto:contato@ouzgroup.com.br">contato@ouzgroup.com.br</a>
            <a className="hover:text-ink" href="https://www.instagram.com/ouz.inc/" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a className="hover:text-ink" href="https://ouzgroup.com.br" target="_blank" rel="noopener noreferrer">ouzgroup.com.br</a>
          </p>
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
      <div className="container-page pb-8 text-xs text-ink-mute">© {new Date().getFullYear()} OUZ. Imagens ilustrativas.</div>
    </footer>
  );
}
