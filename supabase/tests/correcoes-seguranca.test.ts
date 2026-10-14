import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, makeAdmin, makeBroker, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let comercial: Claims, clientesOp: Claims;
const one = async <T,>(p: Promise<T[]>) => (await p)[0] as T;

function cpf(seed: number) {
  const d = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    const s = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const KEYS = iso(new Date(Date.now() + 730 * 86_400_000));
const unitId = async (dev: string, code: string) => (await one(db.admin<{ id: string }>(`select id from public.units where development_id = $1 and code = $2`, [dev, code]))).id;
async function terms(unit: string) {
  const { price } = await one(db.admin<{ price: string }>(`select pti.price from public.price_table_items pti join public.price_tables pt on pt.id = pti.price_table_id where pti.unit_id = $1 and pt.status = 'vigente'`, [unit]));
  const p = Number(price);
  return { offered: p, payments: [
    { kind: "entrada", amount: Math.round(p * 0.3 * 100) / 100, quantity: 1, first_due: iso(new Date(Date.now() + 86_400_000)) },
    { kind: "parcela", amount: Math.round(p * 0.01 * 100) / 100, quantity: 20, first_due: iso(new Date(Date.now() + 31 * 86_400_000)), interval_months: 1 },
    { kind: "chaves", amount: Math.round((p - Math.round(p * 0.3 * 100) / 100 - Math.round(p * 0.01 * 100) / 100 * 20) * 100) / 100, quantity: 1, first_due: KEYS },
  ] };
}
let k = 0;
async function submit(b: Claims, unit: string, doc: string) {
  const t = await terms(unit);
  const { id } = await one(db.as<{ id: string }>(b, `select public.broker_save_proposal_draft(null, $1, 'Cliente', $2, $3, $4::jsonb, null, null, $5) as id`, [unit, doc, t.offered, JSON.stringify(t.payments), `s${++k}`]));
  return { id, r: (await one(db.as<{ r: { status: string } }>(b, `select public.broker_submit_proposal($1, false) as r`, [id]))).r };
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
  comercial = (await makeOperator(db, admin.aal2, "com@t.ouz", ["comercial", "conteudo"])).aal2;
  clientesOp = (await makeOperator(db, admin.aal2, "cliop@t.ouz", ["clientes"])).aal2;
  await db.admin(`update public.development_commercial_settings set keys_expected_date = $1`, [KEYS]);
});
afterAll(async () => db.close());

describe("1. anti-bloqueio de unidades", () => {
  it("corretor não passa do limite de propostas ativas por empreendimento e tem carência após expirar", async () => {
    const b = await makeBroker(db, "abuso@t.ouz", "71428793860", "3001", { approveWith: admin.aal2 });
    for (const code of ["DEMO-101", "DEMO-102", "DEMO-103"]) expect((await submit(b.claims, await unitId(SOHO, code), cpf(600000000 + k))).r.status).toBe("reservada");
    await expect(submit(b.claims, await unitId(SOHO, "DEMO-104"), cpf(610000000))).rejects.toThrow(/limite de propostas ativas/);
    const u = await unitId(MAUI, "DEMO-101");
    const { id } = await submit(b.claims, u, cpf(620000000));
    await db.admin(`update public.reservations set expires_at = now() - interval '1 minute' where proposal_id = $1`, [id]);
    await db.admin(`select public.process_reservation_deadlines()`);
    await expect(submit(b.claims, u, cpf(630000000))).rejects.toThrow(/encerrada recentemente/);
  });
});

describe("3. arquivos de corretor e mídia de cliente arquivo a arquivo", () => {
  it("rascunho e tabela/planta sem liberação de preço não são lidos", async () => {
    const b = await makeBroker(db, "mat@t.ouz", "86288366757", "3002", { approveWith: admin.aal2 });
    await db.admin(`insert into public.broker_materials (development_id, kind, title, storage_path, is_published) values
      ($1, 'apresentacao', 'Pub', $2, true), ($1, 'apresentacao', 'Rasc', $3, false), ($1, 'tabela', 'Tab', $4, true)`,
      [MAUI, `${MAUI}/pub.pdf`, `${MAUI}/rasc.pdf`, `${MAUI}/tab.pdf`]);
    for (const n of ["pub", "rasc", "tab"]) await db.admin(`insert into storage.objects (bucket_id, name) values ('broker-content', $1)`, [`${MAUI}/${n}.pdf`]);
    await db.admin(`update public.development_commercial_settings set sales_mode = 'pre_lancamento' where development_id = $1`, [MAUI]);
    const files = (await db.as<{ name: string }>(b.claims, `select name from storage.objects where bucket_id = 'broker-content' and name like $1`, [`${MAUI}/%`])).map((r) => r.name);
    expect(files).toEqual([`${MAUI}/pub.pdf`]);
    expect((await db.as<{ title: string }>(b.claims, `select title from public.broker_materials where development_id = $1`, [MAUI])).map((r) => r.title)).toEqual(["Pub"]);
    await db.admin(`update public.development_commercial_settings set sales_mode = 'aberto' where development_id = $1`, [MAUI]);
  });
});

