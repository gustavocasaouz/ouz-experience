import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, UMAN, makeAdmin, makeBroker, makeOperator } from "./fixtures";

let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let comercial: Awaited<ReturnType<typeof makeOperator>>;
let A: Awaited<ReturnType<typeof makeBroker>>;
let B: Awaited<ReturnType<typeof makeBroker>>;
let C: Awaited<ReturnType<typeof makeBroker>>;

const CLIENT_1 = "52998224725";
const CLIENT_2 = "11144477735";
const CLIENT_3 = "39053344705";
const CNPJ_1 = "11222333000181";

/** CPF fictício válido gerado a partir de uma semente. */
function cpf(seed: number) {
  const d = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (m: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d;
};
const KEYS = iso(addMonths(24));

/** Condições dentro da política demonstrativa: 30% entrada, 20% em 20 parcelas, 50% nas chaves. */
function terms(price: number, opts: { discount?: number } = {}) {
  const offered = Math.round(price * (1 - (opts.discount ?? 0) / 100) * 100) / 100;
  const entrada = Math.round(offered * 0.3 * 100) / 100;
  const parcela = Math.round((offered * 0.2) / 20 * 100) / 100;
  const chaves = Math.round((offered - entrada - parcela * 20) * 100) / 100;
  return {
    offered,
    payments: [
      { kind: "entrada", amount: entrada, quantity: 1, first_due: iso(new Date(Date.now() + 86_400_000)) },
      { kind: "parcela", amount: parcela, quantity: 20, first_due: iso(addMonths(1)), interval_months: 1 },
      { kind: "chaves", amount: chaves, quantity: 1, first_due: KEYS },
    ],
  };
}

async function unitId(dev: string, code: string) {
  const [u] = await db.admin<{ id: string }>(`select id from public.units where development_id = $1 and code = $2`, [dev, code]);
  return u.id;
}
async function currentPrice(unit: string) {
  const [r] = await db.admin<{ price: string }>(
    `select pti.price from public.price_table_items pti join public.price_tables pt on pt.id = pti.price_table_id
     where pti.unit_id = $1 and pt.status = 'vigente'`,
    [unit],
  );
  return Number(r.price);
}

let keySeq = 0;
async function draft(broker: Claims, unit: string, client: string, t: ReturnType<typeof terms>, extra: { registration?: string } = {}) {
  const [{ id }] = await db.as<{ id: string }>(
    broker,
    `select public.broker_save_proposal_draft(null, $1, 'Cliente Teste', $2, $3, $4::jsonb, null, $5, $6) as id`,
    [unit, client, t.offered, JSON.stringify(t.payments), extra.registration ?? null, `k${++keySeq}`],
  );
  return id;
}
async function submit(broker: Claims, id: string, requestAnalysis = false) {
  const [{ r }] = await db.as<{ r: { status: string; within: boolean; evaluation: { criteria: Array<{ code: string; ok: boolean | null }> } } }>(
    broker,
    `select public.broker_submit_proposal($1, $2) as r`,
    [id, requestAnalysis],
  );
  return r;
}
const statusOf = async (id: string) =>
  (await db.admin<{ status: string }>(`select status from public.proposals where id = $1`, [id]))[0].status;
const reservationOf = async (proposalId: string) =>
  (
    await db.admin<{ id: string; status: string; starts_at: Date; expires_at: Date }>(
      `select id, status, starts_at, expires_at from public.reservations where proposal_id = $1`,
      [proposalId],
    )
  )[0];
const runDeadlines = async () => (await db.admin<{ r: Record<string, number> }>(`select public.process_reservation_deadlines() as r`))[0].r;
const expireNow = (reservationId: string) =>
  db.admin(`update public.reservations set expires_at = now() - interval '1 minute' where id = $1`, [reservationId]);

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
  comercial = await makeOperator(db, admin.aal2, "comercial2@teste.ouz", ["comercial", "politicas", "documentos"]);
  A = await makeBroker(db, "a@teste.ouz", "71428793860", "2001", { approveWith: admin.aal2 });
  B = await makeBroker(db, "b@teste.ouz", "86288366757", "2002", { approveWith: admin.aal2 });
  C = await makeBroker(db, "c@teste.ouz", "45317828791", "2003", { approveWith: admin.aal2 });
  await db.admin(`update public.development_commercial_settings set keys_expected_date = $1 where development_id in ($2, $3)`, [KEYS, SOHO, MAUI]);
});
afterAll(async () => db.close());

