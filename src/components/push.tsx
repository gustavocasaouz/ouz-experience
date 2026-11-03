"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/design-system";

/*
 * Avisos no celular, só dentro do app iOS (plugin nativo "OuzPush", ver mobile/ios/App/App/PushPlugin.swift).
 * Fica nas áreas logadas: com a permissão dada, registra o aparelho a cada abertura (o token pode mudar);
 * sem resposta ainda, oferece uma vez por sessão, depois da oferta do Face ID.
 */

type Permission = "granted" | "denied" | "prompt";
type CapacitorGlobal = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise: (plugin: string, method: string, options?: object) => Promise<unknown>;
};

const DECLINED_KEY = "ouz_push_declined"; // aparelho: respondeu "Agora não"
const OFFERED_KEY = "ouz_push_offered"; // sessão: já ofereceu

function native(): CapacitorGlobal | null {
  if (typeof window === "undefined" || !/OUZExperienceApp/.test(navigator.userAgent)) return null;
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isPluginAvailable?.("OuzPush") ? cap : null;
}

function callNative<T>(method: string) {
  const cap = native();
  if (!cap) return Promise.reject(new Error("unavailable"));
  return cap.nativePromise("OuzPush", method) as Promise<T>;
}

function storage(kind: "session" | "local") {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const readPermission = () => callNative<{ permission: Permission }>("status").then((r) => r.permission).catch(() => null);

/** Pede a permissão (se ainda não respondida), obtém o token e liga o aparelho a esta conta. */
async function register(): Promise<boolean> {
  try {
    const { token, environment } = await callNative<{ token: string; environment: string }>("register");
    const res = await fetch("/api/push/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, environment }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function PushSetup() {
  const pathname = usePathname();
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!native()) return;
    readPermission().then((p) => {
      if (p === "granted") void register();
    });
  }, []);

  useEffect(() => {
    if (!native() || storage("session")?.getItem(OFFERED_KEY) || storage("local")?.getItem(DECLINED_KEY)) return;
    // Espera a oferta do Face ID (outra folha no rodapé) sair da tela.
    const timer = window.setTimeout(() => {
      if (document.querySelector("[data-native-sheet]")) return;
      readPermission().then((p) => {
        if (p !== "prompt") return;
        storage("session")?.setItem(OFFERED_KEY, "1");
        setOffer(true);
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!offer) return null;
  return (
    <div role="dialog" aria-labelledby="push-offer-title" data-native-sheet className="fixed inset-x-0 bottom-0 z-[95] border-t border-line bg-surface shadow-lg px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md flex flex-col gap-4">
        <div>
          <p id="push-offer-title" className="font-medium">Receber avisos no iPhone?</p>
          <p className="text-sm text-ink-soft mt-1">Avisamos quando a OUZ responder um chamado, publicar um documento ou houver novidade da obra.</p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await register();
              setBusy(false);
              setOffer(false);
            }}
          >
            {busy ? "Ativando…" : "Ativar avisos"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              storage("local")?.setItem(DECLINED_KEY, "1");
              setOffer(false);
            }}
          >
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Opção em "Minha conta" para ligar os avisos neste aparelho (ou explicar como, se foram negados). */
export function PushSetting() {
  const [permission, setPermission] = useState<Permission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (native()) void readPermission().then(setPermission);
  }, []);

  if (!permission) return null;
  return (
    <div className="border border-line bg-surface p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Avisos no iPhone</p>
        <p className="text-sm text-ink-soft">
          {permission === "granted"
            ? "Ativados neste iPhone."
            : permission === "denied"
              ? "Desligados. Para ligar, abra Ajustes › Notificações › OUZ Experience."
              : "Receba no celular as respostas de chamados, documentos novos e novidades da obra."}
        </p>
        {error && <p role="alert" className="text-sm text-danger mt-1">{error}</p>}
      </div>
      {permission === "prompt" && (
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            storage("local")?.removeItem(DECLINED_KEY);
            if (!(await register())) setError("Não foi possível ativar agora.");
            setPermission(await readPermission());
            setBusy(false);
          }}
        >
          Ativar
        </Button>
      )}
    </div>
  );
}
