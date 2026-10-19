// Importa um manual de uso, operação e manutenção para o banco indicado por SUPABASE_DB_URL.
// O conteúdo é oficial (vale para produção), mas produção só com autorização: --confirmo-producao.
// O manual entra como NÃO publicado na primeira vez; a equipe publica em Admin › Empreendimento › Manuais.
//
// Uso: node --env-file=.env.local scripts/importar-manual.mjs supabase/manuais/soho-condominio.json
import pg from "pg";
import { readFileSync } from "node:fs";
import { importManual } from "./lib/manual.mjs";

const file = process.argv[2];
if (!file || !/^supabase\/manuais\/[\w-]+\.json$/.test(file)) throw new Error("Informe um arquivo supabase/manuais/*.json");
if ((process.env.APP_ENV ?? "development") !== "development" && !process.argv.includes("--confirmo-producao")) {
  throw new Error("APP_ENV não é development. Para produção, use --confirmo-producao (somente com autorização).");
}
const manual = JSON.parse(readFileSync(file, "utf8"));
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("begin");
  const r = await importManual(c, manual);
  await c.query("commit");
  console.log(`importado: ${file} — ${r.sections} seções, ${r.warranty} itens de garantia, ${r.maintenance} atividades de manutenção, ${r.attachments} anexos`);
} catch (e) {
  await c.query("rollback");
  console.error(`falhou (nada aplicado): ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
