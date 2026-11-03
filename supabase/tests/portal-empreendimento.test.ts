import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importManual } from "../../scripts/lib/manual.mjs";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, UMAN, makeAdmin, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let conteudo: Claims, atendimento: Claims;
let S: Awaited<ReturnType<typeof makeClientWithUnit>>; // SOHO DEMO-101
let M: Awaited<ReturnType<typeof makeClientWithUnit>>; // MAUI DEMO-101
let U: Awaited<ReturnType<typeof makeClientWithUnit>>; // UMAN DEMO-101
let manualId: string;

const owner = JSON.parse(readFileSync(join(__dirname, "..", "manuais", "soho-proprietario-201.json"), "utf8"));
const open = (c: Claims, unit: string, category: string, item: string | null = null) =>
  db.as<{ id: string }>(c, `select public.client_open_ticket($1, $2, 'Assunto', 'Descrição do caso', $3) as id`, [unit, category, item]);

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  const admin = await makeAdmin(db);
  const op = async (email: string, perms: string[]) => (await makeOperator(db, admin.aal2, email, perms)).aal2;
  conteudo = await op("conteudo@t.ouz", ["conteudo"]);
  atendimento = await op("atendimento@t.ouz", ["atendimento"]);
  const clientes = await op("clientes@t.ouz", ["clientes"]);
  S = await makeClientWithUnit(db, clientes, "s@cli.ouz", "DEMO-101", SOHO);
  M = await makeClientWithUnit(db, clientes, "m@cli.ouz", "DEMO-101", MAUI);
  U = await makeClientWithUnit(db, clientes, "u@cli.ouz", "DEMO-101", UMAN);
  await db.admin(`update public.developments set client_portal_enabled = true`);
  // Manual do proprietário do MAUI para o empreendimento todo, com a tabela de garantias do SOHO como base de teste.
  manualId = (await importManual(db.pg, { ...owner, development_slug: "maui", unit_code: undefined, attachments: [] })).id;
  await db.admin(`update public.development_manuals set is_published = true where id = $1`, [manualId]);
});
afterAll(async () => db.close());

describe("chamados por empreendimento", () => {
  it("só abre categoria liberada no empreendimento", async () => {
    await db.as(conteudo, `update public.developments set client_ticket_categories = '{duvida_administrativa,solicitacao_unidade,pos_entrega,solicitacao_geral}' where id = $1`, [SOHO]);
    await expect(open(S.claims, S.unitId, "assistencia_tecnica")).rejects.toThrow(/categoria indisponível/);
    await expect(open(S.claims, S.unitId, "solicitacao_geral")).resolves.toHaveLength(1);
    await expect(open(S.claims, S.unitId, "concierge")).rejects.toThrow(/categoria indisponível/);
    await expect(db.as(conteudo, `update public.developments set client_ticket_categories = '{concierge}' where id = $1`, [SOHO])).rejects.toThrow(/check/);
  });

  it("assistência técnica pede um item da tabela de garantias ainda vigente", async () => {
    const items = await db.admin<{ id: string; months: number }>(`select id, months from public.manual_warranty_items where manual_id = $1 order by months`, [manualId]);
    const short = items[0]!, long = items[items.length - 1]!;
    expect(short.months).toBeLessThan(long.months);

    // Antes do habite-se: todos os itens valem.
    await expect(open(M.claims, M.unitId, "assistencia_tecnica")).rejects.toThrow(/item ainda em garantia/);
    await expect(open(M.claims, M.unitId, "assistencia_tecnica", short.id)).resolves.toHaveLength(1);

    // Habite-se há (prazo curto + 1) meses: o curto encerrou, o longo continua.
    await db.admin(`update public.developments set habite_se_date = current_date - make_interval(months => $2) where id = $1`, [MAUI, short.months + 1]);
    await expect(open(M.claims, M.unitId, "assistencia_tecnica", short.id)).rejects.toThrow(/item ainda em garantia/);
    const [{ id }] = await open(M.claims, M.unitId, "assistencia_tecnica", long.id);
    const [t] = await db.admin<{ warranty_item: string }>(`select warranty_item from public.tickets where id = $1`, [id]);
    expect(t.warranty_item).toMatch(new RegExp(`· ${long.months} meses$`));

    // Item de outro manual não serve.
    const [other] = await db.admin<{ id: string }>(
      `insert into public.development_manuals (development_id, kind, title) values ($1, 'proprietario', 'Outro') returning id`, [SOHO]);
    const [foreign] = await db.admin<{ id: string }>(
      `insert into public.manual_warranty_items (manual_id, row_number, system, aspect, months, sort_order) values ($1, 1, 'X', 'Y', 600, 1) returning id`, [other.id]);
    await expect(open(M.claims, M.unitId, "assistencia_tecnica", foreign.id)).rejects.toThrow(/item ainda em garantia/);
  });
});

