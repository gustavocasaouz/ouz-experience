import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="container-page py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-mute">
        <span>© {new Date().getFullYear()} OUZ</span>
        <nav aria-label="Políticas" className="flex gap-4">
          <Link href="/privacidade" className="hover:text-ink">Privacidade</Link>
          <Link href="/termos" className="hover:text-ink">Termos de uso</Link>
        </nav>
      </div>
    </footer>
  );
}
