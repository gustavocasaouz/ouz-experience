import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { CPF_A, SOHO, makeAdmin, makeBroker, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let clientes: Claims;

const TOKEN = "a".repeat(64);
const device = (userId: string, token = TOKEN) =>
  db.admin(`insert into public.push_devices (token, user_id, environment) values ($1, $2, 'production')`, [token, userId]);
const notify = (userId: string, dedupe: string) =>
  db.admin(`select public.notify_user($1, 'teste', 'Título', 'Corpo', '/cliente', $2)`, [userId, dedupe]);
const outbox = (userId: string) =>
  db.admin<{ channel: string; status: string }>(`select channel, status from public.notification_outbox where recipient_user_id = $1 order by channel`, [userId]);

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
  clientes = (await makeOperator(db, admin.aal2, "clientes@t.ouz", ["clientes"])).aal2;
});
afterAll(async () => db.close());

describe("avisos no celular", () => {
  it("notify_user só enfileira push para quem tem aparelho registrado", async () => {
    const c = await makeClientWithUnit(db, clientes, "push1@cli.ouz", "DEMO-101", SOHO);
    await notify(c.userId, "sem-aparelho");
    expect((await outbox(c.userId)).map((r) => r.channel)).toEqual(["email"]);

    await device(c.userId);
    await notify(c.userId, "com-aparelho");
    expect((await outbox(c.userId)).map((r) => r.channel).sort()).toEqual(["email", "email", "push"]);
  });

  it("claim_outbox_batch filtra pelo canal", async () => {
    const rows = await db.admin<{ channel: string }>(`select channel from public.claim_outbox_batch(50, 'push')`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.channel === "push")).toBe(true);
    const left = await db.admin<{ n: number }>(`select count(*)::int as n from public.notification_outbox where channel = 'email' and status = 'pendente'`);
    expect(left[0]!.n).toBeGreaterThan(0);
  });

  it("aparelhos não são visíveis nem graváveis pelo usuário", async () => {
    const c = await makeClientWithUnit(db, clientes, "push2@cli.ouz", "DEMO-102", SOHO);
    await expect(db.as(c.claims, `select * from public.push_devices`)).rejects.toThrow(/permission denied/);
    await expect(
      db.as(c.claims, `insert into public.push_devices (token, user_id, environment) values ($1, $2, 'production')`, ["b".repeat(64), c.userId]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("excluir a própria conta", () => {
  it("cliente: apaga o perfil e os avisos, mantém o cadastro do cliente sem login", async () => {
    const c = await makeClientWithUnit(db, clientes, "sai@cli.ouz", "DEMO-103", SOHO);
    await device(c.userId, "c".repeat(64));
    await notify(c.userId, "antes-de-sair");
    await db.admin(`insert into public.consents (user_id, purpose, document_version) values ($1, 'comunicacoes_marketing', 'v1')`, [c.userId]);

    await db.admin(`select public.erase_user_account($1)`, [c.userId]);

    const [p] = await db.admin<{ full_name: string; email: string; phone: string | null }>(`select full_name, email, phone from public.profiles where id = $1`, [c.userId]);
    expect(p).toEqual({ full_name: "", email: `conta-excluida+${c.userId}@ouz.invalid`, phone: null });
    const [cl] = await db.admin<{ user_id: string | null }>(`select user_id from public.clients where id = $1`, [c.clientId]);
    expect(cl!.user_id).toBeNull();
    expect(await db.admin(`select 1 from public.client_units where client_id = $1`, [c.clientId])).toHaveLength(1);
    expect(await db.admin(`select 1 from public.notifications where user_id = $1`, [c.userId])).toHaveLength(0);
    expect(await db.admin(`select 1 from public.push_devices where user_id = $1`, [c.userId])).toHaveLength(0);
    expect(await outbox(c.userId)).toHaveLength(0);
    expect(await db.admin(`select 1 from public.consents where user_id = $1 and revoked_at is null`, [c.userId])).toHaveLength(0);
    expect(await db.admin(`select 1 from public.audit_log where action = 'conta_excluida_pelo_titular' and entity_id = $1`, [c.userId])).toHaveLength(1);
    expect(await db.as(c.claims, `select public.is_client() as ok`)).toEqual([{ ok: false }]);

    // A exclusão "soft" do Auth anonimiza o e-mail; vazio não quebra o perfil.
    await db.admin(`update auth.users set email = 'ofuscado@x.invalid' where id = $1`, [c.userId]);
    await db.admin(`update auth.users set email = null where id = $1`, [c.userId]);
    const [p2] = await db.admin<{ email: string }>(`select email from public.profiles where id = $1`, [c.userId]);
    expect(p2!.email).toBe("ofuscado@x.invalid");
  });

  it("corretor sem histórico: cadastro e documentos saem, e o servidor recebe os arquivos para apagar", async () => {
    const b = await makeBroker(db, "corretor@sai.ouz", CPF_A, "12345");
    const path = `${b.id}/creci.pdf`;
    await db.admin(`insert into public.broker_documents (broker_user_id, label, storage_path) values ($1, 'CRECI', $2)`, [b.id, path]);
    const rows = await db.admin<{ erase_user_account: string }>(`select public.erase_user_account($1)`, [b.id]);
    expect(rows.map((r) => r.erase_user_account)).toEqual([path]);
    expect(await db.admin(`select 1 from public.broker_profiles where user_id = $1`, [b.id])).toHaveLength(0);
  });

  it("equipe OUZ não exclui a própria conta pelo app", async () => {
    await expect(db.admin(`select public.erase_user_account($1)`, [admin.id])).rejects.toThrow(/equipe OUZ/);
  });

  it("usuário não chama a função diretamente", async () => {
    const c = await makeClientWithUnit(db, clientes, "direto@cli.ouz", "DEMO-104", SOHO);
    await expect(db.as(c.claims, `select public.erase_user_account($1)`, [c.userId])).rejects.toThrow(/permission denied/);
  });
});
