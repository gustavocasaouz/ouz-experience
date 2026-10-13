import { notFound } from "next/navigation";
import { Badge, Card, DataList, PageHeader, SectionTitle, SelectField, TextArea } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { setBrokerStatus } from "@/server/actions/admin/brokers";
import { BROKER_STATUS_LABELS, type BrokerStatus } from "@/server/auth/permissions";
import { formatCnpj, formatCpf, maskDocument } from "@/domain/documentos";
import { formatDateTime } from "@/lib/format";

const ACTIONS: Record<BrokerStatus, Array<{ value: string; label: string }>> = {
  pendente: [
    { value: "aprovado", label: "Aprovar" },
    { value: "ajustes_solicitados", label: "Solicitar ajustes" },
    { value: "recusado", label: "Recusar" },
  ],
  ajustes_solicitados: [{ value: "recusado", label: "Recusar" }],
  aprovado: [
    { value: "suspenso", label: "Suspender" },
    { value: "revogado", label: "Revogar" },
  ],
  suspenso: [
    { value: "aprovado", label: "Reativar" },
    { value: "revogado", label: "Revogar" },
  ],
  recusado: [],
  revogado: [],
};

export default async function BrokerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { denied } = await staffWith(["corretores"], "/admin/corretores");
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: b }, { data: history }, { data: docs }, { data: groups }] = await Promise.all([
    supabase.from("broker_profiles").select("*").eq("user_id", id).maybeSingle(),
    supabase.from("broker_status_history").select("from_status, to_status, reason, changed_at, changed_by").eq("broker_user_id", id).order("changed_at", { ascending: false }),
    supabase.from("broker_documents").select("id, label, storage_path, mime_type, size_bytes, uploaded_at").eq("broker_user_id", id).order("uploaded_at"),
    supabase.from("broker_group_members").select("group:broker_groups(name)").eq("broker_user_id", id),
  ]);
  if (!b) notFound();
  const addr = (b.address ?? null) as Record<string, string> | null;
  const status = b.status as BrokerStatus;

  return (
    <>
      <PageHeader eyebrow="Corretor" title={b.full_name} description={<Badge tone={status === "aprovado" ? "success" : "warning"}>{BROKER_STATUS_LABELS[status]}</Badge>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-12">
          <section>
            <SectionTitle title="Cadastro" />
            <DataList
              items={[
                {
                  label: "CPF",
                  value: (
                    <details>
                      <summary className="cursor-pointer">{maskDocument(b.cpf)}</summary>
                      <span className="text-sm">{formatCpf(b.cpf)}</span>
                    </details>
                  ),
                },
                { label: "CRECI", value: `${b.creci_number} / ${b.creci_uf}` },
                { label: "E-mail", value: b.email },
                { label: "Telefone", value: b.phone },
                { label: "Cidade", value: `${b.city} · ${b.region} · ${b.country}` },
                { label: "Endereço", value: addr ? [addr.street, addr.number, addr.complement, addr.district, addr.postal_code].filter(Boolean).join(", ") : "Não informado" },
                { label: "Imobiliária", value: b.agency_name ?? "—" },
                { label: "CNPJ da imobiliária", value: b.agency_cnpj ? formatCnpj(b.agency_cnpj) : "—" },
                { label: "Aceite de termos", value: `${formatDateTime(b.terms_accepted_at)} (termos ${b.terms_version}, privacidade ${b.privacy_version})` },
                { label: "Grupos", value: groups?.length ? groups.map((g) => (g.group as unknown as { name: string }).name).join(", ") : "—" },
              ]}
            />
            <p className="text-xs text-ink-mute mt-4">
              CPF e CNPJ foram validados apenas quanto aos dígitos verificadores. Identidade e regularidade no CRECI devem ser conferidas na análise.
            </p>
          </section>
          <section>
            <SectionTitle title="Documentos enviados" />
            {docs?.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {docs.map((d) => (
                  <li key={d.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                    <span>
                      {d.label} <span className="text-ink-mute">· {formatDateTime(d.uploaded_at)}</span>
                    </span>
                    <a className="underline underline-offset-4" target="_blank" rel="noopener" href={`/arquivos/broker-documents/${d.storage_path}`}>
                      Abrir
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-mute">Nenhum documento enviado.</p>
            )}
          </section>
          <section>
            <SectionTitle title="Histórico" />
            <ol className="border-l border-line pl-5 flex flex-col gap-4">
              {(history ?? []).map((h, i) => (
                <li key={i} className="text-sm">
                  <p className="text-ink-mute text-xs">{formatDateTime(h.changed_at)}</p>
                  <p>
                    {h.from_status ? `${BROKER_STATUS_LABELS[h.from_status as BrokerStatus]} → ` : ""}
                    <strong>{BROKER_STATUS_LABELS[h.to_status as BrokerStatus]}</strong>
                  </p>
                  {h.reason && <p className="text-ink-soft">{h.reason}</p>}
                </li>
              ))}
              <li className="text-sm">
                <p className="text-ink-mute text-xs">{formatDateTime(b.created_at)}</p>
                <p>Cadastro recebido</p>
              </li>
            </ol>
          </section>
        </div>
        <aside>
          <Card className="p-6 xl:sticky xl:top-6">
            <h2 className="font-display text-xl mb-4">Decisão</h2>
            {ACTIONS[status].length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhuma ação disponível neste status.</p>
            ) : (
              <form action={setBrokerStatus} className="flex flex-col gap-4">
                <input type="hidden" name="user_id" value={b.user_id} />
                <SelectField label="Ação" name="status" required options={ACTIONS[status]} placeholder="Selecione" />
                <TextArea label="Motivo" name="reason" hint="Obrigatório, exceto para aprovação. Em ajustes, o corretor verá este texto." rows={3} />
                <SubmitButton>Confirmar</SubmitButton>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
