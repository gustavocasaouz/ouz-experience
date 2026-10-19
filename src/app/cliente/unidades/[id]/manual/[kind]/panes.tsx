"use client";

import { useId, useState } from "react";
import { cx } from "@/design-system/cx";

/** Abas da seção de um sistema (visão geral, cuidados de uso, manutenção, perda de garantia). */
export function Panes({ panes }: { panes: Array<{ key: string; label: string; html: string }> }) {
  const [current, setCurrent] = useState(panes[0]?.key);
  const id = useId();
  if (panes.length <= 1) return <div className="manual-prose" dangerouslySetInnerHTML={{ __html: panes[0]?.html ?? "" }} />;
  const move = (dir: number) => {
    const i = panes.findIndex((p) => p.key === current);
    const next = panes[(i + dir + panes.length) % panes.length]!;
    setCurrent(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };
  return (
    <div>
      <div
        role="tablist"
        aria-label="Partes da seção"
        className="flex gap-1 overflow-x-auto border-b border-line mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") move(1);
          if (e.key === "ArrowLeft") move(-1);
        }}
      >
        {panes.map((p) => (
          <button
            key={p.key}
            id={`${id}-tab-${p.key}`}
            type="button"
            role="tab"
            aria-selected={p.key === current}
            aria-controls={`${id}-pane-${p.key}`}
            tabIndex={p.key === current ? 0 : -1}
            onClick={() => setCurrent(p.key)}
            className={cx(
              "px-4 min-h-11 text-sm whitespace-nowrap border-b-2 -mb-px",
              p.key === current ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panes.map((p) => (
        <div
          key={p.key}
          id={`${id}-pane-${p.key}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${p.key}`}
          hidden={p.key !== current}
          className="manual-prose"
          dangerouslySetInnerHTML={{ __html: p.html }}
        />
      ))}
    </div>
  );
}
