import Link from "next/link";
import { Wordmark, buttonClass } from "@/design-system";
import { getViewer } from "@/server/auth/viewer";
import { CloseMenusOnNavigate } from "./close-menus-on-navigate";

const NAV = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/#a-ouz", label: "A OUZ" },
  { href: "/novidades", label: "Novidades" },
  { href: "/eventos", label: "Eventos" },
  { href: "/interesse", label: "Tenho interesse" },
];

export async function SiteHeader() {
  const viewer = await getViewer().catch(() => null);
  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <CloseMenusOnNavigate />
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Wordmark />
        <nav aria-label="Principal" className="hidden lg:flex items-center gap-8 text-sm text-ink-soft">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          {viewer ? (
            <Link href="/conta" className={buttonClass("secondary", "sm")}>
              Minha conta
            </Link>
          ) : (
            <>
              <Link href="/entrar?next=/cliente" className="text-sm text-ink-soft hover:text-ink">
                Área do cliente
              </Link>
              <Link href="/corretor" className={buttonClass("secondary", "sm")}>
                Portal do corretor
              </Link>
            </>
          )}
        </div>
        <details data-autoclose className="lg:hidden group">
          <summary className="list-none cursor-pointer p-2 -mr-2" aria-label="Abrir menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M4 8h16M4 16h16" />
            </svg>
          </summary>
          <nav aria-label="Menu" className="absolute inset-x-0 top-full h-[calc(100dvh-4rem)] bg-paper border-t border-line overflow-y-auto">
            <ul className="container-page flex flex-col py-6">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="block py-4 font-display text-2xl border-b border-line">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li className="pt-8 flex flex-col gap-3">
                {viewer ? (
                  <Link href="/conta" className={buttonClass("primary", "lg")}>
                    Minha conta
                  </Link>
                ) : (
                  <>
                    <Link href="/entrar?next=/cliente" className={buttonClass("primary", "lg")}>
                      Área do cliente
                    </Link>
                    <Link href="/corretor" className={buttonClass("secondary", "lg")}>
                      Portal do corretor
                    </Link>
                  </>
                )}
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
