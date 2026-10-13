import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/design-system";
import { DevelopmentCard } from "@/components/development-card";
import { listPublishedDevelopments } from "@/server/queries/public";

export const metadata: Metadata = { title: "Empreendimentos" };

export default async function DevelopmentsPage() {
  const developments = await listPublishedDevelopments();
  return (
    <div className="container-page py-14">
      <PageHeader eyebrow="Florianópolis" title="Empreendimentos" description="Projetos publicados pela OUZ." />
      {developments.length === 0 ? (
        <EmptyState title="Nenhum empreendimento publicado">Volte em breve.</EmptyState>
      ) : (
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
          {developments.map((d) => (
            <DevelopmentCard
              key={d.id}
              href={`/empreendimentos/${d.slug}`}
              name={d.name}
              stage={d.stage}
              summary={d.content?.summary}
              coverPath={d.content?.cover_image_path}
              isDemo={d.is_demo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
