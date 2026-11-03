import "server-only";
import { connect, constants } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { serverEnv } from "@/server/env";

/*
 * Avisos no app iOS pelo APNs (HTTP/2 + token JWT ES256 da chave .p8).
 * O app manda o link (caminho do site) junto; ao tocar no aviso, a WebView abre esse caminho.
 */

/** Cookie com o token do aparelho: "Sair" no app desliga os avisos dele. */
export const PUSH_COOKIE = "ouz_push";

export type PushEnvironment = "production" | "sandbox";
export type PushMessage = { title: string; body?: string | null; link?: string | null; collapseId?: string };
/** "gone": o aparelho não recebe mais (app apagado, token de outro ambiente): o token deve sair do banco. */
export type PushResult = "ok" | "gone" | "error";

const HOSTS: Record<PushEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

export const pushConfigured = () => Boolean(serverEnv.apnsKeyId && serverEnv.apnsTeamId && serverEnv.apnsPrivateKey);

let cached: { jwt: string; issuedAt: number } | null = null;

/** JWT do provedor, reaproveitado por 50 min (a Apple recusa se renovar com frequência ou se passar de 1 h). */
export function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.issuedAt < 50 * 60) return cached.jwt;
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const input = `${part({ alg: "ES256", kid: serverEnv.apnsKeyId })}.${part({ iss: serverEnv.apnsTeamId, iat: now })}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey(serverEnv.apnsPrivateKey), dsaEncoding: "ieee-p1363" });
  cached = { jwt: `${input}.${signature.toString("base64url")}`, issuedAt: now };
  return cached.jwt;
}

/** Só caminhos do próprio site ("/cliente/..."); qualquer outra coisa é descartada. */
export const safePushLink = (link: unknown) => (typeof link === "string" && /^\/(?!\/)/.test(link) ? link : null);

/** Envia o mesmo aviso para vários aparelhos de um ambiente, numa conexão. */
export async function sendApns(environment: PushEnvironment, tokens: string[], msg: PushMessage) {
  const results = new Map<string, PushResult>();
  if (tokens.length === 0) return results;
  const link = safePushLink(msg.link);
  const payload = JSON.stringify({
    aps: { alert: { title: msg.title.slice(0, 120), ...(msg.body ? { body: msg.body.slice(0, 400) } : {}) }, sound: "default" },
    ...(link ? { link } : {}),
  });
  const client = connect(HOSTS[environment]);
  client.on("error", () => undefined); // cada pedido registra o próprio erro

  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              [constants.HTTP2_HEADER_METHOD]: "POST",
              [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
              authorization: `bearer ${providerToken()}`,
              "apns-topic": serverEnv.apnsBundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              ...(msg.collapseId ? { "apns-collapse-id": msg.collapseId.slice(0, 64) } : {}),
            });
            let status = 0;
            let body = "";
            req.setEncoding("utf8");
            req.setTimeout(10_000, () => req.close());
            req.on("response", (headers) => {
              status = Number(headers[constants.HTTP2_HEADER_STATUS]);
            });
            req.on("data", (chunk: string) => {
              body += chunk;
            });
            req.on("error", () => undefined); // "close" vem em seguida
            req.on("close", () => {
              let reason: string | undefined;
              try {
                reason = (JSON.parse(body) as { reason?: string }).reason;
              } catch {}
              const result: PushResult = status === 200 ? "ok" : status === 410 || (reason && GONE_REASONS.has(reason)) ? "gone" : "error";
              if (result !== "ok") console.error("apns_error", { environment, status, reason });
              results.set(token, result);
              resolve();
            });
            req.end(payload);
          }),
      ),
    );
  } finally {
    client.close();
  }
  return results;
}
