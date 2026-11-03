// Cliente fictícia para as capturas da App Store, no banco de HOMOLOGAÇÃO (SUPABASE_DB_URL do .env.local).
// Uso: node --env-file=.env.local scripts/demo-app-store.mjs criar | remover
// Recria do zero ("criar" remove antes) e desfaz tudo ("remover"): cliente, chamados, avisos, contrato e a unidade DEMO-104 do MAUI.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
const req = createRequire(process.cwd() + "/package.json");
const pg = req("pg");
const { createClient } = req("@supabase/supabase-js");

if ((process.env.APP_ENV ?? "development") !== "development") throw new Error("só homologação");
const EMAIL = "demo.cliente@teste.ouz.app.br";
const REF = "demo-app-store";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function remover() {
  await db.query("begin");
  const c = await one(`select id, user_id from public.clients where external_ref = $1`, [REF]);
  if (c) {
    await db.query(`delete from public.notifications where user_id = $1`, [c.user_id]);
    await db.query(`delete from public.tickets where client_id = $1`, [c.id]);
    await db.query(`delete from public.client_units where client_id = $1`, [c.id]);
    await db.query(`delete from public.clients where id = $1`, [c.id]);
  }
  const u = await one(`select id from public.units where external_ref = $1`, [REF]);
  if (u) {
    await db.query(`delete from public.financial_contracts where unit_id = $1`, [u.id]);
    await db.query(`update public.units set code = 'DEMO-104', floor = null, typology = 'Tipologia demonstrativa', bedrooms = null,
      private_area_m2 = null, parking = null, external_ref = null where id = $1`, [u.id]);
  }
  await db.query("commit");
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((x) => x.email === EMAIL);
  if (user) await admin.auth.admin.deleteUser(user.id);
  console.log("removido");
}

async function criar() {
  await remover();
  const password = `Demo-${randomBytes(6).toString("hex")}`;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true, user_metadata: { full_name: "Ana Souza" } });
  if (error) throw error;
  const userId = data.user.id;

  await db.query("begin");
  const unit = await one(`update public.units u set code = '214', floor = 2, typology = 'Garden', bedrooms = 3, private_area_m2 = 131.20,
      parking = '2 vagas', external_ref = $1
    from public.developments d where d.id = u.development_id and d.slug = 'maui' and u.code = 'DEMO-104' and u.is_demo returning u.id`, [REF]);
  if (!unit) throw new Error("unidade DEMO-104 do MAUI não encontrada");
  const client = await one(`insert into public.clients (user_id, full_name, email, phone, is_demo, external_ref)
    values ($1, 'Ana Souza', $2, '48999990214', true, $3) returning id`, [userId, EMAIL, REF]);
  await db.query(`insert into public.client_units (client_id, unit_id) values ($1, $2)`, [client.id, unit.id]);

  // Contrato com entrada, 40 mensais, 3 reforços anuais e chaves; pagas até outubro/2026.
  const contract = await one(`insert into public.financial_contracts (unit_id, contract_value, signed_on, external_ref)
    values ($1, 1865000, '2024-03-15', $2) returning id`, [unit.id, REF]);
  const rows = [["entrada", "2024-03-15", 186500]];
  for (let m = 0; m < 40; m++) {
    const d = new Date(Date.UTC(2024, 3 + m, 10));
    rows.push(["parcela", d.toISOString().slice(0, 10), 27500]);
  }
  for (const y of [2024, 2025, 2026]) rows.push(["reforco", `${y}-12-15`, 60000]);
  rows.push(["chaves", "2027-08-10", 398500]);
  rows.sort((a, b) => a[1].localeCompare(b[1]));
  let n = 0;
  for (const [kind, due, amount] of rows) {
    n++;
    const paid = due <= "2026-10-31";
    await db.query(`insert into public.installments (contract_id, number, kind, due_date, original_amount, updated_amount, paid_amount, paid_on, status)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [contract.id, n, kind, due, amount, paid ? null : (amount * 1.0412).toFixed(2), paid ? amount : 0, paid ? due : null, paid ? "paga" : "aberta"]);
  }

  // Chamados: um em atendimento com resposta da OUZ e um resolvido.
  const t1 = await one(`insert into public.tickets (client_id, unit_id, category, title, description, status, created_by, created_at, updated_at)
    values ($1, $2, 'solicitacao_unidade', 'Ponto de tomada extra na varanda',
      'Gostaria de saber se é possível incluir um ponto de tomada na varanda gourmet, ao lado da churrasqueira.', 'em_atendimento', $3,
      now() - interval '3 days', now() - interval '1 day') returning id, number`, [client.id, unit.id, userId]);
  await db.query(`insert into public.ticket_messages (ticket_id, author_id, from_staff, body, created_at) values
    ($1, null, true, 'Olá, Ana! É possível, sim. Nossa equipe de engenharia vai avaliar a carga do circuito e enviamos o orçamento por aqui até sexta-feira.', now() - interval '1 day')`,
    [t1.id]);
  const t2 = await one(`insert into public.tickets (client_id, unit_id, category, title, description, status, closed_at, created_by, created_at, updated_at)
    values ($1, $2, 'duvida_administrativa', 'Informe de rendimentos 2025',
      'Preciso do informe dos valores pagos em 2025 para a declaração do imposto de renda.', 'resolvido', now() - interval '20 days', $3,
      now() - interval '25 days', now() - interval '20 days') returning id`, [client.id, unit.id, userId]);
  await db.query(`insert into public.ticket_messages (ticket_id, author_id, from_staff, body, created_at) values
    ($1, null, true, 'Pronto! O informe está disponível em Documentos da sua unidade.', now() - interval '20 days')`, [t2.id]);

  // Avisos do sino.
  await db.query(`insert into public.notifications (user_id, kind, title, body, link, dedupe_key, created_at) values
    ($1, 'chamado', 'Nova resposta no chamado #' || $2, 'A OUZ respondeu: Ponto de tomada extra na varanda.', '/cliente/chamados/' || $3, $4 || ':t1', now() - interval '1 day'),
    ($1, 'obra', 'Evolução da obra atualizada', 'O MAUI chegou a 94,5% de execução.', '/cliente/unidades/' || $5, $4 || ':obra', now() - interval '2 days'),
    ($1, 'financeiro', 'Parcela de outubro confirmada', 'Recebemos o pagamento da parcela de 10/10/2026.', '/cliente/unidades/' || $5 || '/financeiro', $4 || ':fin', now() - interval '24 days')`,
    [userId, t1.number, t1.id, REF, unit.id]);
  await db.query("commit");

  appendFileSync("contas-teste.local.txt", `\n[Demonstração App Store] Ana Souza (cliente fictícia, MAUI 214)\n  e-mail: ${EMAIL}\n  senha: ${password}\n`);
  console.log("criado; senha em contas-teste.local.txt");
}

try {
  if (process.argv[2] === "remover") await remover();
  else if (process.argv[2] === "criar") await criar();
  else console.log("use: criar | remover");
} catch (e) {
  await db.query("rollback").catch(() => undefined);
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
