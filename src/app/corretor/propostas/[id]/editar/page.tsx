import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/design-system";
import { ProposalForm } from "@/components/commercial/proposal-form";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { formatCnpj, formatCpf } from "@/domain/documentos";

export default async function EditProposal({ params }: { params: Promise<{ id: string }> }) {
  await requireViewer("/corretor/propostas");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase
    .from("proposals")
    .select("id, status, unit_id, development_id, client_name, client_document, client_document_type, offered_price, payments, observations, prelaunch_registration_id, unit:units(code), development:developments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  if (p.status !== "rascunho") redirect(`/corretor/propostas/${id}`);
  const { data: prices } = await supabase.rpc("current_unit_prices", { p_development_id: p.development_id });
  const price = ((prices ?? []) as Array<{ unit_id: string; price: string }>).find((x) => x.unit_id === p.unit_id)?.price;
  const unitCode = (p.unit as unknown as { code: string }).code;
  const devName = (p.development as unknown as { name: string }).name;
  return (
    <>
      <PageHeader eyebrow={devName} title={`Editar proposta · unidade ${unitCode}`} />
      <div className="max-w-4xl">
        <ProposalForm
          tablePrice={price ? Number(price) : null}
          unitLabel={`${devName} ${unitCode}`}
          defaults={{
            id: p.id,
            unitId: p.unit_id,
            registrationId: p.prelaunch_registration_id,
            clientName: p.client_name ?? "",
            clientDocument: p.client_document ? (p.client_document_type === "cnpj" ? formatCnpj(p.client_document) : formatCpf(p.client_document)) : "",
            offered: p.offered_price ? Number(p.offered_price).toFixed(2).replace(".", ",") : "",
            observations: p.observations ?? "",
            payments: p.payments as Array<{ kind: string; amount: number; quantity: number; first_due: string; interval_months?: number }>,
          }}
        />
      </div>
    </>
  );
}
