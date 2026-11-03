import { generateKeyPairSync, verify } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
let push: typeof import("./push");

beforeAll(async () => {
  vi.stubEnv("APNS_KEY_ID", "ABC123DEFG");
  vi.stubEnv("APNS_TEAM_ID", "2VX8B9WN5J");
  // Na Vercel a chave pode vir numa linha só, com "\n" escrito.
  vi.stubEnv("APNS_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"));
  push = await import("./push");
});

describe("avisos no celular (APNs)", () => {
  it("assina o token do provedor em ES256 com a chave e o time", () => {
    expect(push.pushConfigured()).toBe(true);
    const jwt = push.providerToken();
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toMatchObject({ iss: "2VX8B9WN5J" });
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"))).toBe(true);
    expect(push.providerToken()).toBe(jwt); // reaproveitado dentro da hora
  });

  it("só aceita links do próprio site", () => {
    expect(push.safePushLink("/cliente/chamados/1")).toBe("/cliente/chamados/1");
    expect(push.safePushLink("//evil.example")).toBeNull();
    expect(push.safePushLink("https://evil.example")).toBeNull();
    expect(push.safePushLink(null)).toBeNull();
  });
});
