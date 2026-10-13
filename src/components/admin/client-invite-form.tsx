"use client";

import { useActionState, useState } from "react";
import { Button, FormMessage } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { inviteClient } from "@/server/actions/admin/clients";
import type { ActionState } from "@/server/actions/types";

export function ClientInviteForm({ clientId, hasAccount }: { clientId: string; hasAccount: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteClient, {});
  const [copied, setCopied] = useState(false);
  const link = state.data?.link as string | undefined;
  if (hasAccount) return <p className="text-sm text-success">Conta ativada. O cliente já acessa a área do cliente.</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      {link && (
        <div className="bg-sand p-3 text-xs flex flex-col gap-2">
          <p>Link do convite (exibido só agora):</p>
          <code className="break-all bg-surface p-2">{link}</code>
          <Button size="sm" variant="secondary" className="self-start" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      )}
      <p className="text-sm text-ink-soft">O cliente precisa entrar ou criar a conta com o mesmo e-mail do cadastro. Um novo convite invalida o anterior.</p>
      <SubmitButton className="self-start">{link ? "Gerar novo convite" : "Enviar convite"}</SubmitButton>
    </form>
  );
}
