"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

export function SubmitButton({
  children,
  pendingLabel = "Enviando…",
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
