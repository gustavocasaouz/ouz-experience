"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/design-system/cx";

export type TabIcon = "unidades" | "chamados" | "concierge" | "agenda" | "avisos" | "inicio" | "propostas" | "lancamentos" | "cadastro";
export type TabItem = { href: string; label: string; icon: TabIcon; badge?: number };

/** Ícones de traço reto e cantos vivos, na geometria do símbolo OUZ (24 × 24, traço 1,5). */
const PATHS: Record<TabIcon, string> = {
  unidades: "M4 21V5l8-2v18M12 7h8v14M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2M2 21h20",
  chamados: "M4 4h16v12H9l-5 4V4ZM8 9h8M8 12h5",
  concierge: "M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4",
  agenda: "M4 6h16v15H4V6ZM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2",
  avisos: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2ZM10 21h4",
  inicio: "M3 11 12 4l9 7M5 9.5V20h5v-6h4v6h5V9.5",
  propostas: "M6 3h9l4 4v14H6V3ZM15 3v4h4M9 12h7M9 15h7M9 18h4",
  lancamentos: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  cadastro: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
};

/**
 * Barra de abas do celular (HIG › Tab bars): navegação entre as seções principais, sempre visível,
 * no rodapé (alcance com uma mão), com ícone + rótulo de uma palavra e selo para avisos não lidos.
 * Fundo translúcido com desfoque: o conteúdo passa por baixo, como no iOS. No computador, o menu lateral assume.
 */
export function TabBar({ items, root }: { items: TabItem[]; root: string }) {
  const pathname = usePathname();
  // Aba ativa = a de prefixo mais longo que casa com a página (ex.: /cliente/unidades/… acende "Unidades").
  const match = items.filter((t) => pathname === t.href || pathname.startsWith(t.href + "/") || (t.href === root && pathname.startsWith(root)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const isActive = (href: string) => match?.href === href;
  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/80 backdrop-blur-xl backdrop-saturate-150 pb-[env(safe-area-inset-bottom)] supports-[not(backdrop-filter:blur(1px))]:bg-paper"
    >
      <ul className="flex">
        {items.map((t) => {
          const active = isActive(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center justify-center gap-1 min-h-14 pt-2 pb-1.5 text-[0.68rem] tracking-wide", active ? "text-ink" : "text-ink-mute")}
              >
                <span className="relative">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
                    <path d={PATHS[t.icon]} />
                  </svg>
                  {t.badge ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-danger text-paper text-[0.62rem] leading-4 text-center font-medium">
                      {t.badge > 99 ? "99+" : t.badge}
                      <span className="sr-only"> não lidos</span>
                    </span>
                  ) : null}
                </span>
                <span className={cx(active && "font-medium")}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
