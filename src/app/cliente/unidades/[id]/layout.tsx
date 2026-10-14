import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/design-system";
import { listMyUnits } from "@/server/queries/client";
import { CLIENT_RELATION_LABELS, STAGE_LABELS } from "@/lib/labels";
import { UnitTabs } from "./unit-tabs";

export default async function UnitLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Busca entre as unidades do próprio cliente: um ID de outra unidade simplesmente não existe aqui.
  const u = (await listMyUnits()).find((x) => x.unit.id === id);
  if (!u) notFound();
  return (
    <>
      <PageHeader
        eyebrow={u.development.name}
        title={`Unidade ${u.unit.code}`}
        description={
          <span className="flex flex-wrap gap-2">
            <Badge tone="accent">{STAGE_LABELS[u.development.stage]}</Badge>
            <Badge>{CLIENT_RELATION_LABELS[u.relation] ?? u.relation}</Badge>
          </span>
        }
      />
      <UnitTabs base={`/cliente/unidades/${id}`} stage={u.development.stage} />
      {children}
    </>
  );
}
