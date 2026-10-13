"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Fecha menus <details data-autoclose> ao trocar de página (navegação no cliente preserva o layout). */
export function CloseMenusOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>("details[data-autoclose]").forEach((d) => (d.open = false));
  }, [pathname]);
  return null;
}
