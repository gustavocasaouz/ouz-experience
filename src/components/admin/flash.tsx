import { FormMessage } from "@/design-system";

export async function Flash({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  if (!ok && !erro) return null;
  return (
    <div className="mb-6">
      <FormMessage state={erro ? { error: erro } : { message: ok }} />
    </div>
  );
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
