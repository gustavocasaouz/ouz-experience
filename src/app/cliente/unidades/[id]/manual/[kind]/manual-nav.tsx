"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cx } from "@/design-system/cx";
import { Icon } from "../icons";

export type NavItem = { href: string; label: string; icon: string; match?: string[] };

/** Menu do manual: lateral fixa em telas largas; nas demais, recolhível acima do conteúdo. */
export function ManualNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (details.current) details.current.open = false; // fecha o índice ao navegar no celular
  }, [pathname]);
  const isOn = (i: NavItem) => pathname === i.href || (i.match ?? []).some((m) => pathname === m || pathname.startsWith(m + "/") || pathname.startsWith(m + "."));
  const active = items.find(isOn);

  const list = (
    <>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i === active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 px-3 min-h-11 rounded-[var(--radius-sm)] text-[15px]",
                i === active ? "bg-ink text-paper" : "text-ink-soft hover:bg-sand hover:text-ink",
              )}
            >
              <Icon name={i.icon} className="size-[18px]" />
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <>
      <details ref={details} className="2xl:hidden mb-6 border border-line rounded-[var(--radius-md)] bg-surface group">
        <summary className="flex items-center justify-between gap-3 px-4 min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3">
            <Icon name={active?.icon ?? "book"} className="size-[18px]" />
            <span className="font-medium">{active?.label ?? "Menu do manual"}</span>
          </span>
          <span className="text-sm text-ink-mute group-open:hidden">Menu</span>
          <span className="text-sm text-ink-mute hidden group-open:inline">Fechar</span>
        </summary>
        <nav aria-label="Menu do manual" className="p-2 border-t border-line">{list}</nav>
      </details>
      <nav aria-label="Menu do manual" className="hidden 2xl:block sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2">
        {list}
      </nav>
    </>
  );
}
