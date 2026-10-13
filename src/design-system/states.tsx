import type { ReactNode } from "react";
import { cx } from "./cx";

function StateBox({
  icon,
  title,
  children,
  action,
  tone = "neutral",
  role,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "danger" | "success";
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role}
      className={cx(
        "flex flex-col items-center text-center gap-3 px-6 py-14 border border-dashed rounded-[var(--radius-md)]",
        tone === "danger" ? "border-danger/40 bg-danger-soft/40" : tone === "success" ? "border-success/40 bg-success-soft/40" : "border-line bg-surface/60",
      )}
    >
      <div className="text-ink-mute" aria-hidden>
        {icon}
      </div>
      <h2 className="font-display text-xl">{title}</h2>
      {children && <div className="max-w-md text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <StateBox icon={<Icon d="M4 7h16M4 12h16M4 17h10" />} {...props} />;
}

export function ErrorState({ title = "Algo não saiu como esperado", children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <StateBox role="alert" tone="danger" icon={<Icon d="M12 8v5m0 3h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />} title={title} action={action}>
      {children ?? "Tente novamente em instantes. Se o problema continuar, fale com a OUZ."}
    </StateBox>
  );
}

export function RestrictedState({
  title = "Acesso restrito",
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <StateBox icon={<Icon d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />} title={title} action={action}>
      {children ?? "Seu perfil não tem autorização para ver este conteúdo."}
    </StateBox>
  );
}

export function SuccessState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <StateBox role="status" tone="success" icon={<Icon d="m5 12 4 4 10-10" />} title={title} action={action}>{children}</StateBox>;
}

export function LoadingState({ label = "Carregando", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-6">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-sand" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

/** Mensagem de retorno de formulário (sucesso ou erro), anunciada a leitores de tela. */
export function FormMessage({ state }: { state?: { ok?: boolean; error?: string; message?: string } | null }) {
  if (!state || (!state.error && !state.message)) return null;
  const isError = Boolean(state.error);
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cx(
        "text-sm px-4 py-3 rounded-[var(--radius-sm)] border",
        isError ? "bg-danger-soft border-danger/30 text-danger" : "bg-success-soft border-success/30 text-success",
      )}
    >
      {state.error ?? state.message}
    </p>
  );
}
