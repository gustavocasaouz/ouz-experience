import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanHtml, importManual } from "../../scripts/lib/manual.mjs";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, makeAdmin, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let conteudo: Claims, atendimento: Claims;
let A: Awaited<ReturnType<typeof makeClientWithUnit>>; // SOHO DEMO-101
let A2: Awaited<ReturnType<typeof makeClientWithUnit>>; // SOHO DEMO-102
let B: Awaited<ReturnType<typeof makeClientWithUnit>>; // MAUI
let manualId: string;

const soho = JSON.parse(readFileSync(join(__dirname, "..", "manuais", "soho-condominio.json"), "utf8"));

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  const admin = await makeAdmin(db);
  const op = async (email: string, perms: string[]) => (await makeOperator(db, admin.aal2, email, perms)).aal2;
  conteudo = await op("conteudo@t.ouz", ["conteudo"]);
  atendimento = await op("atendimento@t.ouz", ["atendimento"]);
  const clientes = await op("clientes@t.ouz", ["clientes"]);
  A = await makeClientWithUnit(db, clientes, "a@cli.ouz", "DEMO-101", SOHO);
  A2 = await makeClientWithUnit(db, clientes, "a2@cli.ouz", "DEMO-102", SOHO);
  B = await makeClientWithUnit(db, clientes, "b@cli.ouz", "DEMO-101", MAUI);
  manualId = (await importManual(db.pg, soho)).id;
});
afterAll(async () => db.close());

