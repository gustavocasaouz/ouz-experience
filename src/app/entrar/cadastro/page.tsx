import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Criar conta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthCard
      eyebrow="OUZ Experience"
      title="Criar conta"
      description={
        <>
          Clientes OUZ recebem um convite por e-mail para acessar sua unidade. Corretores criam a conta e, em seguida, preenchem o cadastro profissional.
        </>
      }
      footer={<span>Já tem conta? <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="underline underline-offset-4">Entrar</Link></span>}
    >
      <SignUpForm next={next} />
    </AuthCard>
  );
}
