import { PageHeader } from "@/design-system";
import { publicEnv } from "@/lib/env";

export const metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <div className="container-page py-14 max-w-3xl">
      <PageHeader eyebrow={`Versão ${publicEnv.privacyVersion}`} title="Política de privacidade" />
      <div className="bg-warning-soft text-warning p-4 text-sm mb-8">Texto provisório. A versão oficial será fornecida pela OUZ e revisada pelo jurídico.</div>
      <div className="space-y-4 text-ink-soft leading-relaxed">
        <p>Esta página apresentará como a OUZ coleta, utiliza, armazena e protege dados pessoais no OUZ Experience, em conformidade com a LGPD.</p>
        <p>Itens previstos: controlador e encarregado; finalidades; bases legais; compartilhamento; prazos de retenção; direitos do titular e canal de atendimento.</p>
      </div>
    </div>
  );
}
