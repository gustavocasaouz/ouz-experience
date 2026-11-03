"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Nav = "forward" | "back" | "tab" | "pop";

/** Para onde vai o link: aba/menu (troca lateral), um nível acima (voltar) ou mais fundo (avançar). */
function navKind(link: HTMLAnchorElement, from: string, to: string): Nav {
  if (link.closest("nav")) return "tab";
  if (to === "/" || from.startsWith(to.replace(/\/$/, "") + "/")) return "back";
  return "forward";
}

/**
 * Ajustes de "app nativo", no layout raiz:
 * - marca <html data-nav> antes de cada navegação, para PageTransition animar na direção certa;
 *   o gesto de voltar do iPhone (popstate) já tem a animação nativa, então ali não anima de novo;
 * - liga o estado :active no toque (o Safari do iOS só aplica :active com um ouvinte de touchstart);
 * - dentro do app iOS, adiciona .ouz-app no <html> (sem menu de "pressionar e segurar" em links e imagens).
 */
export function NativeFeel() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (/OUZExperienceApp/.test(navigator.userAgent)) root.classList.add("ouz-app");

    const onTouch = () => undefined;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      root.dataset.nav = navKind(link, location.pathname, url.pathname);
    };
    const onPop = () => {
      root.dataset.nav = "pop";
    };

    document.addEventListener("touchstart", onTouch, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("touchstart", onTouch);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Depois que a animação termina, limpa a marca (navegações sem clique, como redirecionamentos, usam o esmaecer padrão).
  useEffect(() => {
    const t = window.setTimeout(() => delete document.documentElement.dataset.nav, 700);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
