/** Aceita só caminhos internos (evita open redirect). */
export function safeNext(next: unknown, fallback = "/conta"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
