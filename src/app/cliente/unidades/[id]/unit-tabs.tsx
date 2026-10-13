"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/admin/tabs";

const TABS = [
  { key: "", label: "Visão geral" },
  { key: "/acompanhamento", label: "Acompanhamento" },
  { key: "/documentos", label: "Documentos" },
  { key: "/financeiro", label: "Financeiro" },
  { key: "/personalizacao", label: "Personalização" },
  { key: "/entrega", label: "Vistoria e entrega" },
];

export function UnitTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const current = TABS.slice().reverse().find((t) => pathname.startsWith(base + t.key))?.key ?? "";
  return <Tabs current={current} items={TABS.map((t) => ({ key: t.key, href: base + t.key, label: t.label }))} />;
}
