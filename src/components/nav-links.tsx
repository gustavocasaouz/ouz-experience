"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/design-system/cx";

export type NavItem = { href: string; label: string };

export function NavLinks({ items, root, vertical = false }: { items: NavItem[]; root: string; vertical?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === root ? pathname === root : pathname.startsWith(href));
  return (
    <ul className={cx("flex gap-1", vertical ? "flex-col" : "md:flex-col overflow-x-auto md:overflow-visible -mx-1 px-1 pb-1 md:pb-0")}>
      {items.map((i) => (
        <li key={i.href} className="shrink-0">
          <Link
            href={i.href}
            aria-current={isActive(i.href) ? "page" : undefined}
            className={cx(
              "block px-3 py-3 md:py-2 text-sm rounded-[var(--radius-sm)] whitespace-nowrap",
              isActive(i.href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-sand hover:text-ink",
            )}
          >
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
