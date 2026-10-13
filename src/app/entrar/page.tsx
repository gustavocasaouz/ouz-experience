import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";
import { FormMessage } from "@/design-system";
import { getViewer } from "@/server/auth/viewer";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  const target = safeNext(next);
  if (await getViewer()) redirect(target);
  const signupHref = `/entrar/cadastro?next=${encodeURIComponent(target)}`;
  return (
    <AuthCard
      eyebrow="OUZ Experience"
      title="Entrar"
      description="Clientes, corretores e equipe OUZ usam o mesmo acesso."
      footer={
        <>
          <Link href="/entrar/recuperar" className="underline underline-offset-4">Esqueci minha senha</Link>
          <span>
            Não tem conta? <Link href={signupHref} className="underline underline-offset-4">Criar conta</Link>
          </span>
        </>
      }
    >
      {erro === "link" && <div className="mb-5"><FormMessage state={{ error: "Link inválido ou expirado. Solicite um novo." }} /></div>}
      <SignInForm next={target} />
    </AuthCard>
  );
}
