import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetRequestForm } from "@/components/auth/forms";

export const metadata = { title: "Recuperar acesso" };

export default function ResetPage() {
  return (
    <AuthCard title="Recuperar acesso" description="Enviaremos um link para você criar uma nova senha." footer={<Link href="/entrar" className="underline underline-offset-4">Voltar para entrar</Link>}>
      <ResetRequestForm />
    </AuthCard>
  );
}
