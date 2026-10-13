import "server-only";
import { createHmac } from "node:crypto";
import { requireServerSecret } from "@/server/env";

/** HMAC-SHA256 do documento normalizado; permite detectar duplicidade sem expor o número. */
export function documentHash(normalized: string) {
  return createHmac("sha256", requireServerSecret("documentPepper")).update(normalized).digest("hex");
}
