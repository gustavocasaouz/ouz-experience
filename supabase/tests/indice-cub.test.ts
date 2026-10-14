import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, makeAdmin, makeOperator } from "./fixtures";

let db: TestDb;
let financeiro: Claims, atendimento: Claims;

const one = async <T,>(p: Promise<T[]>) => (await p)[0] as T;
const month = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
};
const day10 = (offset: number) => month(offset).slice(0, 8) + "10";

// Planilha fictícia no formato do "Fluxo de Pagamentos": CUB-base 2000; parcelas de 10.000 (= 5 CUBs).
const payload = (unit: string, email: string) => ({
  development_id: MAUI,
  file_name: "fluxo-teste.xlsx",
  index_values: [{ month: month(-2), value: 2100 }, { month: month(-1), value: 2200 }],
  clients: [{
    ref: `maui:${unit}`, unit_code: unit, parking: "Vaga 1", full_name: "Cliente Importado", email, phone: "48999990000",
    contract_value: 40000, base_index: 2000, note: "Vagas: Vaga 1",
    installments: [
      { number: 1, kind: "entrada", due_date: day10(-2), original_amount: 10000, indexed: false, index_quantity: 5, paid: true, paid_amount: 10000 },
      { number: 2, kind: "parcela", due_date: day10(-1), original_amount: 10000, indexed: true, index_quantity: 5, paid: true, paid_amount: 11000 },
      { number: 3, kind: "parcela", due_date: day10(0), original_amount: 10000, indexed: true, index_quantity: 5, paid: false },
      { number: 4, kind: "chaves", due_date: day10(3), original_amount: 10000, indexed: true, index_quantity: 5, paid: false },
    ],
  }],
});

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  const admin = await makeAdmin(db);
  financeiro = (await makeOperator(db, admin.aal2, "fin@t.ouz", ["financeiro"])).aal2;
  atendimento = (await makeOperator(db, admin.aal2, "atd@t.ouz", ["atendimento"])).aal2;
});
afterAll(async () => db.close());

