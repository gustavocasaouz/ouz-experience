"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { buttonClass, EmptyState, FormMessage } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { acceptInvitation } from "@/server/actions/invitations";
import type { ActionState } from "@/server/actions/types";

type Invite = { kind: "equipe" | "cliente"; token: string };
const KEY = "ouz_convite";

function readInvite(): Invite | null {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const kind = hash.get("tipo");
    const token = hash.get("token");
    if ((kind === "equipe" || kind === "cliente") && token) {
      const inv = { kind, token } as Invite;
      localStorage.setItem(KEY, JSON.stringify(inv));
      history.replaceState(null, "", window.location.pathname);
      return inv;
    }
    const stored = localStorage.getItem(KEY);
    return stored ? (JSON.parse(stored) as Invite) : null;
  } catch {
    return null;
  }
}

export function InviteAcceptor({ signedInAs }: { signedInAs: string | null }) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [state, action] = useActionState<ActionState, FormData>(acceptInvitation, {});
  // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do fragmento da URL após montar
  useEffect(() => setInvite(readInvite()), []);

  if (invite === undefined) return null;
  if (!invite)
    return (
      <EmptyState title="Nenhum convite encontrado">
        Abra novamente o link recebido por e-mail. Se ele expirou, peça um novo convite à OUZ.
      </EmptyState>
    );

  const what = invite.kind === "equipe" ? "a equipe do OUZ Experience" : "sua área de cliente OUZ";
  if (!signedInAs)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">Você recebeu um convite para {what}. Entre ou crie sua conta usando o <strong>mesmo e-mail</strong> que recebeu o convite.</p>
        <Link href="/entrar?next=/entrar/convite" className={buttonClass("primary", "lg")}>Já tenho conta — entrar</Link>
        <Link href="/entrar/cadastro?next=/entrar/convite" className={buttonClass("secondary", "lg")}>Criar conta</Link>
      </div>
    );

  return (
    <form
      action={(fd) => {
        try { localStorage.removeItem(KEY); } catch {}
        return action(fd);
      }}
      className="flex flex-col gap-5"
    >
      <FormMessage state={state} />
      <p className="text-ink-soft">
        Aceitar o convite para {what} com a conta <strong>{signedInAs}</strong>?
      </p>
      <input type="hidden" name="kind" value={invite.kind} />
      <input type="hidden" name="token" value={invite.token} />
      <SubmitButton size="lg" pendingLabel="Confirmando…">Aceitar convite</SubmitButton>
      {invite.kind === "equipe" && <p className="text-xs text-ink-mute">Em seguida será necessário configurar a verificação em duas etapas.</p>}
    </form>
  );
}
