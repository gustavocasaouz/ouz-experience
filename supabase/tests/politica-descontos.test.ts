import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => db.close());

// MAUI: desconto de até R$ 150 mil somente com entrada ≥ 30% e saldo nas chaves.
const RULES = { desconto_condicional_valor: 150000, desconto_condicional_entrada_minima: 30, desconto_condicional_somente_entrada_e_chaves: true };
const TABLE = 2679018;
const pay = (offered: number, entradaPct: number, withMonthly = false) => {
  const entrada = Math.round(offered * entradaPct) / 100;
  const monthly = withMonthly ? Math.round(offered * 0.2 * 100 / 3) / 100 : 0;
  const p: object[] = [{ kind: "entrada", amount: entrada, quantity: 1, first_due: "2030-01-10" }];
  if (withMonthly) p.push({ kind: "parcela", amount: monthly, quantity: 3, interval_months: 1, first_due: "2030-02-10" });
  p.push({ kind: "chaves", amount: Math.round((offered - entrada - monthly * (withMonthly ? 3 : 0)) * 100) / 100, quantity: 1, first_due: "2031-01-10" });
  return p;
};
const within = async (rules: object, offered: number, payments: object[]) =>
  (await db.admin<{ w: boolean }>(`select (public.evaluate_terms($1::jsonb, $2, $3, $4::jsonb, null, '2029-12-01', 'pf') ->> 'within')::boolean as w`,
    [JSON.stringify(rules), TABLE, offered, JSON.stringify(payments)]))[0].w;

describe("política de descontos", () => {
  it("preço de tabela na condição padrão (10/20/70) está dentro", async () => {
    expect(await within(RULES, TABLE, pay(TABLE, 10, true))).toBe(true);
  });
  it("até R$ 150 mil de desconto com 30% de entrada e saldo nas chaves", async () => {
    expect(await within(RULES, TABLE - 150000, pay(TABLE - 150000, 30))).toBe(true);
  });
  it("desconto com parcelas mensais, acima de R$ 150 mil ou com entrada menor vai para análise", async () => {
    expect(await within(RULES, TABLE - 150000, pay(TABLE - 150000, 30, true))).toBe(false);
    expect(await within(RULES, TABLE - 150001, pay(TABLE - 150001, 30))).toBe(false);
    expect(await within(RULES, TABLE - 100000, pay(TABLE - 100000, 20))).toBe(false);
  });
  it("desconto máximo em reais", async () => {
    expect(await within({ desconto_maximo_valor: 50000 }, TABLE - 50000, pay(TABLE - 50000, 10))).toBe(true);
    expect(await within({ desconto_maximo_valor: 50000 }, TABLE - 50001, pay(TABLE - 50001, 10))).toBe(false);
  });
  it("SOHO: toda proposta exige análise", async () => {
    expect(await within({ sempre_exigir_analise: true }, TABLE, pay(TABLE, 30))).toBe(false);
  });
});
