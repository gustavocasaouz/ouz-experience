import type { Metadata } from "next";
import { PageHeader } from "@/design-system";
import { LeadForm } from "@/components/lead-form";
import { listPublishedDevelopments } from "@/server/queries/public";

export const metadata: Metadata = { title: "Tenho interesse" };

export default async function InterestPage({ searchParams }: { searchParams: Promise<{ empreendimento?: string }> }) {
  const [{ empreendimento }, developments] = await Promise.all([searchParams, listPublishedDevelopments()]);
  return (
    <div className="container-page py-14 grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <PageHeader eyebrow="Contato" title="Tenho interesse" description="Conte o que procura e a equipe da OUZ entrará em contato." />
        <p className="text-sm text-ink-soft">
          O envio deste formulário não constitui proposta, reserva ou garantia de unidade, preço ou condição comercial.
        </p>
      </div>
      <div className="lg:col-span-7 bg-surface border border-line p-6 md:p-10">
        <LeadForm developments={developments.map((d) => ({ slug: d.slug, name: d.name }))} preselected={empreendimento} />
      </div>
    </div>
  );
}
