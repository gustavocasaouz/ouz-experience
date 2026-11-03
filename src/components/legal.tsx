import type { ReactNode } from "react";
import { PageHeader } from "@/design-system";
import { COMPANY, legalComplete } from "@/lib/company";
import { formatLongDate } from "@/lib/format";

/** Valor da empresa ou marcação visível de campo pendente. */
export function Fill({ value }: { value: string }) {
  return value.trim() ? <>{value}</> : <mark className="bg-warning-soft text-warning px-1">a preencher</mark>;
}

/** Estrutura comum da política de privacidade e dos termos de uso. */
export function LegalPage({ title, version, children }: { title: string; version: string; children: ReactNode }) {
  return (
    <div className="container-page py-14 max-w-3xl">
      <PageHeader
        eyebrow={`Versão ${version}`}
        title={title}
        description={COMPANY.legalUpdatedOn ? `Última atualização: ${formatLongDate(COMPANY.legalUpdatedOn + "T12:00:00Z")}` : undefined}
      />
      {!legalComplete && (
        <div className="bg-warning-soft text-warning p-4 text-sm mb-8">Texto em revisão pelo jurídico da OUZ. Os campos marcados ainda serão preenchidos.</div>
      )}
      <div className="flex flex-col gap-10 text-ink-soft leading-relaxed">{children}</div>
    </div>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`secao-${n}`}>
      <h2 id={`secao-${n}`} className="font-display text-2xl text-ink">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
