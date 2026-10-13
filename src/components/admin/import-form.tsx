"use client";

import { useActionState } from "react";
import { FormMessage } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { importInstallments } from "@/server/actions/admin/finance-import";
import type { ActionState } from "@/server/actions/types";

export function ImportForm() {
  const [state, action] = useActionState<ActionState, FormData>(importInstallments, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input name="file" type="file" required accept=".csv,text/csv,text/plain" className="text-sm" aria-label="Arquivo CSV" />
      <SubmitButton className="self-start" pendingLabel="Validando…">Validar e importar</SubmitButton>
    </form>
  );
}
