"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckboxField, FormMessage, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { saveBrokerProfile } from "@/server/actions/broker";
import type { ActionState } from "@/server/actions/types";
import { UFS } from "@/domain/documentos";

export type BrokerFormDefaults = Partial<Record<string, string>>;

export function BrokerForm({ defaults, isNew }: { defaults: BrokerFormDefaults; isNew: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveBrokerProfile, {});
  const v = { ...defaults, ...(state.values ?? {}) };
  const e = state.fieldErrors ?? {};
  const uf = UFS.map((u) => ({ value: u, label: u }));
  return (
    <form action={action} className="flex flex-col gap-10" noValidate>
      <FormMessage state={state} />

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Dados pessoais</legend>
        <TextField label="Nome completo" name="full_name" required autoComplete="name" defaultValue={v.full_name} error={e.full_name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="CPF" name="cpf" required inputMode="numeric" autoComplete="off" defaultValue={v.cpf} error={e.cpf} placeholder="000.000.000-00" />
          <TextField label="Telefone" name="phone" type="tel" required autoComplete="tel" defaultValue={v.phone} error={e.phone} />
        </div>
        <TextField label="E-mail" name="email_display" value={v.email ?? ""} readOnly disabled hint="O e-mail é o da sua conta." required />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">CRECI</legend>
        <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
          <TextField label="Número do CRECI" name="creci_number" required defaultValue={v.creci_number} error={e.creci_number} />
          <SelectField label="UF" name="creci_uf" required options={uf} placeholder="UF" defaultValue={v.creci_uf} error={e.creci_uf} />
        </div>
        <p className="text-xs text-ink-mute">
          Validamos apenas o formato. A conferência de identidade e regularidade no CRECI é feita pela equipe da OUZ na análise.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Localização</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField label="Cidade" name="city" required defaultValue={v.city} error={e.city} autoComplete="address-level2" />
          <TextField label="Estado ou região" name="region" required defaultValue={v.region} error={e.region} autoComplete="address-level1" />
          <TextField label="País" name="country" required defaultValue={v.country ?? "Brasil"} error={e.country} autoComplete="country-name" />
        </div>
        <details className="border border-line p-4" open={Boolean(v.street)}>
          <summary className="cursor-pointer text-sm text-ink-soft">Endereço completo (opcional)</summary>
          <div className="grid gap-5 sm:grid-cols-2 mt-5">
            <TextField label="Logradouro" name="street" defaultValue={v.street} autoComplete="address-line1" />
            <TextField label="Número" name="number" defaultValue={v.number} />
            <TextField label="Complemento" name="complement" defaultValue={v.complement} autoComplete="address-line2" />
            <TextField label="Bairro" name="district" defaultValue={v.district} />
            <TextField label="CEP" name="postal_code" defaultValue={v.postal_code} autoComplete="postal-code" inputMode="numeric" />
          </div>
        </details>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Imobiliária</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Imobiliária" name="agency_name" defaultValue={v.agency_name} />
          <TextField label="CNPJ da imobiliária" name="agency_cnpj" defaultValue={v.agency_cnpj} error={e.agency_cnpj} hint="Aceita CNPJ numérico ou alfanumérico." />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="font-display text-2xl mb-4">Documentos para análise</legend>
        <TextField label="Descrição dos arquivos" name="document_label" placeholder="Ex.: carteira do CRECI" defaultValue={v.document_label} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="documents" className="text-sm font-medium">
            Arquivos <span className="text-ink-mute font-normal">(PDF, JPG ou PNG, até 10 MB cada, máximo 5)</span>
          </label>
          <input id="documents" name="documents" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="text-sm file:mr-4 file:border file:border-ink file:bg-transparent file:px-4 file:py-2 file:text-sm" />
        </div>
      </fieldset>

      <CheckboxField
        name="accept"
        required
        error={e.accept}
        label={
          <>
            Li e aceito as <Link href="/termos" target="_blank" className="underline">condições de uso</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="underline">política de privacidade</Link>, e autorizo a OUZ a analisar os dados e documentos enviados.
          </>
        }
      />
      <SubmitButton size="lg" className="self-start" pendingLabel="Enviando…">
        {isNew ? "Enviar cadastro para análise" : "Salvar alterações"}
      </SubmitButton>
    </form>
  );
}
