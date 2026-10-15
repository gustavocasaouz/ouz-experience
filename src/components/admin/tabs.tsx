"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cx } from "@/design-system/cx";

/**
 * Abas internas de uma seção. No celular rolam na horizontal: a aba ativa é trazida para a vista
 * e a borda direita esmaece para indicar que há mais opções.
 */
export function Tabs({ items, current }: { items: Array<{ href: string; label: string; key: string }>; current: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav
      ref={ref}
      aria-label="Seções"
      className="flex gap-1 overflow-x-auto border-b border-line mb-8 -mt-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)]"
    >
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cx(
            "snap-start px-4 min-h-11 flex items-center text-sm whitespace-nowrap border-b-2 -mb-px",
            t.key === current ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
      <span aria-hidden className="shrink-0 w-8 md:hidden" />
    </nav>
  );
}
