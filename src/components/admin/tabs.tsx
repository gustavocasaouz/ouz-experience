import Link from "next/link";
import { cx } from "@/design-system/cx";

export function Tabs({ items, current }: { items: Array<{ href: string; label: string; key: string }>; current: string }) {
  return (
    <nav aria-label="Seções" className="flex gap-1 overflow-x-auto border-b border-line mb-8 -mt-2">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cx(
            "px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px",
            t.key === current ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
