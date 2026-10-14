// Executa um arquivo de dados demonstrativos no banco de DESENVOLVIMENTO.
// Uso: node --env-file=.env.local scripts/aplicar-seed.mjs supabase/seed-etapa3.sql
import pg from "pg";
import { readFileSync } from "node:fs";

const official = /seed-conteudo-oficial\.sql$/.test(process.argv[2] ?? "");
if (!official && (process.env.APP_ENV ?? "development") !== "development") throw new Error("Dados demonstrativos só em desenvolvimento.");
const file = process.argv[2];
if (!file || !/^supabase\/seed[\w-]*\.sql$/.test(file)) throw new Error("Informe um arquivo supabase/seed*.sql");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("begin");
  await c.query(readFileSync(file, "utf8"));
  await c.query("commit");
  console.log(`aplicado: ${file}`);
} catch (e) {
  await c.query("rollback");
  console.error(`falhou (nada aplicado): ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
