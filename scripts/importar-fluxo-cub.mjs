// Importa a planilha "Fluxo de Pagamentos Clientes" (corrigida pelo CUB-SC) de UM empreendimento.
// Cria unidades (vendidas), clientes, vínculos, contratos e parcelas; cadastra o histórico do CUB.
// NÃO envia convites (são enviados depois, em lotes, pela administração) e NÃO guarda CPF/CNPJ nem endereço.
//
// Uso:
//   node --env-file=.env.local scripts/importar-fluxo-cub.mjs <arquivo.xlsx> --empreendimento maui            # simulação (nada é gravado)
//   node --env-file=.env.local scripts/importar-fluxo-cub.mjs <arquivo.xlsx> --empreendimento maui --gravar   # grava (tudo ou nada)
// Produção exige também --confirmo-producao (somente com autorização da OUZ).
import pg from "pg";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { readXlsx } from "./lib/xlsx.mjs";
import { parseFluxo } from "./lib/fluxo-cub.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--empreendimento");
const slug = args[args.indexOf("--empreendimento") + 1];
const write = args.includes("--gravar");
if (!file || !slug || args.indexOf("--empreendimento") < 0) {
  console.error("Uso: scripts/importar-fluxo-cub.mjs <arquivo.xlsx> --empreendimento <slug> [--gravar]");
  process.exit(1);
}
const env = process.env.APP_ENV ?? "development";
if (env !== "development" && !args.includes("--confirmo-producao")) {
  throw new Error(`APP_ENV=${env}. Para produção, use --confirmo-producao (somente com autorização).`);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("Defina SUPABASE_DB_URL");

const brl = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const r = parseFluxo(readXlsx(readFileSync(file)), { slug });

console.log(`\nArquivo: ${basename(file)} · empreendimento: ${slug} · ambiente: ${env}`);
console.log(`CUB-SC: ${r.cub.meses} meses; últimos: ${r.cub.ultimos.map((c) => `${c.month.slice(0, 7)} = ${c.value}`).join(" · ")}\n`);
console.table(r.summaries.map((s) => ({
  apto: s.unit, parcelas: s.parcelas, pagas: s.pagas, "última paga": s.ultima_paga ?? "—", antecipações: s.antecipacoes,
  contrato: brl(s.contrato), pago: brl(s.pago), "saldo (estimado)": brl(s.saldo_estimado), "saldo planilha": brl(s.saldo_planilha),
})));
if (r.warnings.length) console.log("\nAVISOS (conferir com o financeiro):\n" + r.warnings.map((w) => "  • " + w).join("\n"));
if (r.errors.length) {
  console.log("\nERROS (corrija a planilha; nada foi gravado):\n" + r.errors.map((e) => "  ✗ " + e).join("\n"));
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "ouz-importar-fluxo" });
await db.connect();
try {
  const dev = (await db.query(`select id, name from public.developments where slug = $1`, [slug])).rows[0];
  if (!dev) throw new Error(`empreendimento "${slug}" não encontrado`);
  const payload = { development_id: dev.id, file_name: basename(file), ...r.payload };
  await db.query("begin");
  const res = (await db.query(`select public.import_indexed_flow($1::jsonb) as r`, [JSON.stringify(payload)])).rows[0].r;
  if (write) {
    await db.query("commit");
    console.log(`\n✓ Gravado em ${dev.name}:`, res);
  } else {
    await db.query("rollback");
    console.log(`\nSimulação OK no banco (${dev.name}) — nada foi gravado:`, res, "\nPara gravar, repita com --gravar.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("\n✗ Importação cancelada, nada foi gravado:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
