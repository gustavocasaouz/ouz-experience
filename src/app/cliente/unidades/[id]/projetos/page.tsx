import { notFound } from "next/navigation";
import { EmptyState, SectionTitle } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { PROJECT_DISCIPLINE_LABELS } from "@/lib/labels";
import { DocumentRows, unitDocuments } from "../documents";

export default async function ClientProjects({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id, "projetos");
  if (!u) notFound();
  const docs = await unitDocuments(id, u.development.id, ["projeto"]);
  const groups = Object.entries(PROJECT_DISCIPLINE_LABELS)
    .map(([k, label]) => ({ k, label, items: docs.filter((d) => d.discipline === k).sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { numeric: true })) }))
    .filter((g) => g.items.length);

  return groups.length === 0 ? (
    <EmptyState title="Projetos em preparação">
      Os projetos do empreendimento e da sua unidade (arquitetônico, estrutural, hidrossanitário, elétrico e demais especialidades) aparecem aqui quando a OUZ os publicar.
    </EmptyState>
  ) : (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft max-w-2xl">
          Projetos separados por especialidade. Antes de qualquer reforma ou furação, consulte os projetos: eles mostram onde passam estrutura, tubulações e
          instalações. Arquivos privados; os links de download expiram em poucos minutos.
        </p>
        <nav aria-label="Especialidades" className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <a key={g.k} href={`#${g.k}`} className="px-3 min-h-9 flex items-center text-sm bg-surface border border-line rounded-full hover:border-ink">
              {g.label} <span className="text-ink-mute ml-1.5 tabular-nums">{g.items.length}</span>
            </a>
          ))}
        </nav>
      </div>
      {groups.map((g) => (
        <section key={g.k} id={g.k} className="scroll-mt-24">
          <SectionTitle title={g.label} />
          <DocumentRows docs={g.items} />
        </section>
      ))}
    </div>
  );
}
