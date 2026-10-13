import Link from "next/link";

/** Marca PROVISÓRIA (tipográfica). Substituir pelo logotipo oficial da OUZ. */
export function Wordmark({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-2 text-ink" aria-label="OUZ — página inicial">
      <span className="font-display text-2xl tracking-[0.35em] leading-none">OUZ</span>
      {subtitle && <span className="eyebrow hidden sm:inline">{subtitle}</span>}
    </Link>
  );
}
