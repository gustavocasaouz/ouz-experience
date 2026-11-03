"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { saveCustomizationChoices } from "@/server/actions/client";
import type { CustomizationItem } from "@/server/queries/customization";
import { formatBRL } from "@/lib/format";

/** Catálogo por categoria: cada item começa no padrão da construtora; upgrades somam no total de referência. */
export function CatalogForm({ unitId, items, selected }: { unitId: string; items: CustomizationItem[]; selected: Record<string, string> }) {
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, selected[i.id] ?? i.choices.find((c) => c.is_standard)?.id ?? i.choices[0]?.id ?? ""])),
  );
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const upgrades = items
    .map((i) => ({ item: i, choice: i.choices.find((c) => c.id === picks[i.id]) }))
    .filter((x) => x.choice && !x.choice.is_standard && x.choice.price > 0);
  const total = upgrades.reduce((sum, x) => sum + x.choice!.price, 0);

  return (
    <form action={saveCustomizationChoices} className="grid gap-10 lg:grid-cols-[1fr_20rem] items-start">
      <input type="hidden" name="unit_id" value={unitId} />
      <div className="flex flex-col gap-12 min-w-0">
        <p className="text-ink-soft max-w-2xl">
          Cada item já vem com o padrão OUZ, incluso no valor da unidade. Se quiser, troque por um upgrade: o custo adicional aparece ao lado e soma no total.
          Os valores são de referência; a OUZ confirma viabilidade, valor final e prazo depois do envio.
        </p>
        {categories.map((cat) => (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="font-display text-2xl mb-5">{cat}</h2>
            <div className="flex flex-col gap-8">
              {items.filter((i) => i.category === cat).map((i) => (
                <fieldset key={i.id}>
                  <legend className="font-medium text-[17px]">{i.title}</legend>
                  {i.description && <p className="text-sm text-ink-mute mt-1">{i.description}</p>}
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 mt-3">
                    {i.choices.map((c) => (
                      <label
                        key={c.id}
                        className="flex flex-col gap-2 p-4 bg-surface border border-line rounded-[var(--radius-md)] cursor-pointer hover:border-ink-mute has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
                      >
                        <span className="flex items-start gap-3">
                          <input
                            type="radio"
                            name={`item:${i.id}`}
                            value={c.id}
                            checked={picks[i.id] === c.id}
                            onChange={() => setPicks((p) => ({ ...p, [i.id]: c.id }))}
                            className="mt-1 size-4 accent-[var(--color-ink)] shrink-0"
                          />
                          <span className="flex-1 font-medium leading-snug">{c.title}</span>
                        </span>
                        {c.description && <span className="text-sm text-ink-soft pl-7">{c.description}</span>}
                        <span className="pl-7 mt-auto">
                          {c.is_standard ? <Badge tone="success">Padrão OUZ · incluso</Badge> : c.price > 0 ? <span className="text-sm font-medium">+ {formatBRL(c.price)}</span> : <Badge>Sem custo adicional</Badge>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-24">
        <Card className="p-6 flex flex-col gap-4">
          <p className="eyebrow">Resumo</p>
          <div>
            <p className="font-display text-4xl tabular-nums">{formatBRL(total)}</p>
            <p className="text-sm text-ink-mute">em upgrades · valor de referência</p>
          </div>
          {upgrades.length === 0 ? (
            <p className="text-sm text-ink-soft">Tudo no padrão OUZ por enquanto.</p>
          ) : (
            <ul className="text-sm divide-y divide-line border-y border-line">
              {upgrades.map(({ item, choice }) => (
                <li key={item.id} className="py-2 flex justify-between gap-3">
                  <span className="text-ink-soft">{item.title}: <span className="text-ink">{choice!.title}</span></span>
                  <span className="tabular-nums whitespace-nowrap">{formatBRL(choice!.price)}</span>
                </li>
              ))}
            </ul>
          )}
          <SubmitButton name="intent" value="salvar" variant="secondary">Salvar escolhas</SubmitButton>
          <SubmitButton name="intent" value="enviar" disabled={upgrades.length === 0}>Enviar upgrades à OUZ</SubmitButton>
          <p className="text-xs text-ink-mute">O envio vira uma solicitação. A OUZ responde com o orçamento final, que você aprova ou recusa em Solicitações.</p>
        </Card>
      </aside>
    </form>
  );
}
