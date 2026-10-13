/**
 * Validação de formato e dígitos verificadores de CPF, CNPJ (numérico e alfanumérico) e CRECI.
 * IMPORTANTE: validar dígitos NÃO comprova identidade nem regularidade no CRECI.
 */

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function normalizeCpf(v: string) {
  return onlyDigits(v);
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i]! * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === digits[9] && dv(10) === digits[10];
}

/** CNPJ: 12 caracteres alfanuméricos (A–Z, 0–9) + 2 dígitos verificadores numéricos (IN RFB 2.229/2024). */
export function normalizeCnpj(v: string) {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const values = cnpj.split("").map((c) => c.charCodeAt(0) - 48);
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * values[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === values[12] && dv(13) === values[13];
}

export type DocumentKind = "cpf" | "cnpj";

export function detectDocument(input: string): { kind: DocumentKind; value: string } | null {
  const cpf = normalizeCpf(input);
  if (cpf.length === 11 && /^\d+$/.test(input.replace(/[.\-\s]/g, "")) && isValidCpf(cpf)) return { kind: "cpf", value: cpf };
  const cnpj = normalizeCnpj(input);
  if (cnpj.length === 14 && isValidCnpj(cnpj)) return { kind: "cnpj", value: cnpj };
  return null;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS)[number];

/** CRECI: número (até 8 dígitos) com sufixo opcional de letra (ex.: 12345-F, 1234-J). Apenas formato. */
export function normalizeCreci(v: string) {
  return v.toUpperCase().replace(/[^0-9A-Z-]/g, "");
}
export function isValidCreciFormat(number: string, uf: string): boolean {
  return /^[0-9]{1,8}(-?[A-Z])?$/.test(normalizeCreci(number)) && (UFS as readonly string[]).includes(uf);
}

export function formatCpf(cpf: string) {
  const d = normalizeCpf(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}
export function formatCnpj(cnpj: string) {
  const d = normalizeCnpj(cnpj);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : cnpj;
}

/** Mascaramento para exibição quando o dado completo não é necessário. */
export function maskDocument(doc: string | null | undefined): string {
  if (!doc) return "—";
  const cpf = normalizeCpf(doc);
  if (cpf.length === 11) return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
  const cnpj = normalizeCnpj(doc);
  if (cnpj.length === 14) return `**.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/****-**`;
  return "***";
}

export function normalizePhone(v: string) {
  const plus = v.trim().startsWith("+");
  return (plus ? "+" : "") + onlyDigits(v);
}
export function isPlausiblePhone(v: string) {
  const d = onlyDigits(v);
  return d.length >= 10 && d.length <= 15;
}
