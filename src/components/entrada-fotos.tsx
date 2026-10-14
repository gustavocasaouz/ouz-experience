"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type Foto = { src: string; name: string; note?: string };

/** Fotos dos empreendimentos em troca suave (pausa com "reduzir movimento"). */
export function EntradaFotos({ fotos, className = "" }: { fotos: Foto[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % fotos.length), 5000);
    return () => clearInterval(t);
  }, [fotos.length]);
  const atual = fotos[i];
  return (
    <div className={`relative overflow-hidden bg-sand ${className}`}>
      {fotos.map((f, k) => (
        <Image key={f.src} src={f.src} alt="" fill priority={k === 0} sizes="(min-width: 1024px) 50vw, 100vw"
          className={`object-cover transition-opacity duration-[1500ms] ${k === i ? "opacity-100" : "opacity-0"}`} />
      ))}
      {atual && (
        <p aria-live="off" className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-white text-xs tracking-[0.25em] uppercase [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
          <span>{atual.name}</span>
          {atual.note && <span>{atual.note}</span>}
        </p>
      )}
    </div>
  );
}