describe("avaliação de política", () => {
  it("prévia (só OUZ) indica critérios atendidos e não atendidos", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const price = await currentPrice(u);
    const ok = terms(price);
    const [{ e }] = await db.as<{ e: { within: boolean } }>(comercial.aal2, `select public.broker_preview_evaluation($1, $2, $3::jsonb, $4) as e`, [
      u, ok.offered, JSON.stringify(ok.payments), CLIENT_1,
    ]);
    expect(e.within).toBe(true);
    const bad = terms(price, { discount: 10 });
    const [{ e: e2 }] = await db.as<{ e: { within: boolean; criteria: Array<{ code: string; ok: boolean }> } }>(
      comercial.aal2,
      `select public.broker_preview_evaluation($1, $2, $3::jsonb, $4) as e`,
      [u, bad.offered, JSON.stringify(bad.payments), CLIENT_1],
    );
    expect(e2.within).toBe(false);
    expect(e2.criteria.find((c) => c.code === "desconto_maximo")?.ok).toBe(false);
  });

  it("CNPJ exige análise pela política demonstrativa", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const t = terms(await currentPrice(u));
    const [{ e }] = await db.as<{ e: { within: boolean; criteria: Array<{ code: string }> } }>(
      comercial.aal2,
      `select public.broker_preview_evaluation($1, $2, $3::jsonb, $4) as e`,
      [u, t.offered, JSON.stringify(t.payments), CNPJ_1],
    );
    expect(e.within).toBe(false);
    expect(e.criteria.map((c) => c.code)).toContain("analise_obrigatoria");
  });
});

describe("regras ocultas do corretor", () => {
  it("corretor não faz prévia, não lê snapshot de regras/avaliação e o envio não devolve critérios", async () => {
    const u = await unitId(SOHO, "DEMO-102");
    const t = terms(await currentPrice(u), { discount: 10 });
    await expect(
      db.as(A.claims, `select public.broker_preview_evaluation($1, $2, $3::jsonb, $4)`, [u, t.offered, JSON.stringify(t.payments), CLIENT_1]),
    ).rejects.toThrow(/acesso negado/);
    const id = await draft(A.claims, u, cpf(912000001), t);
    const r = await submit(A.claims, id);
    expect(r).toEqual({ status: "rascunho", within: false });
    await expect(db.as(A.claims, `select policy_rules from public.proposals where id = $1`, [id])).rejects.toThrow(/permission denied/);
    await expect(db.as(A.claims, `select evaluation from public.proposals where id = $1`, [id])).rejects.toThrow(/permission denied/);
    await expect(db.as(A.claims, `select * from public.admin_proposal_evaluation($1)`, [id])).rejects.toThrow(/acesso negado/);
    await expect(db.as(A.claims, `select public._broker_submit_proposal_full($1, false)`, [id])).rejects.toThrow(/permission denied/);
    const [ev] = await db.as<{ evaluation: { within: boolean } | null }>(comercial.aal2, `select * from public.admin_proposal_evaluation($1)`, [id]);
    expect(ev).toBeDefined();
    await db.as(A.claims, `select public.broker_withdraw_proposal($1, 'teste')`, [id]);
  });
});

