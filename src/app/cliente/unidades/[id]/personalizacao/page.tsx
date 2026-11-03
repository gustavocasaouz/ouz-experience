import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/design-system";
import { Flash, type SP } from "@/components/admin/flash";
import { myUnit } from "@/server/queries/client-unit";
import { customizationCatalog } from "@/server/queries/customization";
import { CatalogForm } from "./catalog-form";

export default async function ClientCustomizationCatalog({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const u = await myUnit(id, "personalizacao");
  if (!u) notFound();
  const { items, selected } = await customizationCatalog(u.development.id, id);

  return (
    <>
      <Flash searchParams={searchParams} />
      {items.length === 0 ? (
        <EmptyState title="Catálogo em preparação">
          As opções de acabamento e os upgrades da sua unidade aparecem aqui. Enquanto isso, você pode enviar um{" "}
          <Link href={`/cliente/unidades/${id}/personalizacao/solicitacoes`} className="underline underline-offset-4">pedido à OUZ</Link>.
        </EmptyState>
      ) : (
        <CatalogForm unitId={id} items={items} selected={selected} />
      )}
    </>
  );
}
