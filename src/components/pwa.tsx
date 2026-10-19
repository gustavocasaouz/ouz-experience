"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system";

/** Registra o service worker (somente em builds de produção). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

/** Aviso discreto quando a conexão cai. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[90] bg-ink text-paper text-sm text-center px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      Sem conexão. Assim que a internet voltar, tente a ação novamente.
    </div>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Convite para instalar o app: botão no Android/desktop; instrução no iPhone. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone ||
      /OUZExperienceApp/.test(navigator.userAgent); // dentro do app iOS (Capacitor)
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("ouz_install_dismissed") === "1";
    } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecção de plataforma só no cliente
    setIos(isIos);
    setHidden(!isIos);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem("ouz_install_dismissed", "1");
    } catch {}
    setHidden(true);
  };
  return (
    <div className="border border-line bg-surface p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Instale o OUZ Experience no celular</p>
        <p className="text-sm text-ink-soft">
          {ios ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”." : "Acesso rápido, em tela cheia, como um aplicativo."}
        </p>
      </div>
      <div className="flex gap-2">
        {deferred && (
          <Button
            size="sm"
            onClick={async () => {
              await deferred.prompt();
              setHidden(true);
            }}
          >
            Instalar
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Agora não
        </Button>
      </div>
    </div>
  );
}
