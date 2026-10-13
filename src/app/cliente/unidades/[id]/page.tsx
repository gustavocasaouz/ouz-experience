import { notFound } from "next/navigation";
import { Badge, DataList, PageHeader } from "@/design-system";
import { listMyUnits } from "@/server/queries/client";
import { CLIENT_RELATION_LABELS, STAGE_LABELS } from "@/lib/labels";

export default async function ClientUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Busca entre as unidades do próprio cliente: um ID de outra unidade simplesmente não existe aqui.
  const u = (await listMyUnits()).find((x) => x.unit.id === id);
  if (!u) notFound();
  return (
    <>
      <PageHeader
        eyebrow={u.development.name}
        title={`Unidade ${u.unit.code}`}
        description={<Badge tone="accent">{STAGE_LABELS[u.development.stage]}</Badge>}
      />
      <DataList
        items={[
          { label: "Empreendimento", value: u.development.name },
          { label: "Vínculo", value: CLIENT_RELATION_LABELS[u.relation] ?? u.relation },
          { label: "Torre", value: u.unit.tower ?? "—" },
          { label: "Andar", value: u.unit.floor ?? "—" },
          { label: "Tipologia", value: u.unit.typology ?? "—" },
          { label: "Área privativa", value: u.unit.private_area_m2 ? `${Number(u.unit.private_area_m2).toLocaleString("pt-BR")} m²` : "—" },
        ]}
      />
      <p className="mt-10 text-sm text-ink-mute">
        Acompanhamento da obra, documentos, financeiro e chamados serão disponibilizados nesta área nas próximas etapas.
      </p>
    </>
  );
}
