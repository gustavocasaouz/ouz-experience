import { notFound } from "next/navigation";
import { EmptyState, SectionTitle } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/labels";
import { DocumentRows, unitDocuments } from "../documents";

export default async function ClientDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id, "documentos");
  if (!u) notFound();
  // Projetos e memorial têm aba própria quando ela está ligada no empreendimento.
  const own = { projeto: "projetos", memorial_descritivo: "memorial" } as const;
  const shown = Object.keys(DOCUMENT_CATEGORY_LABELS).filter((c) => !(c in own) || !u.development.client_tabs.includes(own[c as keyof typeof own]));
  const docs = await unitDocuments(id, u.development.id, shown);
  const byCat = shown.map((c) => ({ c, items: docs.filter((d) => d.category === c) })).filter((g) => g.items.length);

  return docs.length === 0 ? (
    <EmptyState title="Nenhum documento disponível">Contratos, aditivos, manuais e documentos da unidade aparecem aqui quando a OUZ os publicar.</EmptyState>
  ) : (
    <div className="flex flex-col gap-12">
      <p className="text-sm text-ink-soft">Arquivos privados. Os links de download expiram em poucos minutos.</p>
      {byCat.map((g) => (
        <section key={g.c}>
          <SectionTitle title={DOCUMENT_CATEGORY_LABELS[g.c] ?? g.c} />
          <DocumentRows docs={g.items} />
        </section>
      ))}
    </div>
  );
}
