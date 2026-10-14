import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DataList, EmptyState, SectionTitle } from "@/design-system";
import { myUnit, developmentFeed } from "@/server/queries/client-unit";
import { formatDate, formatLongDate } from "@/lib/format";
import { MILESTONE_STAGE_LABELS } from "@/lib/labels";

export default async function ClientUnitOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await myUnit(id);
  if (!u) notFound();
  const feed = await developmentFeed(u.development.id, id);
  const latest = feed.progress[0];
  const next = feed.milestones.find((m) => !m.completed_on);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-10">
        <section className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <p className="eyebrow mb-2">Evolução física</p>
            {latest ? (
              <>
                <p className="font-display text-5xl">{Number(latest.overall_percent).toLocaleString("pt-BR")}%</p>
                <div className="h-2 bg-sand mt-3" role="progressbar" aria-valuenow={Number(latest.overall_percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Evolução física">
                  <div className="h-2 bg-ink" style={{ width: `${Number(latest.overall_percent)}%` }} />
                </div>
                <p className="text-xs text-ink-mute mt-2">Informada pela OUZ em {formatDate(latest.reference_date + "T12:00:00Z")}</p>
              </>
            ) : (
              <p className="text-sm text-ink-soft">A OUZ ainda não publicou a evolução física.</p>
            )}
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-2">Próxima etapa</p>
            {next ? (
              <>
                <p className="font-display text-2xl">{next.title}</p>
                <p className="text-sm text-ink-soft mt-1">
                  {MILESTONE_STAGE_LABELS[next.stage]} · previsão {next.forecast_date ? formatDate(next.forecast_date + "T12:00:00Z") : "a definir"}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-soft">Linha do tempo ainda não publicada.</p>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle title="Comunicados" />
          {feed.announcements.length === 0 ? (
            <EmptyState title="Nenhum comunicado" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {feed.announcements.slice(0, 5).map((a) => (
                <li key={a.id} className="py-4">
                  <p className="text-xs text-ink-mute">{formatLongDate(a.published_at)}</p>
                  <h3 className="font-medium">{a.title}</h3>
                  <p className="text-sm text-ink-soft whitespace-pre-line mt-1">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-end justify-between mb-6">
            <SectionTitle title="Últimas atualizações" className="!mb-0" />
            <Link href={`/cliente/unidades/${id}/acompanhamento`} className="text-sm underline underline-offset-4">Ver acompanhamento</Link>
          </div>
          {feed.updates.length === 0 ? (
            <EmptyState title="Sem atualizações publicadas" />
          ) : (
            <ul className="flex flex-col gap-4">
              {feed.updates.slice(0, 3).map((up) => (
                <li key={up.id} className="border-l-2 border-accent pl-4">
                  <p className="text-xs text-ink-mute">{formatLongDate(up.published_at)}</p>
                  <p className="font-medium">{up.title}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside>
        <Card className="p-6">
          <p className="eyebrow mb-4">Dados da unidade</p>
          <DataList
            items={[
              { label: "Torre", value: u.unit.tower ?? "—" },
              { label: "Andar", value: u.unit.floor ?? "—" },
              { label: "Tipologia", value: u.unit.typology ?? "—" },
              { label: "Área privativa", value: u.unit.private_area_m2 ? `${Number(u.unit.private_area_m2).toLocaleString("pt-BR")} m²` : "—" },
              { label: "Vagas", value: u.unit.parking?.replace(/^Vagas\s*/i, "") ?? "—" },
            ]}
          />
          <div className="mt-6 flex flex-col gap-2 text-sm">
            <Link className="underline underline-offset-4" href="/cliente/chamados/novo">Abrir um chamado</Link>
            <Link className="underline underline-offset-4" href={`/cliente/unidades/${id}/documentos`}>Meus documentos</Link>
            <Link className="underline underline-offset-4" href={`/cliente/unidades/${id}/financeiro`}>Meu financeiro</Link>
          </div>
        </Card>
      </aside>
    </div>
  );
}