describe("propostas, reserva de 48 h e fila", () => {
  it("sem nome e CPF/CNPJ válido a proposta fica só como rascunho", async () => {
    const u = await unitId(SOHO, "DEMO-104");
    const t = terms(await currentPrice(u));
    const [{ id }] = await db.as<{ id: string }>(
      A.claims,
      `select public.broker_save_proposal_draft(null, $1, '', '123', $2, $3::jsonb, null, null, 'semdoc') as id`,
      [u, t.offered, JSON.stringify(t.payments)],
    );
    await expect(submit(A.claims, id)).rejects.toThrow(/rascunho/);
    expect(await statusOf(id)).toBe("rascunho");
  });

  it("dentro da política: reserva criada na hora, com prazo de 48 h a partir da reserva", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const id = await draft(A.claims, u, CLIENT_1, terms(await currentPrice(u)));
    const r = await submit(A.claims, id);
    expect(r.status).toBe("reservada");
    const res = await reservationOf(id);
    expect(res.status).toBe("aguardando_documentos");
    const hours = (new Date(res.expires_at).getTime() - new Date(res.starts_at).getTime()) / 3_600_000;
    expect(hours).toBe(48);
    expect(Math.abs(Date.now() - new Date(res.starts_at).getTime())).toBeLessThan(60_000);
    const [{ status }] = await db.admin<{ status: string }>(`select status from public.units where id = $1`, [u]);
    expect(status).toBe("reservada");
  });

  it("reenvio é idempotente e rascunho com a mesma chave não duplica", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const t = terms(await currentPrice(u));
    const q = `select public.broker_save_proposal_draft(null, $1, 'Cliente', $2, $3, $4::jsonb, null, null, 'mesma-chave') as id`;
    const [{ id: id1 }] = await db.as<{ id: string }>(B.claims, q, [u, CLIENT_2, t.offered, JSON.stringify(t.payments)]);
    const [{ id: id2 }] = await db.as<{ id: string }>(B.claims, q, [u, CLIENT_2, t.offered, JSON.stringify(t.payments)]);
    expect(id1).toBe(id2);
    const first = await submit(B.claims, id1);
    const again = await submit(B.claims, id1);
    expect(first.status).toBe("na_fila"); // unidade já reservada por A
    expect(again).toMatchObject({ status: "na_fila", idempotent: true });
  });

  it("proposta na fila não inicia prazo; corretor não vê propostas nem reservas de outros", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const mine = await db.as<{ status: string }>(B.claims, `select status from public.proposals where unit_id = $1`, [u]);
    expect(mine.map((p) => p.status)).toEqual(["na_fila"]);
    expect(await db.as(B.claims, `select * from public.reservations`)).toHaveLength(0);
  });

  it("uma única reserva ativa por unidade (barreira do banco)", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const [p] = await db.admin<{ id: string; development_id: string }>(
      `select id, development_id from public.proposals where unit_id = $1 and status = 'na_fila' limit 1`,
      [u],
    );
    await expect(
      db.admin(
        `insert into public.reservations (proposal_id, unit_id, development_id, broker_user_id, person_type, expires_at)
         values ($1, $2, $3, $4, 'pf', now() + interval '48 hours')`,
        [p.id, u, p.development_id, B.id],
      ),
    ).rejects.toThrow(/reservations_one_active_per_unit/);
  });

  it("fora da política: mostra critérios; só vai para análise se o corretor pedir; aprovação da OUZ põe na fila", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const id = await draft(C.claims, u, CLIENT_3, terms(await currentPrice(u), { discount: 10 }));
    const r1 = await submit(C.claims, id);
    expect(r1.status).toBe("rascunho");
    expect(r1.within).toBe(false);
    const r2 = await submit(C.claims, id, true);
    expect(r2.status).toBe("em_analise");
    await expect(db.as(C.claims, `select public.admin_decide_proposal($1, true, 'ok')`, [id])).rejects.toThrow(/acesso negado/);
    const [{ r }] = await db.as<{ r: { status: string } }>(comercial.aal2, `select public.admin_decide_proposal($1, true, 'Exceção aprovada') as r`, [id]);
    expect(r.status).toBe("na_fila");
  });

  it("mesmo cliente por outro corretor vai para análise, sem revelar o outro corretor", async () => {
    const u = await unitId(SOHO, "DEMO-102");
    const id = await draft(C.claims, u, CLIENT_1, terms(await currentPrice(u))); // CLIENT_1 já tem proposta ativa de A
    const r = await submit(C.claims, id);
    expect(r.status).toBe("em_analise");
    const [{ analysis_reasons }] = await db.admin<{ analysis_reasons: string[] }>(`select analysis_reasons from public.proposals where id = $1`, [id]);
    expect(analysis_reasons).toContain("duplicidade_cliente");
    const visible = await db.as(C.claims, `select broker_user_id from public.proposals`);
    expect(visible.every((v: Record<string, unknown>) => v.broker_user_id === C.id)).toBe(true);
  });
});

