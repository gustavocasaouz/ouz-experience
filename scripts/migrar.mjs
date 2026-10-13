// Aplica migrações pendentes no banco indicado por SUPABASE_DB_URL (somente DESENVOLVIMENTO por padrão).
// Usa a mesma tabela de histórico da Supabase CLI (supabase_migrations.schema_migrations), então é compatível com `supabase db push`.
//
// Uso:
//   node --env-file=.env.local scripts/migrar.mjs                      # lista e aplica pendentes
//   node --env-file=.env.local scripts/migrar.mjs --status             # só lista
//   node --env-file=.env.local scripts/migrar.mjs --baseline 2026...   # marca como aplicadas (sem executar) até a versão informada
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("Defina SUPABASE_DB_URL no .env.local");
if ((process.env.APP_ENV ?? "development") !== "development" && !process.argv.includes("--confirmo-producao")) {
  throw new Error("APP_ENV não é development. Para produção, use --confirmo-producao (somente com autorização).");
}
const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const versionOf = (f) => f.slice(0, 14);
const nameOf = (f) => f.slice(15, -4);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "ouz-migrar" });
await client.connect();
await client.query(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
const applied = new Set((await client.query(`select version from supabase_migrations.schema_migrations`)).rows.map((r) => r.version));

const baselineIdx = process.argv.indexOf("--baseline");
if (baselineIdx > -1) {
  const upTo = process.argv[baselineIdx + 1];
  if (!/^\d{14}$/.test(upTo ?? "")) throw new Error("--baseline exige uma versão AAAAMMDDhhmmss");
  for (const f of files.filter((f) => versionOf(f) <= upTo && !applied.has(versionOf(f)))) {
    await client.query(`insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, '{}')`, [versionOf(f), nameOf(f)]);
    console.log(`marcada como aplicada: ${f}`);
  }
  await client.end();
  process.exit(0);
}

const pending = files.filter((f) => !applied.has(versionOf(f)));
console.log(`${files.length - pending.length} aplicadas · ${pending.length} pendentes`);
for (const f of pending) console.log(`  pendente: ${f}`);
if (process.argv.includes("--status") || pending.length === 0) {
  await client.end();
  process.exit(0);
}
for (const f of pending) {
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`, [versionOf(f), nameOf(f), [sql]]);
    await client.query("commit");
    console.log(`aplicada: ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`FALHOU (nada desta migração foi aplicado): ${f}\n  ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
await client.end();
