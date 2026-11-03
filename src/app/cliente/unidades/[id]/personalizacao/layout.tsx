import { notFound } from "next/navigation";
import { myUnit } from "@/server/queries/client-unit";
import { SubNav } from "./sub-nav";

export default async function CustomizationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await myUnit(id, "personalizacao"))) notFound();
  const base = `/cliente/unidades/${id}/personalizacao`;
  return (
    <>
      <SubNav
        items={[
          { href: base, label: "Escolhas e upgrades" },
          { href: `${base}/solicitacoes`, label: "Solicitações" },
        ]}
      />
      {children}
    </>
  );
}