describe("documentação, expiração e avanço da fila", () => {
  it("documentação completa enviada no prazo: a reserva não expira por demora da OUZ", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const [p] = await db.admin<{ id: string }>(`select id from public.proposals where unit_id = $1 and status = 'reservada'`, [u]);
    const res = await reservationOf(p.id);
    const items = await db.as<{ id: string; required: boolean }>(A.claims, `select id, required from public.reservation_items where reservation_id = $1`, [res.id]);
    expect(items.length).toBeGreaterThan(0);
    await expect(db.as(A.claims, `select public.broker_submit_reservation_documents($1)`, [res.id])).rejects.toThrow(/pendentes/);
    for (const it of items.filter((i) => i.required)) {
      await db.as(A.claims, `select public.broker_add_reservation_file($1, $2, 'application/pdf', 100)`, [it.id, `${res.id}/${it.id}.pdf`]);
    }
    await expect(
      db.as(B.claims, `select public.broker_add_reservation_file($1, $2, 'application/pdf', 1)`, [items[0].id, `${res.id}/x.pdf`]),
    ).rejects.toThrow(/acesso negado/);
    await db.as(A.claims, `select public.broker_submit_reservation_documents($1)`, [res.id]);
    await expireNow(res.id); // prazo original passa enquanto a OUZ confere
    await runDeadlines();
    expect((await reservationOf(p.id)).status).toBe("documentacao_enviada");
  });

  it("sem documentação no prazo: expira, a próxima da fila recebe reserva com 48 h novas; reprocessar não duplica avisos", async () => {
    const u = await unitId(MAUI, "DEMO-101");
    const price = await currentPrice(u);
    const pa = await draft(A.claims, u, CLIENT_2, terms(price));
    expect((await submit(A.claims, pa)).status).toBe("reservada");
    const pb = await draft(B.claims, u, CLIENT_3, terms(price));
    expect((await submit(B.claims, pb)).status).toBe("na_fila");
    const resA = await reservationOf(pa);
    await expireNow(resA.id);

    const first = await runDeadlines();
    expect(first.reservas_expiradas).toBe(1);
    expect(await statusOf(pa)).toBe("expirada");
    expect(await statusOf(pb)).toBe("reservada");
    const resB = await reservationOf(pb);
    const hoursLeft = (new Date(resB.expires_at).getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(47.9);

    const second = await runDeadlines();
    expect(second.reservas_expiradas).toBe(0);
    const notif = await db.admin(`select 1 from public.notifications where user_id = $1 and kind = 'reserva_criada'`, [B.id]);
    expect(notif).toHaveLength(1);
    const emails = await db.admin(`select 1 from public.notification_outbox where recipient_user_id = $1 and dedupe_key like 'email:reserva:%:criada:%'`, [B.id]);
    expect(emails).toHaveLength(1);
  });

  it("desistência libera a unidade para a próxima elegível", async () => {
    const u = await unitId(MAUI, "DEMO-102");
    const price = await currentPrice(u);
    const pa = await draft(A.claims, u, cpf(800000001), terms(price));
    await submit(A.claims, pa);
    const pc = await draft(C.claims, u, cpf(800000002), terms(price));
    expect((await submit(C.claims, pc)).status).toBe("na_fila");
    await db.as(A.claims, `select public.broker_withdraw_proposal($1, 'Cliente desistiu')`, [pa]);
    expect(await statusOf(pa)).toBe("retirada");
    expect(await statusOf(pc)).toBe("reservada");
  });

  it("pendências após conferência: prazo de regularização configurável e expiração", async () => {
    const u = await unitId(MAUI, "DEMO-103");
    const pa = await draft(A.claims, u, cpf(800000003), terms(await currentPrice(u)));
    await submit(A.claims, pa);
    const res = await reservationOf(pa);
    const items = await db.as<{ id: string; required: boolean }>(A.claims, `select id, required from public.reservation_items where reservation_id = $1`, [res.id]);
    for (const it of items) await db.as(A.claims, `select public.broker_add_reservation_file($1, $2, 'application/pdf', 1)`, [it.id, `${res.id}/${it.id}.pdf`]);
    await db.as(A.claims, `select public.broker_submit_reservation_documents($1)`, [res.id]);
    await db.as(comercial.aal2, `select public.admin_review_reservation_item($1, false, 'Ilegível')`, [items[0].id]);
    for (const it of items.slice(1)) await db.as(comercial.aal2, `select public.admin_review_reservation_item($1, true, null)`, [it.id]);
    const [{ s }] = await db.as<{ s: string }>(comercial.aal2, `select public.admin_conclude_document_review($1) as s`, [res.id]);
    expect(s).toBe("pendencias_documentacao");
    const [r] = await db.admin<{ regularization_deadline: Date }>(`select regularization_deadline from public.reservations where id = $1`, [res.id]);
    expect((new Date(r.regularization_deadline).getTime() - Date.now()) / 3_600_000).toBeGreaterThan(23.9);
    await db.admin(`update public.reservations set regularization_deadline = now() - interval '1 minute' where id = $1`, [res.id]);
    await runDeadlines();
    expect((await reservationOf(pa)).status).toBe("expirada");
  });

  it("extensão de prazo exige permissão e motivo, e é auditada", async () => {
    const u = await unitId(MAUI, "DEMO-104");
    const pa = await draft(A.claims, u, cpf(800000004), terms(await currentPrice(u)));
    await submit(A.claims, pa);
    const res = await reservationOf(pa);
    await expect(db.as(A.claims, `select public.admin_extend_reservation($1, 24, 'pedido do corretor')`, [res.id])).rejects.toThrow(/acesso negado/);
    await expect(db.as(comercial.aal2, `select public.admin_extend_reservation($1, 24, '')`, [res.id])).rejects.toThrow(/motivo/);
    await db.as(comercial.aal2, `select public.admin_extend_reservation($1, 24, 'Cartório fechado no feriado')`, [res.id]);
    const after = await reservationOf(pa);
    expect((new Date(after.expires_at).getTime() - new Date(res.expires_at).getTime()) / 3_600_000).toBe(24);
    expect(await db.admin(`select 1 from public.audit_log where action = 'reserva_prazo_estendido' and entity_id = $1`, [res.id])).toHaveLength(1);
  });
});

