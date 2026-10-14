"use client";

import { Button } from "@/design-system";

export function RetryButton() {
  return <Button onClick={() => window.location.reload()}>Tentar novamente</Button>;
}
