"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, FormMessage, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { startTotpEnrollment, verifyTotp } from "@/server/actions/auth";
import type { ActionState } from "@/server/actions/types";

function CodeForm({ factorId, next }: { factorId: string; next: string }) {
  const [state, action] = useActionState<ActionState, FormData>(verifyTotp, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Código de 6 dígitos"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        error={state.fieldErrors?.code}
      />
      <SubmitButton size="lg" pendingLabel="Verificando…">Verificar</SubmitButton>
    </form>
  );
}

export function MfaChallenge({ factorId, next }: { factorId: string; next: string }) {
  return <CodeForm factorId={factorId} next={next} />;
}

export function MfaEnroll({ next }: { next: string }) {
  const [pending, start] = useTransition();
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enroll) {
    return (
      <div className="flex flex-col gap-4">
        {error && <FormMessage state={{ error }} />}
        <p className="text-sm text-ink-soft">
          Você vai precisar de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password ou similar).
        </p>
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await startTotpEnrollment();
              if (res.error) setError(res.error);
              else setEnroll(res.data as { factorId: string; qr: string; secret: string });
            })
          }
        >
          {pending ? "Preparando…" : "Configurar verificação em duas etapas"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ol className="text-sm text-ink-soft list-decimal pl-5 space-y-1">
        <li>Abra o aplicativo autenticador e leia o QR code.</li>
        <li>Digite o código de 6 dígitos exibido.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qr} alt="QR code para configurar o autenticador" className="size-48 self-center border border-line p-2 bg-white" />
      <details className="text-xs text-ink-mute">
        <summary className="cursor-pointer">Não consegue ler o QR code?</summary>
        <p className="mt-2">Digite esta chave no aplicativo:</p>
        <code className="block mt-1 break-all bg-sand p-2 text-ink">{enroll.secret}</code>
      </details>
      <CodeForm factorId={enroll.factorId} next={next} />
    </div>
  );
}