describe("versões comerciais preservadas", () => {
  it("proposta guarda tabela e política usadas; versão publicada é imutável; fila é reavaliada na tabela nova", async () => {
    const u = await unitId(SOHO, "DEMO-103");
    const price = await currentPrice(u);
    const pa = await draft(A.claims, u, cpf(800000005), terms(price));
    await submit(A.claims, pa);
    const pb = await draft(B.claims, u, cpf(800000006), terms(price, { discount: 4 })); // dentro (desconto máx. 5%)
    expect((await submit(B.claims, pb)).status).toBe("na_fila");
    const [before] = await db.admin<{ price_table_id: string; table_price: string; sales_policy_id: string }>(
      `select price_table_id, table_price, sales_policy_id from public.proposals where id = $1`,
      [pa],
    );

    // nova tabela +10%
    const [{ id: draftId }] = await db.as<{ id: string }>(comercial.aal2, `select public.admin_create_price_table_draft($1, true) as id`, [SOHO]);
    await db.as(comercial.aal2, `update public.price_table_items set price = round(price * 1.10, 2) where price_table_id = $1`, [draftId]);
    await db.as(comercial.aal2, `select public.admin_publish_price_table($1, 'Reajuste')`, [draftId]);
    await expect(db.admin(`update public.price_table_items set price = 1 where price_table_id = $1`, [before.price_table_id])).rejects.toThrow(/imutáveis/);
    await expect(db.admin(`update public.sales_policies set rules = '{}' where id = $1`, [before.sales_policy_id])).rejects.toThrow(/imutável/);

    const [after] = await db.admin<{ price_table_id: string; table_price: string }>(`select price_table_id, table_price from public.proposals where id = $1`, [pa]);
    expect(after).toEqual({ price_table_id: before.price_table_id, table_price: before.table_price });

    // A expira; B é reavaliada na tabela nova (agora ~13% abaixo) → análise, unidade livre
    await expireNow((await reservationOf(pa)).id);
    await runDeadlines();
    expect(await statusOf(pb)).toBe("em_analise");
    const [{ status }] = await db.admin<{ status: string }>(`select status from public.units where id = $1`, [u]);
    expect(status).toBe("disponivel");
  });
});

