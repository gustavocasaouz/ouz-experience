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
  // Título conforme o acesso escolhido na página inicial.
  const area = target.startsWith("/admin") ? "equipe" : target.startsWith("/corretor") ? "corretor" : target.startsWith("/cliente") ? "cliente" : null;
  const copy = {
    cliente: { eyebrow: "Área do cliente", description: "Acompanhe sua unidade, a obra, documentos e o financeiro." },
    corretor: { eyebrow: "Portal do corretor", description: "Empreendimentos liberados, tabelas e propostas." },
    equipe: { eyebrow: "Equipe OUZ", description: "Acesso restrito à equipe, com verificação em duas etapas." },
  }[area ?? "cliente"];
  return (
    <AuthCard
      eyebrow={area ? copy.eyebrow : "OUZ Experience"}
      title="Entrar"
      description={area ? copy.description : "Clientes, corretores e equipe OUZ usam o mesmo acesso."}
      footer={
        <>
          <Link href="/entrar/recuperar" className="underline underline-offset-4">Esqueci minha senha</Link>
          {area === "cliente" && <span>Primeiro acesso? Use o link do convite enviado pela OUZ por e-mail.</span>}
          {area === "corretor" && (
            <span>Ainda não tem cadastro? <Link href={signupHref} className="underline underline-offset-4">Cadastre-se</Link></span>
          )}
          {area === null && (
            <span>Não tem conta? <Link href={signupHref} className="underline underline-offset-4">Criar conta</Link></span>
          )}
        </>
      }
    >
      {erro === "link" && <div className="mb-5"><FormMessage state={{ error: "Link inválido ou expirado. Solicite um novo." }} /></div>}
      <SignInForm next={target} />
    </AuthCard>
  );
}