describe("manuais", () => {
  it("importa o manual do condomínio do SOHO com seções, garantias e manutenção", async () => {
    const [counts] = await db.admin<{ s: number; w: number; t: number }>(
      `select (select count(*)::int from public.manual_sections where manual_id = $1) as s,
              (select count(*)::int from public.manual_warranty_items where manual_id = $1) as w,
              (select count(*)::int from public.manual_maintenance_tasks where manual_id = $1) as t`, [manualId]);
    expect(counts).toEqual({ s: soho.sections.length, w: soho.warranty_items.length, t: soho.maintenance.length });
    const fiveYears = await db.admin(`select 1 from public.manual_warranty_items where manual_id = $1 and system = 'Impermeabilização' and months = 60`, [manualId]);
    expect(fiveYears).toHaveLength(1);
  });

  it("reimportar substitui o conteúdo e mantém a publicação", async () => {
    await db.admin(`update public.development_manuals set is_published = true where id = $1`, [manualId]);
    const again = await importManual(db.pg, soho);
    expect(again.id).toBe(manualId);
    const [m] = await db.admin<{ is_published: boolean }>(`select is_published from public.development_manuals where id = $1`, [manualId]);
    expect(m.is_published).toBe(true);
    const [{ n }] = await db.admin<{ n: number }>(`select count(*)::int as n from public.manual_sections where manual_id = $1`, [manualId]);
    expect(n).toBe(soho.sections.length);
    await db.admin(`update public.development_manuals set is_published = false where id = $1`, [manualId]);
  });

  it("cliente só lê manual publicado do próprio empreendimento; equipe sem conteúdo não lê", async () => {
    expect(await db.as(A.claims, `select * from public.development_manuals`)).toHaveLength(0);
    expect(await db.as(A.claims, `select * from public.manual_sections`)).toHaveLength(0);
    expect(await db.as(conteudo, `select * from public.development_manuals`)).toHaveLength(1);

    await db.as(conteudo, `update public.development_manuals set is_published = true where id = $1`, [manualId]);
    expect(await db.as(A.claims, `select * from public.development_manuals`)).toHaveLength(1);
    expect((await db.as(A.claims, `select * from public.manual_warranty_items`)).length).toBe(soho.warranty_items.length);
    expect(await db.as(B.claims, `select * from public.development_manuals`)).toHaveLength(0);
    expect(await db.as(B.claims, `select * from public.manual_sections`)).toHaveLength(0);
    expect(await db.as(atendimento, `select * from public.manual_sections`)).toHaveLength(0);
    expect(await db.as("anon", `select * from public.manual_sections`).catch(() => [])).toHaveLength(0);
  });

  it("ninguém altera o conteúdo pelo portal; equipe só publica e escolhe o PDF do próprio empreendimento", async () => {
    await expect(db.as(conteudo, `update public.manual_sections set html = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(db.as(conteudo, `update public.development_manuals set title = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(db.as(conteudo, `insert into public.manual_warranty_items (manual_id, row_number, system, aspect, months, sort_order) values ($1, 1, 'x', 'y', 12, 0)`, [manualId])).rejects.toThrow(/permission denied/);
    await expect(db.as(A.claims, `update public.development_manuals set is_published = false`)).resolves.toHaveLength(0);
    const [{ published }] = await db.admin<{ published: boolean }>(`select is_published as published from public.development_manuals where id = $1`, [manualId]);
    expect(published).toBe(true);

    const [own] = await db.admin<{ id: string }>(`insert into public.documents (development_id, category, title) values ($1, 'manual', 'Manual do condomínio (PDF)') returning id`, [SOHO]);
    const [other] = await db.admin<{ id: string }>(`insert into public.documents (development_id, category, title) values ($1, 'manual', 'Outro') returning id`, [MAUI]);
    await expect(db.as(conteudo, `update public.development_manuals set pdf_document_id = $2 where id = $1`, [manualId, other.id])).rejects.toThrow(/próprio empreendimento/);
    await db.as(conteudo, `update public.development_manuals set pdf_document_id = $2 where id = $1`, [manualId, own.id]);
  });

  it("anexos: cliente vê as linhas; equipe liga o arquivo do próprio empreendimento; reimportar mantém o arquivo", async () => {
    expect((await db.as(A.claims, `select * from public.manual_attachments`)).length).toBe(soho.attachments.length);
    expect(await db.as(B.claims, `select * from public.manual_attachments`)).toHaveLength(0);
    const [att] = await db.admin<{ id: string }>(`select id from public.manual_attachments where manual_id = $1 and title = 'Projeto Estrutural'`, [manualId]);
    const [doc] = await db.admin<{ id: string }>(`insert into public.documents (development_id, category, title) values ($1, 'manual', 'Projeto estrutural (PDF)') returning id`, [SOHO]);
    const [other] = await db.admin<{ id: string }>(`insert into public.documents (development_id, category, title) values ($1, 'manual', 'Outro arquivo') returning id`, [MAUI]);

    await expect(db.as(A.claims, `update public.manual_attachments set document_id = $2 where id = $1 returning id`, [att.id, doc.id])).resolves.toHaveLength(0); // RLS: nada muda
    await expect(db.as(conteudo, `update public.manual_attachments set document_id = $2 where id = $1`, [att.id, other.id])).rejects.toThrow(/próprio empreendimento/);
    await expect(db.as(conteudo, `update public.manual_attachments set title = 'x' where id = $1`, [att.id])).rejects.toThrow(/permission denied/);
    await db.as(conteudo, `update public.manual_attachments set document_id = $2 where id = $1`, [att.id, doc.id]);
    await db.as(conteudo, `insert into public.manual_attachments (manual_id, section_num, title) values ($1, '10.2.4', 'Planta baixa do térreo')`, [manualId]);
    await expect(db.as(A.claims, `insert into public.manual_attachments (manual_id, section_num, title) values ($1, '10.2.4', 'Do cliente')`, [manualId])).rejects.toThrow(/row-level security|permission denied/);

    await importManual(db.pg, soho);
    const [kept] = await db.admin<{ document_id: string }>(`select document_id from public.manual_attachments where id = $1`, [att.id]);
    expect(kept.document_id).toBe(doc.id);
    expect(await db.admin(`select 1 from public.manual_attachments where title = 'Planta baixa do térreo'`)).toHaveLength(1);
  });

  it("manual do proprietário por unidade: só o cliente daquela unidade lê; o do condomínio continua para todos", async () => {
    const owner = JSON.parse(readFileSync(join(__dirname, "..", "manuais", "soho-proprietario-201.json"), "utf8"));
    const { id } = await importManual(db.pg, { ...owner, unit_code: "DEMO-101" });
    const again = await importManual(db.pg, { ...owner, unit_code: "DEMO-101" });
    expect(again.id).toBe(id);
    await db.as(conteudo, `update public.development_manuals set is_published = true where id = $1`, [id]);

    const kinds = async (c: Claims) => (await db.as<{ kind: string }>(c, `select kind from public.development_manuals order by kind`)).map((r) => r.kind);
    expect(await kinds(A.claims)).toEqual(["proprietario", "condominio"]);
    expect(await kinds(A2.claims)).toEqual(["condominio"]);
    expect(await db.as(A2.claims, `select 1 from public.manual_sections where manual_id = $1`, [id])).toHaveLength(0);
    expect((await db.as(A.claims, `select 1 from public.manual_attachments where manual_id = $1`, [id])).length).toBe(owner.attachments.length);

    // Arquivo da própria unidade serve; de outra unidade, não.
    const [mine] = await db.admin<{ id: string }>(`insert into public.documents (unit_id, category, title) values ($1, 'manual', 'Projeto da unidade') returning id`, [A.unitId]);
    const [theirs] = await db.admin<{ id: string }>(`insert into public.documents (unit_id, category, title) values ($1, 'manual', 'Projeto de outra') returning id`, [A2.unitId]);
    const [att] = await db.admin<{ id: string }>(`select id from public.manual_attachments where manual_id = $1 limit 1`, [id]);
    await db.as(conteudo, `update public.manual_attachments set document_id = $2 where id = $1`, [att.id, mine.id]);
    await expect(db.as(conteudo, `update public.manual_attachments set document_id = $2 where id = $1`, [att.id, theirs.id])).rejects.toThrow(/empreendimento ou da unidade/);
    await expect(importManual(db.pg, { ...owner, unit_code: "NAO-EXISTE" })).rejects.toThrow(/unidade não encontrada/);
  });

  it("entrega por empreendimento: ligada por padrão; equipe com conteúdo desliga; cliente não", async () => {
    const [d] = await db.admin<{ on: boolean }>(`select client_delivery_enabled as on from public.developments where id = $1`, [SOHO]);
    expect(d.on).toBe(true); // SOHO demonstrativo: a migração só desliga o SOHO real
    await expect(db.as(A.claims, `update public.developments set client_delivery_enabled = false where id = $1 returning id`, [SOHO])).resolves.toHaveLength(0);
    await db.as(conteudo, `update public.developments set client_delivery_enabled = false where id = $1`, [SOHO]);
    const [after] = await db.admin<{ on: boolean }>(`select client_delivery_enabled as on from public.developments where id = $1`, [SOHO]);
    expect(after.on).toBe(false);
  });

  it("limpa scripts e eventos do HTML importado", () => {
    expect(cleanHtml(`<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:x">b</a><img src="data:image/png;base64,AA" alt="">`))
      .toBe(`<p>a</p><a>b</a><img src="data:image/png;base64,AA" alt="">`);
  });
});