describe("4 e 5. isolamento por cliente e permissão Clientes", () => {
  it("cotitular não lê chamado nem concierge de outro cliente da mesma unidade; equipe não aceita convite de cliente", async () => {
    const c1 = await makeClientWithUnit(db, clientesOp, "c1@t.ouz", "DEMO-104", SOHO);
    const c2 = await makeClientWithUnit(db, clientesOp, "c2@t.ouz", "DEMO-104", SOHO);
    const { id } = await one(db.as<{ id: string }>(c1.claims, `select public.client_open_ticket($1, 'duvida_administrativa', 'Pessoal', 'Detalhes pessoais do c1') as id`, [c1.unitId]));
    expect(await db.as(c2.claims, `select id from public.tickets`)).toHaveLength(0);
    await expect(db.as(c2.claims, `select public.post_ticket_message($1, 'oi', false)`, [id])).rejects.toThrow(/acesso negado/);
    const notif = await db.admin(`select 1 from public.notifications where kind = 'vinculo_adicional'`);
    expect(notif.length).toBeGreaterThan(0);

    const [cl] = await db.as<{ id: string }>(clientesOp, `insert into public.clients (full_name, email) values ('Isca', 'cliop@t.ouz') returning id`);
    const { token } = await one(db.as<{ token: string }>(clientesOp, `select public.create_client_invitation($1) as token`, [cl.id]));
    const { id: staffUser } = await one(db.admin<{ id: string }>(`select id from auth.users where email = 'cliop@t.ouz'`));
    await expect(db.as({ sub: staffUser }, `select public.accept_client_invitation($1)`, [token])).rejects.toThrow(/equipe/);
  });
});

describe("6. sem oráculo de duplicidade", () => {
  it("corretor não vê motivo de análise nem duplicidade no pré-lançamento", async () => {
    const a = await makeBroker(db, "o1@t.ouz", "45317828791", "3003", { approveWith: admin.aal2 });
    const b = await makeBroker(db, "o2@t.ouz", "39053344705", "3004", { approveWith: admin.aal2 });
    const doc = cpf(640000000);
    await submit(a.claims, await unitId(MAUI, "DEMO-102"), doc);
    const { id } = await submit(b.claims, await unitId(MAUI, "DEMO-103"), doc);
    await expect(db.as(b.claims, `select analysis_reasons from public.proposals where id = $1`, [id])).rejects.toThrow(/permission denied/);
    const notes = (await db.as<{ note: string }>(b.claims, `select note from public.proposal_events where proposal_id = $1`, [id])).map((r) => r.note).join(" ");
    expect(notes).not.toMatch(/cadastro|duplic/i);
    const [{ reasons }] = await db.as<{ reasons: string[] }>(comercial, `select public.admin_proposal_reasons($1) as reasons`, [id]);
    expect(reasons).toContain("duplicidade_cliente");

    const { id: camp } = await one(db.admin<{ id: string }>(`select id from public.prelaunch_campaigns limit 1`));
    const r1 = await one(db.as<{ r: { status: string } }>(a.claims, `select public.broker_register_prelaunch($1, 'X Y', $2, null, 'p1') as r`, [camp, cpf(650000000)]));
    const r2 = await one(db.as<{ r: { status: string } }>(b.claims, `select public.broker_register_prelaunch($1, 'X Y', $2, null, 'p2') as r`, [camp, cpf(650000000)]));
    expect([r1.r.status, r2.r.status]).toEqual(["registrado", "registrado"]);
    await expect(db.as(b.claims, `select review_required from public.prelaunch_registrations`)).rejects.toThrow(/permission denied/);
  });
});

describe("7, 8, 10. permissões finas", () => {
  it("só Comercial apaga grupos; ocupação de evento e configuração comercial protegidas", async () => {
    const corretores = (await makeOperator(db, admin.aal2, "corr@t.ouz", ["corretores"])).aal2;
    await db.as(comercial, `insert into public.broker_groups (name) values ('G')`);
    await db.as(corretores, `delete from public.broker_groups`);
    expect(await db.admin(`select 1 from public.broker_groups where name = 'G'`)).toHaveLength(1);
    const { id: ev } = await one(db.admin<{ id: string }>(`insert into public.events (title, starts_at, audience, is_published) values ('Privado', now() + interval '3 days', 'convidados', true) returning id`));
    await expect(db.as("anon", `select public.event_seats_taken($1)`, [ev])).rejects.toThrow(/permission denied/);
    const teaserBroker = await makeBroker(db, "teaser@t.ouz", "52998224725", "3005", { approveWith: admin.aal2 });
    const uman = (await one(db.admin<{ id: string }>(`select id from public.developments where slug = 'uman'`))).id;
    expect(await db.as(teaserBroker.claims, `select * from public.development_commercial_settings where development_id = $1`, [uman])).toHaveLength(0);
  });
});
