import { notFound } from "next/navigation";
import { PageHeader, RestrictedState } from "@/design-system";
import { ProposalForm } from "@/components/commercial/proposal-form";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export const metadata = { title: "Nova proposta" };

export default async function NewProposal({ searchParams }: { searchParams: Promise<{ unidade?: string; registro?: string }> }) {
  const viewer = await requireViewer("/corretor/propostas");
  if (viewer.broker?.status !== "aprovado") return <RestrictedState>Disponível apenas para corretores aprovados.</RestrictedState>;
  const { unidade, registro } = await searchParams;
  if (!unidade) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: unit } = await supabase.from("units").select("id, code, development_id, status, development:developments(name)").eq("id", unidade).maybeSingle();
  if (!unit) notFound();
  const [{ data: canPrice }, { data: prices }] = await Promise.all([
    supabase.rpc("broker_can_see_prices", { p_development_id: unit.development_id }),
    supabase.rpc("current_unit_prices", { p_development_id: unit.development_id }),
  ]);
  if (canPrice !== true) return <RestrictedState>Este empreendimento não está recebendo propostas para o seu perfil no momento.</RestrictedState>;
  const price = ((prices ?? []) as Array<{ unit_id: string; price: string }>).find((p) => p.unit_id === unit.id)?.price;
  let registration: { id: string; client_name: string; client_document: string } | null = null;
  if (registro) {
    const { data } = await supabase.from("prelaunch_registrations").select("id, client_name, client_document").eq("id", registro).maybeSingle();
    registration = data;
  }
  const devName = (unit.development as unknown as { name: string }).name;
  return (
    <>
      <PageHeader
        eyebrow={devName}
        title={`Proposta · unidade ${unit.code}`}
        description={unit.status === "reservada" ? "Esta unidade tem reserva ativa: sua proposta entrará na fila." : undefined}
      />
      <div className="max-w-4xl">
        <ProposalForm
          tablePrice={price ? Number(price) : null}
          unitLabel={`${devName} ${unit.code}`}
          defaults={{
            unitId: unit.id,
            registrationId: registration?.id ?? null,
            clientName: registration?.client_name,
            clientDocument: registration?.client_document,
          }}
        />
      </div>
    </>
  );
}