describe("visibilidade de preços e pré-lançamento (UMAN)", () => {
  it("sem janela, corretor aprovado não vê preços nem unidades do UMAN e não envia proposta", async () => {
    const u = await unitId(UMAN, "DEMO-101");
    expect(await db.as(A.claims, `select * from public.price_table_items where unit_id = $1`, [u])).toHaveLength(0);
    expect(await db.as(A.claims, `select * from public.units where id = $1`, [u])).toHaveLength(0);
    await expect(
      db.as(A.claims, `select public.broker_save_proposal_draft(null, $1, 'X Y', $2, 1000, '[]'::jsonb, null, null, 'uman1')`, [u, CLIENT_1]),
    ).rejects.toThrow(/indisponível/);
    await expect(db.as("anon", `select * from public.price_table_items`)).rejects.toThrow(/permission denied/);
  });

  it("registro de interesse: limite por cliente, duplicidade em análise, onda, janela e proposta", async () => {
    const [{ id: campaign }] = await db.admin<{ id: string }>(`select id from public.prelaunch_campaigns where development_id = $1`, [UMAN]);
    const reg = async (b: Claims, doc: string, key: string) =>
      (await db.as<{ r: { id: string; status: string } }>(b, `select public.broker_register_prelaunch($1, 'Cliente UMAN', $2, '3 dormitórios', $3) as r`, [campaign, doc, key]))[0].r;

    const ra = await reg(A.claims, CLIENT_1, "u1");
    expect(ra.status).toBe("registrado");
    expect((await reg(A.claims, CLIENT_1, "u1")).id).toBe(ra.id); // idempotente
    await expect(reg(A.claims, CLIENT_1, "u2")).rejects.toThrow(/limite/);
    const rb = await reg(B.claims, CLIENT_2, "u3");
    const rc = await reg(C.claims, CLIENT_2, "u4");
    expect(rc.status).toBe("em_analise_duplicidade");
    expect(await db.as(C.claims, `select * from public.prelaunch_registrations`)).toHaveLength(1);

    const [{ id: wave }] = await db.as<{ id: string }>(comercial.aal2, `insert into public.prelaunch_waves (campaign_id, name) values ($1, 'Onda 1') returning id`, [campaign]);
    const [{ n }] = await db.as<{ n: number }>(comercial.aal2, `select public.admin_fill_wave($1, 1) as n`, [wave]);
    expect(n).toBe(1); // só A (primeiro registro) entra
    await db.as(comercial.aal2, `select public.admin_open_wave_window($1, now() - interval '1 minute', now() + interval '2 days')`, [wave]);

    const u = await unitId(UMAN, "DEMO-102");
    expect(await db.as(A.claims, `select * from public.price_table_items where unit_id = $1`, [u])).toHaveLength(1);
    expect(await db.as(B.claims, `select * from public.price_table_items where unit_id = $1`, [u])).toHaveLength(0);

    const t = terms(await currentPrice(u));
    await db.admin(`update public.development_commercial_settings set keys_expected_date = $1 where development_id = $2`, [KEYS, UMAN]);
    const wrongClient = await draft(A.claims, u, CLIENT_3, t, { registration: ra.id });
    await expect(submit(A.claims, wrongClient)).rejects.toThrow(/mesmo do registro/);
    const okId = await draft(A.claims, u, CLIENT_1, t, { registration: ra.id });
    expect((await submit(A.claims, okId)).status).toBe("reservada");
    const [{ status }] = await db.admin<{ status: string }>(`select status from public.prelaunch_registrations where id = $1`, [ra.id]);
    expect(status).toBe("proposta_enviada");
    expect(rb.status).toBe("registrado");
  });
});

