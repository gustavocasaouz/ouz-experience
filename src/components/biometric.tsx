"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/design-system";

/*
 * Entrada por Face ID, só dentro do app iOS (plugin nativo "OuzBiometric", ver mobile/ios/App/App/BiometricPlugin.swift).
 * No navegador comum nada disto aparece.
 */

type Biometry = "faceID" | "touchID" | "none";
type Status = { available: boolean; biometry: Biometry; enabled: boolean };
type NativeError = { code?: string; message?: string };
type CapacitorGlobal = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise: (plugin: string, method: string, options?: object) => Promise<unknown>;
};

const OFFER_KEY = "ouz_bio_offer"; // sessão: acabou de entrar com a senha
const DECLINED_KEY = "ouz_bio_declined"; // aparelho: respondeu "Agora não"

function native(): CapacitorGlobal | null {
  if (typeof window === "undefined" || !/OUZExperienceApp/.test(navigator.userAgent)) return null;
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isPluginAvailable?.("OuzBiometric") ? cap : null;
}

function callNative<T = void>(method: string, options?: object) {
  const cap = native();
  if (!cap) return Promise.reject({ code: "unavailable" } satisfies NativeError);
  return cap.nativePromise("OuzBiometric", method, options) as Promise<T>;
}

async function readStatus(): Promise<Status | null> {
  if (!native()) return null;
  return callNative<Status>("status").catch(() => null);
}

const label = (b: Biometry) => (b === "touchID" ? "Touch ID" : "Face ID");

function storage(kind: "session" | "local") {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

async function postJson(url: string, body?: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  return { status: res.status, ...data };
}

/** Pede o token da sessão do aparelho e guarda no Keychain após confirmar a biometria. */
async function enableBiometric(biometry: Biometry): Promise<string | null> {
  const res = await postJson("/api/biometria/ativar");
  if (!res.token) return res.error ?? "Não foi possível ativar agora.";
  try {
    await callNative("enable", { token: res.token, reason: `Confirme para entrar com ${label(biometry)} nas próximas vezes.` });
    storage("local")?.removeItem(DECLINED_KEY);
    return null;
  } catch (e) {
    return (e as NativeError).code === "cancelled" ? "" : `Não foi possível ativar o ${label(biometry)}.`;
  }
}

/** Marca o envio do formulário de senha: depois de entrar, o app oferece o Face ID. */
export function markPasswordSignIn() {
  if (native()) storage("session")?.setItem(OFFER_KEY, "1");
}

/** Botão "Entrar com Face ID" na tela de login (dispara sozinho uma vez ao abrir). */
export function BiometricSignIn({ next }: { next: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoTried = useRef(false);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const { token } = await callNative<{ token: string }>("unlock", { reason: "Entre no OUZ Experience." });
      const res = await postJson("/api/biometria/entrar", { token });
      if (res.token) await callNative("replace", { token: res.token }).catch(() => undefined);
      if (res.status === 200) {
        window.location.assign(next);
        return;
      }
      if (res.status === 401) {
        await callNative("clear").catch(() => undefined);
        setStatus((s) => (s ? { ...s, enabled: false } : s));
      }
      setError(res.error ?? "Não foi possível entrar. Use a senha.");
    } catch (e) {
      const code = (e as NativeError).code;
      if (code === "notEnabled") setStatus((s) => (s ? { ...s, enabled: false } : s));
      else if (code !== "cancelled") setError("Não foi possível confirmar a biometria. Use a senha.");
    }
    setBusy(false);
  }

  useEffect(() => {
    readStatus().then((s) => {
      setStatus(s);
      if (s?.available && s.enabled && !autoTried.current) {
        autoTried.current = true;
        void unlock();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a tela
  }, []);

  if (!status?.available || !status.enabled) return error ? <p role="alert" className="mt-5 text-sm text-danger">{error}</p> : null;
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6">
      <Button variant="secondary" size="lg" onClick={unlock} disabled={busy}>
        {busy ? "Entrando…" : `Entrar com ${label(status.biometry)}`}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/**
 * Fica no layout raiz: depois de entrar com a senha no app, pergunta se a pessoa quer usar o Face ID;
 * ao sair (formulários com data-signout), esquece a oferta pendente. O token do Keychain fica:
 * a próxima entrada é pelo Face ID (desligar é em "Minha conta").
 */
export function BiometricOffer() {
  const pathname = usePathname();
  const [biometry, setBiometry] = useState<Biometry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!native()) return;
    const onSubmit = (e: SubmitEvent) => {
      if (!(e.target instanceof HTMLFormElement) || !e.target.hasAttribute("data-signout")) return;
      storage("session")?.removeItem(OFFER_KEY);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    const session = storage("session");
    if (!native() || pathname.startsWith("/entrar") || session?.getItem(OFFER_KEY) !== "1") return;
    session.removeItem(OFFER_KEY);
    if (storage("local")?.getItem(DECLINED_KEY) === "1") return;
    readStatus().then((s) => {
      if (s?.available && !s.enabled) setBiometry(s.biometry);
    });
  }, [pathname]);

  if (!biometry) return null;
  const name = label(biometry);
  return (
    <div role="dialog" aria-labelledby="bio-offer-title" data-native-sheet className="fixed inset-x-0 bottom-0 z-[95] border-t border-line bg-surface shadow-lg px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md flex flex-col gap-4">
        <div>
          <p id="bio-offer-title" className="font-medium">Entrar com {name} da próxima vez?</p>
          <p className="text-sm text-ink-soft mt-1">Quando a sessão expirar, você entra no app só com o {name}, sem digitar a senha.</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await enableBiometric(biometry);
              setBusy(false);
              if (err === null) setBiometry(null);
              else setError(err);
            }}
          >
            {busy ? "Ativando…" : `Usar ${name}`}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              storage("local")?.setItem(DECLINED_KEY, "1");
              setBiometry(null);
            }}
          >
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Opção em "Minha conta" para ligar ou desligar o Face ID neste aparelho. */
export function BiometricSetting() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    readStatus().then(setStatus);
  }, []);

  if (!status?.available) return null;
  const name = label(status.biometry);
  return (
    <div className="border border-line bg-surface p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Entrar com {name}</p>
        <p className="text-sm text-ink-soft">
          {status.enabled ? `Ativado neste iPhone. Quando a sessão expirar, você entra com o ${name}.` : `Entre no app com o ${name}, sem digitar a senha.`}
        </p>
        {error && <p role="alert" className="text-sm text-danger mt-1">{error}</p>}
      </div>
      <Button
        size="sm"
        variant={status.enabled ? "ghost" : "primary"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          if (status.enabled) {
            await callNative("clear").catch(() => undefined);
          } else {
            const err = await enableBiometric(status.biometry);
            if (err) setError(err);
          }
          setStatus(await readStatus());
          setBusy(false);
        }}
      >
        {status.enabled ? "Desativar" : "Ativar"}
      </Button>
    </div>
  );
}

/** Depois de excluir a conta: apaga o token do Keychain deste aparelho. */
export function ForgetBiometric() {
  useEffect(() => {
    void callNative("clear").catch(() => undefined);
  }, []);
  return null;
}
