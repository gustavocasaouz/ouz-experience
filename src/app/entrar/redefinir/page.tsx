import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/forms";
import { requireViewer } from "@/server/auth/viewer";

export const metadata = { title: "Nova senha" };

export default async function NewPasswordPage() {
  await requireViewer("/entrar/recuperar");
  return (
    <AuthCard title="Defina uma nova senha">
      <NewPasswordForm />
    </AuthCard>
  );
}
