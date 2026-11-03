"use client";

import { useState } from "react";
import { SelectField } from "@/design-system";

export type TicketUnitOption = {
  id: string;
  label: string;
  categories: Array<{ value: string; label: string }>;
  /** Itens da tabela de garantias do manual ainda vigentes. Vazio: o manual não tem a tabela (assistência sem item). */
  warranty: Array<{ value: string; label: string }>;
  hasWarrantyTable: boolean;
};

/** Unidade → categorias liberadas no empreendimento → (assistência técnica) item em garantia. */
export function TicketFields({ units, defaultUnit }: { units: TicketUnitOption[]; defaultUnit?: string }) {
  const [unitId, setUnitId] = useState(units.some((u) => u.id === defaultUnit) ? defaultUnit! : (units[0]?.id ?? ""));
  const unit = units.find((u) => u.id === unitId);
  const [category, setCategory] = useState(unit?.categories[0]?.value ?? "");
  const categories = unit?.categories ?? [];
  const current = categories.some((c) => c.value === category) ? category : (categories[0]?.value ?? "");
  const needsItem = current === "assistencia_tecnica" && unit?.hasWarrantyTable;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Unidade" name="unit_id" required value={unitId} onChange={(e) => setUnitId(e.target.value)} options={units.map((u) => ({ value: u.id, label: u.label }))} />
        <SelectField label="Categoria" name="category" required value={current} onChange={(e) => setCategory(e.target.value)} options={categories} />
      </div>
      {needsItem && (
        <SelectField
          label="Item em garantia"
          name="warranty_item_id"
          required
          placeholder="Escolha o sistema e o item"
          hint="Lista do manual do proprietário. Os itens saem da lista quando o prazo de garantia, contado do habite-se, termina."
          options={unit!.warranty}
        />
      )}
    </>
  );
}
