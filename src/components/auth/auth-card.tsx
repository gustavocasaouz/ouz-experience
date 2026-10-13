import type { ReactNode } from "react";

export function AuthCard({ eyebrow, title, description, children, footer }: { eyebrow?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-surface border border-line p-6 sm:p-10">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="font-display text-3xl mb-2">{title}</h1>
      {description && <div className="text-sm text-ink-soft mb-6">{description}</div>}
      {children}
      {footer && <div className="mt-8 pt-6 border-t border-line text-sm text-ink-soft flex flex-col gap-2">{footer}</div>}
    </div>
  );
}
