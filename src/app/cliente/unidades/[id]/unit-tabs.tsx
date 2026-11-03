"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/admin/tabs";
import type { ClientTab, DevelopmentStage } from "@/lib/labels";

/**
 * Abas escolhidas por empreendimento (Empreendimentos › Geral no admin). Os nomes acompanham a fase:
 * - entregue: "Histórico da obra" e "Entrega e garantia";
 * - "Manual" aparece só quando a OUZ publica o manual do empreendimento ou da unidade.
 */
export function UnitTabs({ base, stage, tabs, hasManual }: { base: string; stage: DevelopmentStage; tabs: ClientTab[]; hasManual: boolean }) {
  const pathname = usePathname();
  const on = (t: ClientTab) => tabs.includes(t);
  const items = [
    { key: "", label: "Visão geral" },
    ...(on("acompanhamento") ? [{ key: "/acompanhamento", label: stage === "entregue" ? "Histórico da obra" : "Acompanhamento" }] : []),
    ...(on("documentos") ? [{ key: "/documentos", label: "Documentos" }] : []),
    ...(on("financeiro") ? [{ key: "/financeiro", label: "Financeiro" }] : []),
    ...(on("personalizacao") ? [{ key: "/personalizacao", label: "Personalização" }] : []),
    ...(on("entrega") ? [{ key: "/entrega", label: stage === "entregue" ? "Entrega e garantia" : "Vistoria e entrega" }] : []),
    ...(on("manual") && hasManual ? [{ key: "/manual", label: "Manual do proprietário" }] : []),
  ];
  const current = items.slice().reverse().find((t) => pathname.startsWith(base + t.key))?.key ?? "";
  return <Tabs current={current} items={items.map((t) => ({ key: t.key, href: base + t.key, label: t.label }))} />;
}
