"use client";

import { Button, ErrorState } from "@/design-system";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="container-page py-16 max-w-xl">
      <ErrorState action={<Button variant="secondary" onClick={reset}>Tentar novamente</Button>} />
    </main>
  );
}