describe("financeiro corrigido pelo CUB", () => {
  it("importação só roda pelo servidor (nunca pela equipe no navegador)", async () => {
    await expect(db.as(financeiro, `select public.import_indexed_flow($1::jsonb)`, [JSON.stringify(payload("CUB-1", "x@cli.ouz"))])).rejects.toThrow(/permission denied/);
  });

  it("importa unidade, cliente, vínculo e parcelas; pagas congeladas, futuras estimadas pelo último CUB", async () => {
    const { r } = await one(db.admin<{ r: Record<string, number> }>(`select public.import_indexed_flow($1::jsonb) as r`, [JSON.stringify(payload("CUB-1", "Imp@Cli.ouz"))]));
    expect(r).toEqual({ unidades_criadas: 1, clientes_criados: 1, parcelas: 4, indices: 2 });
    const rows = await db.admin<{ number: number; status: string; updated_amount: string; is_estimate: boolean; index_value: string | null }>(
      `select i.number, i.status, i.updated_amount, i.is_estimate, i.index_value from public.installments i
         join public.financial_contracts c on c.id = i.contract_id join public.units u on u.id = c.unit_id
        where u.code = 'CUB-1' order by number`);
    expect(rows).toEqual([
      { number: 1, status: "paga", updated_amount: "10000.00", is_estimate: false, index_value: null },
      { number: 2, status: "paga", updated_amount: "11000.00", is_estimate: false, index_value: null },
      { number: 3, status: "aberta", updated_amount: "11000.00", is_estimate: true, index_value: "2200.00" }, // CUB do mês ainda não cadastrado
      { number: 4, status: "aberta", updated_amount: "11000.00", is_estimate: true, index_value: "2200.00" },
    ]);
    const u = await one(db.admin<{ status: string; email: string }>(`select u.status, c.email from public.units u join public.client_units cu on cu.unit_id = u.id join public.clients c on c.id = cu.client_id where u.code = 'CUB-1'`));
    expect(u).toEqual({ status: "vendida", email: "imp@cli.ouz" });
  });

  it("CUB do mês cadastrado pelo financeiro firma a parcela do mês e reestima as futuras", async () => {
    await expect(db.as(atendimento, `select public.admin_set_index_value('CUB-SC', $1, 2300, null)`, [month(0)])).rejects.toThrow(/acesso negado/);
    await expect(db.as(financeiro, `select public.admin_set_index_value('CUB-SC', $1, 2300, null)`, [month(1)])).rejects.toThrow(/mês futuro/);
    await db.as(financeiro, `select public.admin_set_index_value('CUB-SC', $1, 2300, 'Sinduscon')`, [month(0)]);
    const rows = await db.admin<{ number: number; updated_amount: string; monetary_update: string; is_estimate: boolean }>(
      `select i.number, i.updated_amount, i.monetary_update, i.is_estimate from public.installments i
         join public.financial_contracts c on c.id = i.contract_id join public.units u on u.id = c.unit_id
        where u.code = 'CUB-1' and i.number >= 2 order by number`);
    expect(rows).toEqual([
      { number: 2, updated_amount: "11000.00", monetary_update: "1000.00", is_estimate: false }, // paga: não muda
      { number: 3, updated_amount: "11500.00", monetary_update: "1500.00", is_estimate: false },
      { number: 4, updated_amount: "11500.00", monetary_update: "1500.00", is_estimate: true },
    ]);
  });

  it("juros e multa informados somam-se ao valor reajustado", async () => {
    const { id } = await one(db.admin<{ id: string }>(`select i.id from public.installments i join public.financial_contracts c on c.id = i.contract_id join public.units u on u.id = c.unit_id where u.code = 'CUB-1' and i.number = 3`));
    await db.as(financeiro, `update public.installments set interest = 100, fine = 50 where id = $1`, [id]);
    await db.as(financeiro, `select public.admin_set_index_value('CUB-SC', $1, 2300, 'Sinduscon')`, [month(0)]);
    expect(await one(db.admin<{ updated_amount: string; monetary_update: string }>(`select updated_amount, monetary_update from public.installments where id = $1`, [id])))
      .toEqual({ updated_amount: "11650.00", monetary_update: "1500.00" });
    await db.as(financeiro, `update public.installments set interest = null, fine = null where id = $1`, [id]);
    await db.as(financeiro, `select public.admin_set_index_value('CUB-SC', $1, 2300, 'Sinduscon')`, [month(0)]);
  });

  it("parcela sem reajuste (N) fica no valor original", async () => {
    const { id: contract } = await one(db.admin<{ id: string }>(`select c.id from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-1'`));
    await db.as(financeiro, `select public.admin_add_indexed_installment($1, 5, 'parcela', $2, 8000, false)`, [contract, day10(4)]);
    const r = await one(db.admin<{ updated_amount: string; is_estimate: boolean; index_quantity: string }>(`select updated_amount, is_estimate, index_quantity from public.installments where contract_id = $1 and number = 5`, [contract]));
    expect(r).toEqual({ updated_amount: "8000.00", is_estimate: false, index_quantity: "4.0000000000" });
  });

  it("cliente vê a marcação de estimativa; índices são só da equipe financeira", async () => {
    const { id: clientId } = await one(db.admin<{ id: string }>(`select id from public.clients where email = 'imp@cli.ouz'`));
    const uid = await db.createUser("imp@cli.ouz");
    await db.admin(`update public.clients set user_id = $1 where id = $2`, [uid, clientId]);
    const me: Claims = { sub: uid };
    const rows = await db.as<{ number: number; is_estimate: boolean }>(me, `select number, is_estimate from public.installments_view order by number`);
    expect(rows.map((x) => x.is_estimate)).toEqual([false, false, false, true, false]); // antes da parcela das chaves
    expect(await db.as(me, `select * from public.index_values`)).toHaveLength(0);
    expect(await db.as(atendimento, `select * from public.index_values`)).toHaveLength(0);
    expect((await db.as(financeiro, `select * from public.index_values`)).length).toBe(3);
  });

  it("parcela das chaves pode vencer na entrega (sem data); as demais exigem data", async () => {
    const { id: contract } = await one(db.admin<{ id: string }>(`select c.id from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-1'`));
    await db.as(financeiro, `select public.admin_add_indexed_installment($1, 6, 'chaves', null, 20000, true)`, [contract]);
    const r = await one(db.as<{ display_status: string; is_estimate: boolean; updated_amount: string }>(financeiro,
      `select display_status, is_estimate, updated_amount from public.installments_view where contract_id = $1 and number = 6`, [contract]));
    expect(r).toEqual({ display_status: "a_vencer", is_estimate: true, updated_amount: "23000.00" }); // 10 CUBs × último CUB (2300)
    await expect(db.as(financeiro, `select public.admin_add_indexed_installment($1, 7, 'parcela', null, 20000, true)`, [contract])).rejects.toThrow(/incompletos/);
    await expect(db.as(financeiro, `insert into public.installments (contract_id, number, kind, original_amount) values ($1, 8, 'parcela', 1)`, [contract])).rejects.toThrow(/installments_due_ck/);
  });

  it("tudo ou nada: unidade já com financeiro aborta a importação inteira", async () => {
    const p = payload("CUB-2", "novo@cli.ouz");
    p.clients.push({ ...payload("CUB-1", "outro@cli.ouz").clients[0] });
    await expect(db.admin(`select public.import_indexed_flow($1::jsonb)`, [JSON.stringify(p)])).rejects.toThrow(/já tem financeiro/);
    expect(await db.admin(`select 1 from public.units where code = 'CUB-2'`)).toHaveLength(0);
    expect(await db.admin(`select 1 from public.clients where email = 'novo@cli.ouz'`)).toHaveLength(0);
  });

  it("encargos de atraso automáticos: juros pro rata die + multa sobre o débito; parcela paga congela", async () => {
    const { id: contract } = await one(db.admin<{ id: string }>(`select c.id from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-1'`));
    const { d } = await one(db.admin<{ d: string }>(`select to_char((now() at time zone 'America/Sao_Paulo')::date - 30, 'YYYY-MM-DD') as d`));
    const { id: inst } = await one(db.as<{ id: string }>(financeiro, `select public.admin_add_indexed_installment($1, 9, 'parcela', $2, 9000, false) as id`, [contract, d]));
    await expect(db.as(atendimento, `select public.admin_set_contract_charges($1, 1, 2)`, [contract])).rejects.toThrow(/acesso negado/);
    await expect(db.as(financeiro, `select public.admin_set_contract_charges($1, 1, null)`, [contract])).rejects.toThrow(/juros e multa/);
    await db.as(financeiro, `select public.admin_set_contract_charges($1, 1, 2)`, [contract]);
    const row = () => one(db.admin<{ interest: string; fine: string; updated_amount: string; late_days: number; status: string }>(
      `select interest, fine, updated_amount, late_days, status from public.installments where id = $1`, [inst]));
    // 9.000 × 1% × 30/30 = 90,00; multa 2% × 9.090 = 181,80
    expect(await row()).toEqual({ interest: "90.00", fine: "181.80", updated_amount: "9271.80", late_days: 30, status: "aberta" });
    // Parcela futura não tem encargos.
    expect(await db.admin(`select 1 from public.installments where contract_id = $1 and due_date > current_date + 2 and (interest is not null or fine is not null)`, [contract])).toHaveLength(0);
    await db.as(financeiro, `select public.admin_register_payment($1, 9271.80, current_date, 'teste')`, [inst]);
    await db.admin(`select public._recalc_indexed_installments(null)`);
    expect(await row()).toMatchObject({ status: "paga", updated_amount: "9271.80", interest: "90.00" });
    await db.as(financeiro, `select public.admin_set_contract_charges($1, null, null)`, [contract]);
  });

  it("importação aplica os encargos do contrato", async () => {
    const p = { ...payload("CUB-3", "enc@cli.ouz"), late_charges: { interest_monthly_pct: 1, fine_pct: 2 } };
    await db.admin(`select public.import_indexed_flow($1::jsonb)`, [JSON.stringify(p)]);
    expect(await one(db.admin(`select late_interest_monthly_pct, late_fine_pct from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-3'`)))
      .toEqual({ late_interest_monthly_pct: "1.000", late_fine_pct: "2.000" });
  });

  it("após o Habite-se: CUB do mês do Habite-se corrigido pelo INPC acumulado (estimativa se faltar INPC)", async () => {
    const { id: contract } = await one(db.admin<{ id: string }>(`select c.id from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-1'`));
    await expect(db.as(atendimento, `select public.admin_set_habite_se($1, $2)`, [MAUI, month(-2)])).rejects.toThrow(/acesso negado/);
    await expect(db.as(financeiro, `select public.admin_set_index_value('INPC', $1, 80, null)`, [month(-1)])).rejects.toThrow(/variação mensal/);
    await db.as(financeiro, `select public.admin_set_index_value('INPC', $1, 1, 'IBGE')`, [month(-1)]);
    await db.as(financeiro, `select public.admin_set_contract_post_index($1, 'INPC')`, [contract]);
    await db.as(financeiro, `select public.admin_set_habite_se($1, $2)`, [MAUI, month(-2).slice(0, 8) + "15"]);
    const rows = await db.admin<{ number: number; updated_amount: string; index_value: string; inpc_factor: string; is_estimate: boolean }>(
      `select number, updated_amount, index_value, round(inpc_factor, 4)::text as inpc_factor, is_estimate from public.installments
        where contract_id = $1 and number in (3, 4) order by number`, [contract]);
    expect(rows).toEqual([
      // vence no mês corrente: CUB do Habite-se (2100) × 5 CUBs × INPC do mês anterior (1%) — todos publicados
      { number: 3, updated_amount: "10605.00", index_value: "2100.00", inpc_factor: "1.0100", is_estimate: false },
      // vence daqui a 3 meses: faltam INPCs → estimativa com os já publicados
      { number: 4, updated_amount: "10605.00", index_value: "2100.00", inpc_factor: "1.0100", is_estimate: true },
    ]);
    // Sem Habite-se, volta ao CUB do mês do vencimento.
    await db.as(financeiro, `select public.admin_set_habite_se($1, null)`, [MAUI]);
    expect((await one(db.admin<{ updated_amount: string }>(`select updated_amount from public.installments where contract_id = $1 and number = 4`, [contract]))).updated_amount).toBe("11500.00");
    await db.as(financeiro, `select public.admin_set_contract_post_index($1, null)`, [contract]);
  });

  it("fixar a correção: nenhum índice depois do mês fixado; desfazer volta a corrigir", async () => {
    const { id: contract } = await one(db.admin<{ id: string }>(`select c.id from public.financial_contracts c join public.units u on u.id = c.unit_id where u.code = 'CUB-1'`));
    await db.as(financeiro, `select public.admin_set_contract_post_index($1, 'INPC')`, [contract]);
    await db.as(financeiro, `select public.admin_set_habite_se($1, $2)`, [MAUI, month(-2)]);
    const v = async () => db.admin<{ number: number; updated_amount: string; is_estimate: boolean }>(
      `select number, updated_amount, is_estimate from public.installments where contract_id = $1 and number in (3, 4) order by number`, [contract]);
    expect((await v()).map((x) => x.updated_amount)).toEqual(["10605.00", "10605.00"]); // CUB do Habite-se × INPC de 1%
    await expect(db.as(atendimento, `select public.admin_freeze_contract_index($1, $2)`, [contract, month(-2)])).rejects.toThrow(/acesso negado/);
    await db.as(financeiro, `select public.admin_freeze_contract_index($1, $2)`, [contract, month(-2)]);
    // Fixada no mês do Habite-se: sem INPC; e não é mais estimativa (nada a esperar).
    expect(await v()).toEqual([
      { number: 3, updated_amount: "10500.00", is_estimate: false },
      { number: 4, updated_amount: "10500.00", is_estimate: false },
    ]);
    await db.as(financeiro, `select public.admin_freeze_development_index($1, null)`, [MAUI]);
    expect((await v()).map((x) => x.updated_amount)).toEqual(["10605.00", "10605.00"]);
    await db.as(financeiro, `select public.admin_set_habite_se($1, null)`, [MAUI]);
    await db.as(financeiro, `select public.admin_set_contract_post_index($1, null)`, [contract]);
  });
});

