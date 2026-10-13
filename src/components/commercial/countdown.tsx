"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

/** Prazo com contagem regressiva (horário de Brasília). O prazo oficial é o do servidor. */
export function Countdown({ deadline, label = "Prazo" }: { deadline: string; label?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- relógio só no cliente, evita divergência de hidratação
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(deadline).getTime() - (now ?? new Date(deadline).getTime());
  const h = Math.floor(Math.max(ms, 0) / 3_600_000);
  const m = Math.floor((Math.max(ms, 0) % 3_600_000) / 60_000);
  return (
    <div className="flex flex-col">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-2xl">{formatDateTime(deadline)}</span>
      {now !== null && (
        <span className={`text-sm ${ms <= 0 ? "text-danger" : h < 6 ? "text-warning" : "text-ink-soft"}`}>
          {ms <= 0 ? "Prazo encerrado — aguardando processamento" : `Restam ${h} h ${String(m).padStart(2, "0")} min`}
        </span>
      )}
    </div>
  );
}
