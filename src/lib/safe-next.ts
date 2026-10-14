/** Aceita só caminhos internos (evita open redirect, inclusive com TAB/LF e barras invertidas). */
export function safeNext(next: unknown, fallback = "/conta"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\x00-\x1f\x7f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://interno.invalid");
    if (u.origin !== "http://interno.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
