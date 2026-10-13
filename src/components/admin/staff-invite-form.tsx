"use client";

import { useActionState, useState } from "react";
import { Button, CheckboxField, FormMessage, SelectField, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { inviteStaff } from "@/server/actions/admin/staff";
import type { ActionState } from "@/server/actions/types";
import { PERMISSION_LABELS, STAFF_PERMISSIONS } from "@/server/auth/permissions";

export function StaffInviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteStaff, {});
  const [role, setRole] = useState("operador");
  const [copied, setCopied] = useState(false);
  const link = state.data?.link as string | undefined;
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      {link && (
        <div className="bg-sand p-4 text-sm flex flex-col gap-2">
          <p>O e-mail foi enfileirado. Se preferir, copie o link e envie por um canal seguro (ele não será exibido de novo):</p>
          <code className="break-all bg-surface p-2 text-xs">{link}</code>
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="E-mail" name="email" type="email" required />
        <SelectField
          label="Papel"
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[{ value: "operador", label: "Operador" }, ...(canInviteAdmin ? [{ value: "administrador", label: "Administrador (todas as permissões)" }] : [])]}
        />
      </div>
      {role === "operador" && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-sm font-medium mb-3">Permissões</legend>
          {STAFF_PERMISSIONS.map((p) => (
            <CheckboxField
              key={p}
              id={`inv-${p}`}
              name="permissions"
              value={p}
              label={
                <>
                  <span className="text-ink font-medium">{PERMISSION_LABELS[p].label}</span>
                  <span className="block text-xs">{PERMISSION_LABELS[p].description}</span>
                </>
              }
            />
          ))}
        </fieldset>
      )}
      <SubmitButton className="self-start">Enviar convite</SubmitButton>
    </form>
  );
}
