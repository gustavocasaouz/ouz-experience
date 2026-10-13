"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckboxField, FormMessage, SelectField, SuccessState, TextArea, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { submitLead } from "@/server/actions/leads";
import type { ActionState } from "@/server/actions/types";

export function LeadForm({ developments, preselected }: { developments: Array<{ slug: string; name: string }>; preselected?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(submitLead, {});
  if (state.ok) return <SuccessState title="Obrigado!">{state.message}</SuccessState>;
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Nome completo" name="full_name" required autoComplete="name" defaultValue={v.full_name} error={e.full_name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="E-mail" name="email" type="email" required autoComplete="email" defaultValue={v.email} error={e.email} />
        <TextField label="Telefone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} />
      </div>
      <SelectField
        label="Empreendimento de interesse"
        name="development_slug"
        placeholder="Nenhum em específico"
        defaultValue={v.development_slug ?? preselected ?? ""}
        options={developments.map((d) => ({ value: d.slug, label: d.name }))}
      />
      <TextArea label="Mensagem" name="message" defaultValue={v.message} error={e.message} maxLength={2000} />
      <div className="hidden" aria-hidden>
        <label>
          Não preencha <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <CheckboxField name="is_broker" label="Sou corretor de imóveis" defaultChecked={v.is_broker === "on"} />
      <CheckboxField name="marketing_opt_in" label="Aceito receber comunicações da OUZ" defaultChecked={v.marketing_opt_in === "on"} />
      <CheckboxField
        name="privacy"
        required
        error={e.privacy}
        label={
          <>
            Li e aceito a{" "}
            <Link href="/privacidade" className="underline" target="_blank">
              política de privacidade
            </Link>
            .
          </>
        }
      />
      <SubmitButton size="lg" className="self-start">
        Enviar
      </SubmitButton>
    </form>
  );
}
