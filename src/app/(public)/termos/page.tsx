import { PageHeader } from "@/design-system";
import { publicEnv } from "@/lib/env";

export const metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <div className="container-page py-14 max-w-3xl">
      <PageHeader eyebrow={`Versão ${publicEnv.termsVersion}`} title="Termos de uso" />
      <div className="bg-warning-soft text-warning p-4 text-sm mb-8">Texto provisório. A versão oficial será fornecida pela OUZ e revisada pelo jurídico.</div>
      <div className="space-y-4 text-ink-soft leading-relaxed">
        <p>Esta página apresentará as condições de uso do OUZ Experience para visitantes, clientes e corretores.</p>
        <p>Informações publicadas não constituem oferta, reserva ou garantia de unidade, preço ou condição comercial.</p>
      </div>
    </div>
  );
}
