import Link from "next/link";
import { Wordmark } from "@/design-system";
import { EnvironmentBanner } from "@/components/environment-banner";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EnvironmentBanner />
      <header className="container-page flex h-16 items-center justify-between mt-[env(safe-area-inset-top)]">
        <Wordmark subtitle="Experience" />
        {/* Volta à escolha de acesso (cliente, corretor, equipe), nunca ao site institucional. */}
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          ← Voltar ao início
        </Link>
      </header>
      <main id="conteudo" className="flex-1 flex items-start md:items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </>
  );
}
