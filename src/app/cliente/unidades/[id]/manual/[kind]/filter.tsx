"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/design-system/cx";
import { fold } from "@/lib/manual";
import { Icon } from "../icons";

/**
 * Filtro instantâneo de uma lista renderizada no servidor. Itens: `[data-k]` (texto pesquisável) e,
 * se houver botões, `[data-f]` (valores separados por espaço). Grupos `[data-group]` sem itens visíveis somem.
 */
export function ListFilter({
  target,
  placeholder,
  chips = [],
  noun = ["item", "itens"],
  initialChip = "",
}: {
  target: string;
  placeholder: string;
  chips?: Array<{ value: string; label: string }>;
  noun?: [string, string];
  initialChip?: string;
}) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState(initialChip);
  const counter = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const term = fold(q.trim());
    let n = 0;
    root.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      const ok = (!term || (el.dataset.k ?? "").includes(term)) && (!chip || (el.dataset.f ?? "").split(" ").includes(chip));
      el.hidden = !ok;
      if (ok) n++;
    });
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
      g.hidden = !g.querySelector("[data-k]:not([hidden])");
    });
    // A lista é do servidor; o contador é atualizado direto no DOM, junto com a filtragem.
    if (counter.current) counter.current.textContent = `${n} ${n === 1 ? noun[0] : noun[1]}`;
  }, [q, chip, target, noun]);

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="relative">
        <Icon name="search" className="size-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls={target}
          className="w-full bg-surface border border-line rounded-[var(--radius-sm)] pl-10 pr-3 min-h-11 text-base focus:border-ink focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 &&
          [{ value: "", label: "Todos" }, ...chips].map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={chip === c.value}
              onClick={() => setChip(c.value)}
              className={cx(
                "px-3.5 min-h-9 rounded-full text-sm border",
                chip === c.value ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink",
              )}
            >
              {c.label}
            </button>
          ))}
        <span ref={counter} className="text-sm text-ink-mute ml-auto" aria-live="polite" />
      </div>
    </div>
  );
}