describe("hash de documento no banco", () => {
  it("hash enviado pelo cliente é ignorado e CPF inválido é recusado", async () => {
    const [b] = await db.admin<{ cpf_hash: string }>(`select cpf_hash from public.broker_profiles where user_id = $1`, [A.id]);
    expect(b.cpf_hash).not.toMatch(/^hash-/);
    expect(b.cpf_hash).toHaveLength(64);
    const id = await db.createUser("cpf-invalido@teste.ouz");
    await expect(
      db.as(
        { sub: id },
        `insert into public.broker_profiles (user_id, full_name, cpf, cpf_hash, creci_number, creci_uf, email, phone, city, region, terms_version, privacy_version, terms_accepted_at)
         values ($1, 'Fulano de Tal', '12345678900', 'x', '1', 'SC', 'x@x.com', '48999990000', 'Fpolis', 'SC', 'v', 'v', now())`,
        [id],
      ),
    ).rejects.toThrow(/cpf_valido/);
  });
});

describe("consultas comerciais", () => {
  it("preços vigentes só para quem pode ver; fila só para a OUZ", async () => {
    expect((await db.as(A.claims, `select * from public.current_unit_prices($1)`, [SOHO])).length).toBe(4);
    expect(await db.as(B.claims, `select * from public.current_unit_prices($1)`, [UMAN])).toHaveLength(0);
    const u = await unitId(SOHO, "DEMO-101");
    await expect(db.as(A.claims, `select * from public.admin_unit_queue($1)`, [u])).rejects.toThrow(/acesso negado/);
    const q = await db.as<{ queue_position: number }>(comercial.aal2, `select * from public.admin_unit_queue($1)`, [u]);
    expect(q.map((r) => r.queue_position)).toEqual(q.map((_, i) => i + 1));
  });
});

describe("contagem da fila por unidade", () => {
  it("corretor vê só números; sem acesso a preços não vê; OUZ pode desligar", async () => {
    const u = await unitId(SOHO, "DEMO-101");
    const rows = await db.as<{ unit_id: string; queue_count: number }>(A.claims, `select * from public.unit_queue_counts($1)`, [SOHO]);
    expect(Object.keys(rows[0]).sort()).toEqual(["queue_count", "unit_id"]);
    const [{ n }] = await db.admin<{ n: number }>(`select count(*)::int n from public.proposals where unit_id = $1 and status = 'na_fila'`, [u]);
    expect(rows.find((r) => r.unit_id === u)?.queue_count).toBe(n);
    expect(await db.as(C.claims, `select * from public.unit_queue_counts($1)`, [UMAN])).toHaveLength(0); // C não tem janela no UMAN
    expect((await db.as(A.claims, `select * from public.unit_queue_counts($1)`, [UMAN])).length).toBe(4); // A tem janela aberta
    await db.admin(`update public.development_commercial_settings set show_queue_count = false where development_id = $1`, [SOHO]);
    expect(await db.as(A.claims, `select * from public.unit_queue_counts($1)`, [SOHO])).toHaveLength(0);
    expect((await db.as(comercial.aal2, `select * from public.unit_queue_counts($1)`, [SOHO])).length).toBe(4);
    await db.admin(`update public.development_commercial_settings set show_queue_count = true where development_id = $1`, [SOHO]);
  });
});
