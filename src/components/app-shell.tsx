import Link from "next/link";
import { Wordmark } from "@/design-system";
import { cx } from "@/design-system/cx";
import type { Viewer } from "@/server/auth/viewer";
import { signOut } from "@/server/actions/auth";
import { EnvironmentBanner } from "./environment-banner";
import { NavLinks, type NavItem } from "./nav-links";
import { CloseMenusOnNavigate } from "./close-menus-on-navigate";

type Area = "cliente" | "corretor" | "admin";
const AREA_LABEL: Record<Area, string> = { cliente: "Cliente", corretor: "Corretor", admin: "Administração" };

export function availableContexts(viewer: Viewer): Area[] {
  const out: Area[] = [];
  if (viewer.isClient) out.push("cliente");
  if (viewer.broker) out.push("corretor");
  if (viewer.staff) out.push("admin");
  return out;
}

export function AppShell({ viewer, area, nav, children }: { viewer: Viewer; area: Area; nav: NavItem[]; children: React.ReactNode }) {
  const contexts = availableContexts(viewer);
  return (
    <>
      <EnvironmentBanner />
      <CloseMenusOnNavigate />
      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Wordmark href={`/${area}`} subtitle={AREA_LABEL[area]} />
            {contexts.length > 1 && (
              <nav aria-label="Trocar de contexto" className="hidden sm:flex items-center gap-1 text-xs">
                {contexts.map((c) => (
                  <Link
                    key={c}
                    href={`/${c}`}
                    aria-current={c === area ? "true" : undefined}
                    className={cx("px-3 py-1.5 rounded-full border", c === area ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink")}
                  >
                    {AREA_LABEL[c]}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <details data-autoclose className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
              <span className="size-8 rounded-full bg-sand grid place-items-center text-ink font-medium" aria-hidden>
                {(viewer.fullName || viewer.email).charAt(0).toUpperCase()}
              </span>
              <span className="hidden md:inline max-w-48 truncate">{viewer.fullName || viewer.email}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 bg-surface border border-line shadow-sm z-40 p-2 text-sm">
              <p className="px-3 py-2 text-xs text-ink-mute truncate">{viewer.email}</p>
              {contexts.length > 1 &&
                contexts.map((c) => (
                  <Link key={c} href={`/${c}`} className="block px-3 py-2 hover:bg-sand sm:hidden">
                    {AREA_LABEL[c]}
                  </Link>
                ))}
              <Link href="/conta" className="block px-3 py-2 hover:bg-sand">Minha conta</Link>
              <Link href="/" className="block px-3 py-2 hover:bg-sand">Início</Link>
              <form action={signOut}>
                <button type="submit" className="w-full text-left px-3 py-2 hover:bg-sand">Sair</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <div className="container-page flex-1 flex flex-col md:flex-row gap-6 md:gap-10 py-6 md:py-10">
        <nav aria-label={`Navegação — ${AREA_LABEL[area]}`} className="md:w-52 shrink-0 md:sticky md:top-6 md:self-start">
          <NavLinks items={nav} root={`/${area}`} />
        </nav>
        <main id="conteudo" className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </>
  );
}
