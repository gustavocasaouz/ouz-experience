import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("bg-surface border border-line rounded-[var(--radius-md)]", className)} {...props} />;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-sand text-ink-soft",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft/60 text-ink",
};
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cx("inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-8 border-b border-line mb-8">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-3xl md:text-4xl leading-tight">{title}</h1>
        {description && <div className="mt-3 text-ink-soft">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ eyebrow, title, className }: { eyebrow?: string; title: string; className?: string }) {
  return (
    <div className={cx("mb-6", className)}>
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h2 className="font-display text-2xl md:text-3xl">{title}</h2>
    </div>
  );
}

export function DataList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      {items.map((i) => (
        <div key={i.label} className="border-b border-line pb-3">
          <dt className="eyebrow mb-1">{i.label}</dt>
          <dd className="text-[15px] break-words">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children, caption }: { head: string[]; children: ReactNode; caption?: string }) {
  return (
    // Região rolável acessível por teclado (WCAG): focável e nomeada.
    <div className="overflow-x-auto border border-line bg-surface rounded-[var(--radius-md)] focus-visible:outline-2" tabIndex={0} role="region" aria-label={caption ?? "Tabela"}>
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-sand/60 text-left">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium text-ink-soft whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("px-4 py-3 align-top", className)} {...props} />;
}

/** Espaço reservado neutro para fotografias até o acervo oficial da OUZ. */
export function ImagePlaceholder({ label = "Imagem a definir", className }: { label?: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cx("overflow-hidden bg-gradient-to-br from-sand via-accent-soft/50 to-line", className)}>
      <div className="relative h-full w-full flex items-end">
        <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.18]" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 100 L0 55 L22 55 L22 30 L48 30 L48 45 L70 45 L70 18 L100 18 L100 100 Z" fill="var(--color-ink)" />
        </svg>
        <span className="relative m-4 text-[11px] tracking-[0.2em] uppercase text-ink-soft/80">{label}</span>
      </div>
    </div>
  );
}
