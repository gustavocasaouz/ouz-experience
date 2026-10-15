"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Abertura com o símbolo OUZ (mesma linguagem de ouzgroup.com.br): O, U e Z começam separados,
 * deslizam até se sobrepor e a cortina sobe. Exibida uma vez por sessão; respeita "reduzir movimento".
 */
export function IntroAnimation() {
  const [show, setShow] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const left = useRef<SVGSVGElement>(null);
  const right = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("ouz_intro") === "1";
      sessionStorage.setItem("ouz_intro", "1");
    } catch {}
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decisão só no cliente (sessão e preferência de movimento)
    if (!seen && !reduce) setShow(true);
  }, []);

  useEffect(() => {
    if (!show || !overlay.current || !left.current || !right.current) return;
    const ease = "cubic-bezier(0.65, 0, 0.35, 1)";
    const a = left.current.animate([{ transform: "translateX(-110px)" }, { transform: "translateX(0)" }], { duration: 1600, easing: ease, fill: "forwards" });
    right.current.animate([{ transform: "translateX(110px)" }, { transform: "translateX(0)" }], { duration: 1600, easing: ease, fill: "forwards" });
    a.finished.then(() => {
      const up = overlay.current?.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration: 1100, easing: "cubic-bezier(0.87, 0, 0.13, 1)", fill: "forwards" });
      up?.finished.then(() => setShow(false));
    });
  }, [show]);

  if (!show) return null;
  return (
    <div ref={overlay} aria-hidden className="fixed inset-0 z-[100] bg-paper text-ink flex items-center justify-center">
      <div className="relative" style={{ width: 90, height: 90 }}>
        <svg ref={left} viewBox="0 0 107 107" width="90" height="90" fill="none" className="absolute inset-0" style={{ transform: "translateX(-110px)" }}>
          <path d="M3 78.6191V3.06763H77.7845L103.48 28.7628V103.547H28.3117L3 78.6191Z" stroke="currentColor" strokeWidth="6" />
        </svg>
        <svg viewBox="0 0 107 107" width="90" height="90" fill="none" className="absolute inset-0">
          <path d="M3.42651 0V78.6196L28.7382 103.548H103.906V23.7776" stroke="currentColor" strokeWidth="6" />
        </svg>
        <svg ref={right} viewBox="0 0 105 107" width="88" height="90" fill="none" className="absolute inset-0" style={{ transform: "translateX(110px)" }}>
          <path d="M0.876709 3.06763H79.3045M26.1884 103.547H105" stroke="currentColor" strokeWidth="6" />
          <path d="M100.208 1.60278L1.26196 100.548" stroke="currentColor" strokeWidth="3" />
        </svg>
      </div>
    </div>
  );
}
