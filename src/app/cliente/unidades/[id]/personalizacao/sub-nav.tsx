"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/design-system/cx";

/** Alternância dentro da aba (mesmo estilo da troca proprietário/condomínio do manual). */
export function SubNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  const current = items.slice().reverse().find((i) => pathname.startsWith(i.href))?.href;
  return (
    <nav aria-label="Personalização" className="inline-flex p-1 bg-sand rounded-[var(--radius-sm)] mb-8 max-w-full overflow-x-auto">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.href === current ? "page" : undefined}
          className={cx(
            "px-4 min-h-10 flex items-center text-sm whitespace-nowrap rounded-[calc(var(--radius-sm)-2px)]",
            i.href === current ? "bg-surface text-ink shadow-sm" : "text-ink-mute hover:text-ink",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
