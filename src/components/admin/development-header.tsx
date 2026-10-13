import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/design-system";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { ACCESS_MODE_LABELS, STAGE_LABELS, type BrokerAccessMode, type DevelopmentStage } from "@/lib/labels";
import { Tabs } from "./tabs";

export async function loadDevelopment(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("developments").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data as {
    id: string; slug: string; name: string; city: string; stage: DevelopmentStage; is_published: boolean;
    broker_access_mode: BrokerAccessMode; sort_order: number; is_demo: boolean; data_source: string;
  };
}

export function DevelopmentHeader({ dev, tab }: { dev: Awaited<ReturnType<typeof loadDevelopment>>; tab: string }) {
  const b = `/admin/empreendimentos/${dev.id}`;
  return (
    <>
      <PageHeader
        eyebrow="Empreendimento"
        title={dev.name}
        description={
          <span className="flex flex-wrap gap-2">
            <Badge tone="accent">{STAGE_LABELS[dev.stage]}</Badge>
            <Badge tone={dev.is_published ? "success" : "neutral"}>{dev.is_published ? "Publicado no site" : "Não publicado"}</Badge>
            <Badge>Corretores: {ACCESS_MODE_LABELS[dev.broker_access_mode].label}</Badge>
            {dev.is_demo && <Badge tone="warning">Demonstrativo</Badge>}
          </span>
        }
      />
      <Tabs
        current={tab}
        items={[
          { key: "geral", href: b, label: "Geral e site" },
          { key: "restrito", href: `${b}/restrito`, label: "Conteúdo para corretores" },
          { key: "acesso", href: `${b}/acesso`, label: "Acesso de corretores" },
          { key: "unidades", href: `${b}/unidades`, label: "Unidades" },
          { key: "comercial", href: `${b}/comercial`, label: "Comercial" },
          { key: "acompanhamento", href: `${b}/acompanhamento`, label: "Acompanhamento" },
        ]}
      />
    </>
  );
}
