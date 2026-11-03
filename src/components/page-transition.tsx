"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Transição entre páginas no estilo iOS (React <ViewTransition> + View Transitions API do navegador).
 * A direção (avançar, voltar, trocar de aba, gesto de voltar) vem de data-nav no <html>, marcado por NativeFeel;
 * as animações ficam em globals.css. Sem suporte no navegador (iOS < 18), a página só troca, como antes.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page" exit="page" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
