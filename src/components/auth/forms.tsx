"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckboxField, FormMessage, SuccessState, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/server/actions/auth";
import type { ActionState } from "@/server/actions/types";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField label="E-mail" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <TextField label="Senha" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <SubmitButton size="lg" pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signUp, {});
  if (state.ok) return <SuccessState title="Confirme seu e-mail">{state.message}</SuccessState>;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField label="Nome completo" name="full_name" autoComplete="name" required defaultValue={state.values?.full_name} error={e.full_name} />
      <TextField label="E-mail" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={e.email} />
      <TextField label="Senha" name="password" type="password" autoComplete="new-password" required hint="Mínimo de 10 caracteres, com letras e números." error={e.password} />
      <TextField label="Confirme a senha" name="password_confirm" type="password" autoComplete="new-password" required error={e.password_confirm} />
      <CheckboxField
        name="terms"
        required
        error={e.terms}
        label={
          <>
            Li e aceito os <Link href="/termos" target="_blank" className="underline">termos de uso</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="underline">política de privacidade</Link>.
          </>
        }
      />
      <SubmitButton size="lg" pendingLabel="Criando…">Criar conta</SubmitButton>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState<ActionState, FormData>(requestPasswordReset, {});
  if (state.ok) return <SuccessState title="Verifique seu e-mail">{state.message}</SuccessState>;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField label="E-mail" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <SubmitButton size="lg">Enviar link</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePassword, {});
  if (state.ok)
    return (
      <SuccessState title="Senha atualizada" action={<Link href="/conta" className="underline">Ir para minha conta</Link>}>
        Use a nova senha nos próximos acessos.
      </SuccessState>
    );
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Nova senha" name="password" type="password" autoComplete="new-password" required hint="Mínimo de 10 caracteres, com letras e números." error={state.fieldErrors?.password} />
      <TextField label="Confirme a nova senha" name="password_confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.password_confirm} />
      <SubmitButton size="lg">Salvar senha</SubmitButton>
    </form>
  );
}
