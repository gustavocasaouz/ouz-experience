/** Formatação brasileira. Datas persistem em UTC e são exibidas em America/Sao_Paulo. */
export const TIME_ZONE = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? brl.format(n) : "—";
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const longDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });

const toDate = (v: string | Date) => (typeof v === "string" ? new Date(v) : v);

export const formatDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(toDate(v)) : "—");
export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(toDate(v)).replace(",", " às") : "—");
export const formatLongDate = (v: string | Date | null | undefined) => (v ? longDateFmt.format(toDate(v)) : "—");

/**
 * Converte "AAAA-MM-DDTHH:mm" digitado em horário de Brasília para ISO UTC.
 * O Brasil não adota horário de verão desde 2019 (offset fixo -03:00); revisar se isso mudar.
 */
export function brasiliaLocalToUtcIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("data/hora inválida");
  return new Date(`${local}:00-03:00`).toISOString();
}
export function utcToBrasiliaLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** Interpreta valores digitados em reais ("1.234.567,89", "1234567.89", "R$ 1.000"). Retorna null se inválido. */
export function parseBRL(input: string | null | undefined): number | null {
  if (!input) return null;
  let s = input.replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Vencimento de parcela (data civil); sem data = parcela das chaves. */
export function formatDue(v: string | null | undefined) {
  return v ? formatDate(v + "T12:00:00Z") : "Na entrega das chaves";
}

export function formatPercent(v: number | string | null | undefined, digits = 2) {
  if (v === null || v === undefined || v === "") return "—";
  return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

/** Instante atual da requisição (componentes de servidor são renderizados por requisição). */
export function requestNow(): number {
  return new Date().getTime();
}
