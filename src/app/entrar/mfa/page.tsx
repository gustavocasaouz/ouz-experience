import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaChallenge, MfaEnroll } from "@/components/auth/mfa";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { requireViewer } from "@/server/auth/viewer";
import { safeNext } from "@/lib/safe-next";
import { switchAccount } from "@/server/actions/auth";

export const metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "/admin");
  const viewer = await requireViewer(`/entrar/mfa?next=${encodeURIComponent(next)}`);
  if (viewer.aal === "aal2") redirect(next);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp?.find((f) => f.status === "verified");

  return (
    <AuthCard
      eyebrow={viewer.staff ? "Obrigatório para a equipe OUZ" : "Segurança"}
      title="Verificação em duas etapas"
      description={
        <>
          {verified ? "Digite o código do seu aplicativo autenticador." : "Proteja sua conta com um segundo fator."}
          <span className="block mt-2 text-ink-mute">Conta: <strong className="text-ink font-medium">{viewer.email}</strong></span>
        </>
      }
      footer={
        <form action={switchAccount}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="underline underline-offset-4 min-h-11">Não é você? Entrar com outra conta</button>
        </form>
      }
    >
      {verified ? <MfaChallenge factorId={verified.id} next={next} /> : <MfaEnroll next={next} />}
    </AuthCard>
  );
}
