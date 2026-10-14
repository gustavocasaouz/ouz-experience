import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { UMAN, makeAdmin, makeClientWithUnit, makeOperator } from "./fixtures";

// Correções da auditoria de 14/10/2026.
let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let clientes: Claims;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
  clientes = (await makeOperator(db, admin.aal2, "clientes@t.ouz", ["clientes"])).aal2;
});
afterAll(async () => db.close());

describe("portal do cliente liberado por empreendimento", () => {
  it("cliente com unidade em empreendimento fechado não vê nada até a OUZ liberar", async () => {
    const c = await makeClientWithUnit(db, clientes, "uman@cli.ouz", "DEMO-101", UMAN);
    await db.admin(`update public.developments set client_portal_enabled = false where id = $1`, [UMAN]);
    expect(await db.as(c.claims, `select id from public.developments where id = $1`, [UMAN])).toHaveLength(0);
    expect(await db.as(c.claims, `select id from public.units where id = $1`, [c.unitId])).toHaveLength(0);
    expect((await db.as<{ ok: boolean }>(c.claims, `select public.is_client_of_unit($1) as ok`, [c.unitId]))[0]!.ok).toBe(false);
    await db.admin(`update public.developments set client_portal_enabled = true where id = $1`, [UMAN]);
    expect(await db.as(c.claims, `select id from public.units where id = $1`, [c.unitId])).toHaveLength(1);
  });
});

describe("equipe não se autopromove por convite", () => {
  it("operador com 'administracao' não convida o próprio e-mail nem concede administração", async () => {
    const op = await makeOperator(db, admin.aal2, "gestor@t.ouz", ["administracao"]);
    await expect(db.as(op.aal2, `select public.create_staff_invitation('gestor@t.ouz', 'operador', '{administracao,financeiro}')`))
      .rejects.toThrow(/somente administradores|próprio e-mail/);
    await expect(db.as(op.aal2, `select public.create_staff_invitation('gestor@t.ouz', 'operador', '{financeiro}')`)).rejects.toThrow(/próprio e-mail/);
    await expect(db.as(op.aal2, `select public.create_staff_invitation('clientes@t.ouz', 'operador', '{financeiro}')`)).rejects.toThrow(/já faz parte da equipe/);
    expect(await db.as(op.aal2, `select public.create_staff_invitation('novo@t.ouz', 'operador', '{financeiro}')`)).toHaveLength(1);
    expect(await db.as(admin.aal2, `select public.create_staff_invitation('outro@t.ouz', 'operador', '{administracao}')`)).toHaveLength(1);
  });
});

describe("pré-lançamento respeita empreendimento oculto", () => {
  it("janela aberta não dá acesso a empreendimento oculto nem com campanha encerrada", async () => {
    const r = await db.admin<{ src: string }>(`select prosrc as src from pg_proc where proname = 'broker_has_open_window'`);
    expect(r[0]!.src).toMatch(/broker_access_mode <> 'oculto'/);
    expect(r[0]!.src).toMatch(/c\.status = 'aberta'/);
  });
});
