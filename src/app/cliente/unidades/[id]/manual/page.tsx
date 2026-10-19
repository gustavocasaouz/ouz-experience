import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { listManuals } from "@/server/queries/manual";

/** Abre o manual do proprietário; se ainda não houver, o do condomínio. */
export default async function ManualEntry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const manuals = await listManuals(u.development.id, u.unit.id);
  const first = manuals.find((m) => m.kind === "proprietario") ?? manuals[0];
  if (first) redirect(`/cliente/unidades/${id}/manual/${first.kind}`);
  return (
    <EmptyState title="Manual ainda não publicado">
      O manual de uso, operação e manutenção aparece aqui quando a OUZ o publicar, junto com os prazos de garantia de cada sistema.
    </EmptyState>
  );
}
