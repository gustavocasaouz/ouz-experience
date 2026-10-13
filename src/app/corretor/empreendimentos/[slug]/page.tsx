import { notFound } from "next/navigation";
import { Badge, DataList, EmptyState, ImagePlaceholder, PageHeader, RestrictedState, SectionTitle, Table, Td } from "@/design-system";
import { requireViewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { publicMediaUrl } from "@/server/db/supabase-public";
import { SALES_MODE_LABELS, STAGE_LABELS, UNIT_STATUS_LABELS } from "@/lib/labels";
import { listUnitsWithPrices } from "@/server/queries/commercial";
import { formatBRL } from "@/lib/format";
import Link from "next/link";

const MATERIAL_LABELS: Record<string, string> = {
  apresentacao: "Apresentação",
  planta: "Planta",
  material_comercial: "Material comercial",
  tabela: "Tabela",
  comunicado: "Comunicado",
  outro: "Outro",
};

/**
 * Decide no SERVIDOR entre conteúdo completo e teaser. Para quem não tem acesso,
 * nenhuma consulta a tabelas restritas é feita — nada restrito chega ao navegador.
 */
export default async function BrokerDevelopmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const viewer = await requireViewer("/corretor");
  if (viewer.broker?.status !== "aprovado") return <RestrictedState>Disponível apenas para corretores aprovados.</RestrictedState>;

  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: dev } = await supabase.from("developments").select("id, name, stage").eq("slug", slug).maybeSingle();
  if (!dev) notFound();

  const { data: full } = await supabase.rpc("broker_can_access_development", { p_development_id: dev.id });

  if (full !== true) {
    const { data: teaser } = await supabase.from("development_teasers").select("title, message, image_path").eq("development_id", dev.id).maybeSingle();
    const img = publicMediaUrl(teaser?.image_path);
    return (
      <>
        <PageHeader eyebrow={dev.name} title={teaser?.title ?? "Em breve"} />
        <div className="grid gap-8 lg:grid-cols-2">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="w-full aspect-[4/3] object-cover" />
          ) : (
            <ImagePlaceholder label="Em breve" className="aspect-[4/3]" />
          )}
          <div className="flex flex-col gap-4">
            <Badge className="self-start">Em breve</Badge>
            <p className="text-ink-soft">{teaser?.message ?? "Informações comerciais serão disponibilizadas a corretores autorizados."}</p>
          </div>
        </div>
      </>
    );
  }

  const [{ data: content }, units, { data: materials }, { data: settings }, { data: canPrice }] = await Promise.all([
    supabase.from("development_broker_content").select("presentation, highlights, payment_conditions, early_information").eq("development_id", dev.id).maybeSingle(),
    listUnitsWithPrices(dev.id),
    supabase.from("broker_materials").select("id, kind, title, storage_path").eq("development_id", dev.id).eq("is_published", true).order("created_at"),
    supabase.from("development_commercial_settings").select("sales_mode").eq("development_id", dev.id).maybeSingle(),
    supabase.rpc("broker_can_see_prices", { p_development_id: dev.id }),
  ]);
  const salesMode = (settings?.sales_mode ?? "fechado") as keyof typeof SALES_MODE_LABELS;
  const prices = canPrice === true;
  const highlights = (content?.highlights ?? []) as string[];

  return (
    <>
      <PageHeader eyebrow="Conteúdo para corretores autorizados" title={dev.name} description={<Badge tone="accent">{STAGE_LABELS[dev.stage as keyof typeof STAGE_LABELS]}</Badge>} />
      <div className="flex flex-col gap-14">
        <section>
          <SectionTitle title="Apresentação" />
          {content?.presentation ? <p className="whitespace-pre-line text-ink-soft max-w-3xl">{content.presentation}</p> : <EmptyState title="Apresentação em preparação" />}
          {highlights.length > 0 && (
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {highlights.map((h, i) => (
                <li key={i} className="border-l-2 border-accent pl-3">{h}</li>
              ))}
            </ul>
          )}
        </section>
        {(content?.payment_conditions || content?.early_information) && (
          <section>
            <SectionTitle title="Informações comerciais" />
            <DataList
              items={[
                { label: "Condições de pagamento", value: content?.payment_conditions ? <span className="whitespace-pre-line">{content.payment_conditions}</span> : "—" },
                { label: "Informações antecipadas", value: content?.early_information ? <span className="whitespace-pre-line">{content.early_information}</span> : "—" },
              ]}
            />
          </section>
        )}
        <section>
          <SectionTitle title="Materiais" />
          {materials?.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {materials.map((m) => (
                <li key={m.id} className="py-3 flex items-center justify-between gap-4">
                  <span>
                    <span className="eyebrow mr-3">{MATERIAL_LABELS[m.kind]}</span>
                    {m.title}
                  </span>
                  <a href={`/arquivos/broker-content/${m.storage_path}`} className="text-sm underline underline-offset-4 shrink-0" target="_blank" rel="noopener">
                    Abrir
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum material publicado" />
          )}
        </section>
        <section>
          <SectionTitle title="Unidades" />
          <p className="text-sm text-ink-mute mb-4">
            Vendas: {SALES_MODE_LABELS[salesMode]?.label ?? "—"}.{" "}
            {salesMode === "pre_lancamento" && !prices && (
              <>Preços liberados somente nas janelas do pré-lançamento. <Link className="underline" href="/corretor/pre-lancamento">Registrar interesse</Link>.</>
            )}
            {salesMode === "fechado" && "Este empreendimento não está recebendo propostas."}
          </p>
          {units.length ? (
            <Table head={["Unidade", "Torre/Andar", "Tipologia", "Área privativa", ...(prices ? ["Preço de tabela"] : []), "Situação", ""]} caption="Unidades do empreendimento">
              {units.map((u) => {
                const canPropose = prices && (u.status === "disponivel" || u.status === "reservada") && u.price !== null;
                return (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.code}</Td>
                    <Td>{[u.tower, u.floor].filter((v) => v !== null && v !== "").join(" / ") || "—"}</Td>
                    <Td>{u.typology ?? "—"}</Td>
                    <Td>{u.private_area_m2 ? `${Number(u.private_area_m2).toLocaleString("pt-BR")} m²` : "—"}</Td>
                    {prices && <Td className="whitespace-nowrap">{formatBRL(u.price)}</Td>}
                    <Td>{UNIT_STATUS_LABELS[u.status] ?? u.status}</Td>
                    <Td>
                      {canPropose && (
                        <Link href={`/corretor/propostas/nova?unidade=${u.id}`} className="text-sm underline underline-offset-4 whitespace-nowrap">
                          {u.status === "reservada" ? "Entrar na fila" : "Fazer proposta"}
                        </Link>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState title="Unidades ainda não cadastradas" />
          )}
        </section>
      </div>
    </>
  );
}
