import { PageHeader, RestrictedState, ButtonLink } from "@/design-system";
import { BrokerForm } from "@/components/broker/broker-form";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { formatCnpj, formatCpf } from "@/domain/documentos";
import { BROKER_STATUS_LABELS } from "@/server/auth/permissions";

export const metadata = { title: "Cadastro de corretor" };

export default async function BrokerSignupPage() {
  const viewer = await requireViewer("/corretor/cadastro");
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase.from("broker_profiles").select("*").eq("user_id", viewer.userId).maybeSingle();

  if (p && !["pendente", "ajustes_solicitados"].includes(p.status)) {
    return (
      <>
        <PageHeader eyebrow="Corretor" title="Meu cadastro" />
        <RestrictedState title={`Cadastro ${BROKER_STATUS_LABELS[p.status as keyof typeof BROKER_STATUS_LABELS].toLowerCase()}`} action={<ButtonLink href="/corretor" variant="secondary">Voltar</ButtonLink>}>
          Para alterar dados de um cadastro já analisado, fale com a equipe da OUZ.
        </RestrictedState>
      </>
    );
  }

  const addr = (p?.address ?? {}) as Record<string, string | undefined>;
  const defaults = p
    ? {
        full_name: p.full_name,
        cpf: formatCpf(p.cpf),
        creci_number: p.creci_number,
        creci_uf: p.creci_uf,
        phone: p.phone,
        city: p.city,
        region: p.region,
        country: p.country,
        agency_name: p.agency_name ?? "",
        agency_cnpj: p.agency_cnpj ? formatCnpj(p.agency_cnpj) : "",
        email: viewer.email,
        ...addr,
      }
    : { full_name: viewer.fullName, email: viewer.email, country: "Brasil" };

  return (
    <>
      <PageHeader
        eyebrow="Corretor"
        title={p ? "Meu cadastro" : "Cadastro de corretor"}
        description="Seu cadastro será analisado pela OUZ. A aprovação não libera automaticamente todos os empreendimentos."
      />
      {!viewer.emailVerified && (
        <p role="alert" className="mb-6 bg-warning-soft text-warning p-4 text-sm">Confirme seu e-mail pelo link que enviamos antes de enviar o cadastro.</p>
      )}
      <div className="max-w-3xl">
        <BrokerForm defaults={defaults} isNew={!p} />
      </div>
    </>
  );
}
