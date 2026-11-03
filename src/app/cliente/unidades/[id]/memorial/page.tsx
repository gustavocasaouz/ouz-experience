import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { DocumentRows, unitDocuments } from "../documents";

export default async function ClientSpecification({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id, "memorial");
  if (!u) notFound();
  const docs = await unitDocuments(id, u.development.id, ["memorial_descritivo"]);
  const customization = u.development.client_tabs.includes("personalizacao");

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <p className="text-ink-soft">
        O memorial descritivo detalha os materiais, acabamentos e equipamentos de cada ambiente e das áreas comuns, como contratado.
        {customization && (
          <>
            {" "}Para trocar algum acabamento da sua unidade, veja as opções em{" "}
            <Link href={`/cliente/unidades/${id}/personalizacao`} className="underline underline-offset-4">Personalização</Link>.
          </>
        )}
      </p>
      {docs.length === 0 ? (
        <EmptyState title="Memorial em preparação">O memorial descritivo aparece aqui quando a OUZ o publicar.</EmptyState>
      ) : (
        <DocumentRows docs={docs} />
      )}
    </div>
  );
}