describe("lembrete mensal de manutenção", () => {
  it("um aviso (e um e-mail) por unidade e mês, só com manual e habite-se", async () => {
    await db.admin(`update public.developments set habite_se_date = '2026-01-15' where id = $1`, [MAUI]);
    const run = async (d: string) => (await db.admin<{ n: number }>(`select public.queue_maintenance_reminders($1) as n`, [d]))[0].n;
    expect(await run("2026-01-20")).toBe(0); // mês do habite-se: nada vence
    expect(await run("2026-04-02")).toBe(1);
    expect(await run("2026-04-20")).toBe(0); // mesmo mês: não repete
    const [n] = await db.admin<{ title: string; link: string }>(`select title, link from public.notifications where kind = 'manutencao'`);
    expect(n.title).toBe("Manutenções de abril · unidade DEMO-101");
    expect(n.link).toBe(`/cliente/unidades/${M.unitId}/manual/proprietario/manutencao`);
    expect(await db.admin(`select 1 from public.notification_outbox where dedupe_key like 'email:manutencao:%'`)).toHaveLength(1);

    // Sem a aba do manual, não avisa.
    await db.admin(`update public.developments set client_tabs = '{documentos,financeiro}' where id = $1`, [MAUI]);
    expect(await run("2026-05-02")).toBe(0);
    await db.admin(`update public.developments set client_tabs = default where id = $1`, [MAUI]);
  });

  it("cliente não dispara o lembrete", async () => {
    await expect(db.as(M.claims, `select public.queue_maintenance_reminders()`)).rejects.toThrow(/permission denied/);
  });
});

describe("catálogo de personalização", () => {
  let item: string, standard: string, upgrade: string;

  beforeAll(async () => {
    [{ id: item }] = await db.as<{ id: string }>(conteudo,
      `insert into public.customization_items (development_id, category, title) values ($1, 'Pisos', 'Piso das áreas sociais') returning id`, [UMAN]);
    [{ id: standard }] = await db.as<{ id: string }>(conteudo,
      `insert into public.customization_choices (item_id, title, price, is_standard) values ($1, 'Porcelanato 90×90', 0, true) returning id`, [item]);
    [{ id: upgrade }] = await db.as<{ id: string }>(conteudo,
      `insert into public.customization_choices (item_id, title, price) values ($1, 'Porcelanato 120×120', 12000) returning id`, [item]);
  });

  it("cliente do empreendimento vê o catálogo; outro cliente e quem não tem conteúdo não editam", async () => {
    expect(await db.as(U.claims, `select 1 from public.customization_choices where item_id = $1`, [item])).toHaveLength(2);
    expect(await db.as(M.claims, `select 1 from public.customization_items where id = $1`, [item])).toHaveLength(0);
    await expect(db.as(atendimento, `insert into public.customization_items (development_id, category, title) values ($1, 'X', 'Y')`, [UMAN])).rejects.toThrow(/row-level security/);
    expect(await db.as(atendimento, `delete from public.customization_items where id = $1 returning id`, [item])).toHaveLength(0);
    expect(await db.as(atendimento, `select 1 from public.customization_items where id = $1`, [item])).toHaveLength(1);
    await expect(db.as(U.claims, `insert into public.customization_selections (unit_id, item_id, choice_id) values ($1, $2, $3)`, [U.unitId, item, upgrade])).rejects.toThrow(/permission denied/);
  });

  it("escolhe, troca e envia os upgrades como solicitação de personalização", async () => {
    await expect(db.as(U.claims, `select public.client_submit_customization_choices($1)`, [U.unitId])).rejects.toThrow(/ao menos um upgrade/);
    await db.as(U.claims, `select public.client_choose_customization($1, $2)`, [U.unitId, standard]);
    await db.as(U.claims, `select public.client_choose_customization($1, $2)`, [U.unitId, upgrade]);
    expect(await db.as(U.claims, `select choice_id from public.customization_selections where unit_id = $1`, [U.unitId])).toEqual([{ choice_id: upgrade }]);
    await expect(db.as(M.claims, `select public.client_choose_customization($1, $2)`, [M.unitId, upgrade])).rejects.toThrow(/opção indisponível/);

    const [{ id }] = await db.as<{ id: string }>(U.claims, `select public.client_submit_customization_choices($1) as id`, [U.unitId]);
    const [r] = await db.as<{ description: string }>(atendimento, `select description from public.customization_requests where id = $1`, [id]);
    expect(r.description).toBe("Pisos · Piso das áreas sociais: Porcelanato 120×120 (+ R$ 12.000,00)\n\nTotal de referência: R$ 12.000,00");
  });

  it("sem a aba de personalização, não escolhe", async () => {
    await db.admin(`update public.developments set client_tabs = '{documentos}' where id = $1`, [UMAN]);
    await expect(db.as(U.claims, `select public.client_choose_customization($1, $2)`, [U.unitId, standard])).rejects.toThrow(/opção indisponível/);
    await db.admin(`update public.developments set client_tabs = default where id = $1`, [UMAN]);
  });
});
