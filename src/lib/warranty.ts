/**
 * Prazos de garantia contados a partir do habite-se (como diz o manual de cada empreendimento).
 * Um prazo de 12 meses com habite-se em 10/03/2026 cobre até 09/03/2027, inclusive.
 * Datas "AAAA-MM-DD" são tratadas como dias de calendário (sem fuso).
 */
export type WarrantyState = "aguardando_habite_se" | "vigente" | "encerrada";
export type WarrantyStatus = { state: WarrantyState; endsOn: string | null; daysLeft: number | null };

const DAY = 86_400_000;
const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Último dia coberto: mesmo dia, `months` meses depois, menos um dia (fim de mês ajustado). */
export function warrantyEndsOn(habiteSe: string, months: number): string {
  const [y, m, d] = habiteSe.split("-").map(Number);
  const targetMonth = m! - 1 + months;
  const lastDay = new Date(Date.UTC(y!, targetMonth + 1, 0)).getUTCDate();
  return iso(Date.UTC(y!, targetMonth, Math.min(d!, lastDay)) - DAY);
}

/** `today` em "AAAA-MM-DD" no fuso de Brasília (ver todayInBrasilia). */
export function warrantyStatus(habiteSe: string | null, months: number, today: string): WarrantyStatus {
  if (!habiteSe) return { state: "aguardando_habite_se", endsOn: null, daysLeft: null };
  const endsOn = warrantyEndsOn(habiteSe, months);
  const daysLeft = Math.round((parse(endsOn) - parse(today)) / DAY);
  return { state: daysLeft >= 0 ? "vigente" : "encerrada", endsOn, daysLeft: daysLeft >= 0 ? daysLeft : null };
}

export function todayInBrasilia(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** "1 ano", "2 anos", "18 meses". */
export function formatWarrantyPeriod(months: number): string {
  if (months % 12 === 0) return months === 12 ? "1 ano" : `${months / 12} anos`;
  return months === 1 ? "1 mês" : `${months} meses`;
}
