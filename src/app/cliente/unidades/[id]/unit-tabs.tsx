"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/admin/tabs";
import type { DevelopmentStage } from "@/lib/labels";

/**
 * Abas conforme a fase do empreendimento:
 * - pré-lançamento/lançamento: sem vistoria e entrega (ainda não existe);
 * - pré-lançamento e entregue: sem personalização (cedo demais / obra concluída);
 * - entregue: "Entrega e garantia" (registro da entrega, pendências e assistência).
 */
export function UnitTabs({ base, stage }: { base: string; stage: DevelopmentStage }) {
  const pathname = usePathname();
  const early = stage === "pre_lancamento" || stage === "lancamento";
  const tabs = [
    { key: "", label: "Visão geral" },
    { key: "/acompanhamento", label: stage === "entregue" ? "Histórico da obra" : "Acompanhamento" },
    { key: "/documentos", label: "Documentos" },
    { key: "/financeiro", label: "Financeiro" },
    ...(stage === "pre_lancamento" || stage === "entregue" ? [] : [{ key: "/personalizacao", label: "Personalização" }]),
    ...(early ? [] : [{ key: "/entrega", label: stage === "entregue" ? "Entrega e garantia" : "Vistoria e entrega" }]),
  ];
  const current = tabs.slice().reverse().find((t) => pathname.startsWith(base + t.key))?.key ?? "";
  return <Tabs current={current} items={tabs.map((t) => ({ key: t.key, href: base + t.key, label: t.label }))} />;
}
