import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card, EmptyState, FormMessage, PageHeader, RestrictedState } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { DevelopmentCard } from "@/components/development-card";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { listBrokerDevelopments } from "@/server/queries/broker";
import { BROKER_STATUS_LABELS, type BrokerStatus } from "@/server/auth/permissions";
import { resubmitBrokerProfile } from "@/server/actions/broker";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Portal do corretor" };

const TONE: Record<BrokerStatus, "success" | "warning" | "danger" | "neutral"> = {
  aprovado: "success",
  pendente: "warning",
  ajustes_solicitados: "warning",
  recusado: "danger",
  suspenso: "danger",
  revogado: "danger",
};

export default async function BrokerHome({ searchParams }: { searchParams: Promise<{ salvo?: string; reenviado?: string }> }) {
  const viewer = await requireViewer("/corretor");
  if (!viewer.broker) redirect("/corretor/cadastro");
  const { salvo, reenviado } = await searchParams;
  const status = viewer.broker.status;

  const supabase = await createSupabaseServerClient();
  const { data: history } = await supabase
    .from("broker_status_history")
    .select("to_status, reason, changed_at")
    .eq("broker_user_id", viewer.userId)
    .order("changed_at", { ascending: false })
    .limit(5);
  const lastReason = history?.find((h) => h.to_status === status)?.reason;
  const developments = status === "aprovado" ? await listBrokerDevelopments() : [];

  return (
    <>
      <PageHeader eyebrow="Portal do corretor" title={`Olá, ${viewer.fullName.split(" ")[0] || "corretor"}`} />
      {salvo && <div className="mb-6"><FormMessage state={{ message: "Cadastro salvo." }} /></div>}
      {reenviado && <div className="mb-6"><FormMessage state={{ message: "Cadastro reenviado para análise." }} /></div>}

      <Card className="p-6 mb-10 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <p className="eyebrow">Status do cadastro</p>
          <Badge tone={TONE[status]}>{BROKER_STATUS_LABELS[status]}</Badge>
        </div>
        {status === "pendente" && <p className="text-sm text-ink-soft">Seu cadastro está em análise pela equipe da OUZ. Você será avisado por e-mail.</p>}
        {status === "ajustes_solicitados" && (
          <>
            <p className="text-sm text-ink-soft">A OUZ pediu ajustes:</p>
            {lastReason && <blockquote className="border-l-2 border-accent pl-4 text-sm">{lastReason}</blockquote>}
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/corretor/cadastro" variant="secondary">Editar cadastro</ButtonLink>
              <form action={resubmitBrokerProfile}>
                <SubmitButton>Reenviar para análise</SubmitButton>
              </form>
            </div>
          </>
        )}
        {(status === "recusado" || status === "suspenso" || status === "revogado") && (
          <p className="text-sm text-ink-soft">{lastReason ?? "Fale com a equipe da OUZ para mais informações."}</p>
        )}
        {history && history.length > 0 && (
          <details className="text-sm text-ink-mute">
            <summary className="cursor-pointer">Histórico</summary>
            <ul className="mt-2 space-y-1">
              {history.map((h, i) => (
                <li key={i}>
                  {formatDateTime(h.changed_at)} — {BROKER_STATUS_LABELS[h.to_status as BrokerStatus]}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {status === "aprovado" ? (
        developments.length === 0 ? (
          <EmptyState title="Nenhum empreendimento disponível">Quando a OUZ liberar empreendimentos para corretores, eles aparecerão aqui.</EmptyState>
        ) : (
          <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-3">
            {developments.map((d) => (
              <DevelopmentCard
                key={d.id}
                href={`/corretor/empreendimentos/${d.slug}`}
                name={d.name}
                stage={d.stage}
                extraBadge={d.full ? <Badge tone="success">Liberado</Badge> : <Badge>Em breve</Badge>}
              />
            ))}
          </div>
        )
      ) : (
        <RestrictedState title="Empreendimentos indisponíveis">Os materiais ficam disponíveis após a aprovação do cadastro.</RestrictedState>
      )}
    </>
  );
}
