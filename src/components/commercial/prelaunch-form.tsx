"use client";

import { useActionState, useState } from "react";
import { FormMessage, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { registerPrelaunch } from "@/server/actions/proposals";
import type { ActionState } from "@/server/actions/types";

export function PrelaunchForm({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(registerPrelaunch, {});
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setKey(crypto.randomUUID());
      }}
      className="flex flex-col gap-4"
    >
      <FormMessage state={state} />
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="idempotency_key" value={key} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome do cliente" name="client_name" id={`n-${campaignId}`} required />
        <TextField label="CPF ou CNPJ do cliente" name="client_document" id={`d-${campaignId}`} required />
      </div>
      <TextArea label="Preferências de unidade ou tipologia" name="preferences" id={`p-${campaignId}`} rows={2} maxLength={1000} />
      <SubmitButton className="self-start">Registrar interesse</SubmitButton>
    </form>
  );
}
