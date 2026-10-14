// Importa a "Tabela de Vendas" mensal (planilha da OUZ) como RASCUNHO de tabela de preços de um empreendimento
// e atualiza tipologia, área privativa e vagas das unidades listadas. Nunca publica: a OUZ revisa e publica em
// Administração › Empreendimentos › Comercial. Linhas "VENDIDO" só são conferidas com a situação das unidades.
//
// Uso:
//   node --env-file=.env.local scripts/importar-tabela-vendas.mjs <arquivo.xlsx> --empreendimento maui            # simulação
//   node --env-file=.env.local scripts/importar-tabela-vendas.mjs <arquivo.xlsx> --empreendimento maui --gravar   # grava rascunho
// Produção exige também --confirmo-producao.
import pg from "pg";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { readXlsx } from "./lib/xlsx.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--empreendimento");
const slug = args[args.indexOf("--empreendimento") + 1];
if (!file || args.indexOf("--empreendimento") < 0) throw new Error("Uso: importar-tabela-vendas.mjs <arquivo.xlsx> --empreendimento <slug> [--gravar]");
const env = process.env.APP_ENV ?? "development";
if (env !== "development" && !args.includes("--confirmo-producao")) throw new Error(`APP_ENV=${env}: use --confirmo-producao (somente com autorização).`);

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sheet = readXlsx(readFileSync(file)).find((s) => [...s.cells.values()].some((c) => norm(c.v) === "unidade"));
if (!sheet) throw new Error("aba com a coluna UNIDADE não encontrada");
const at = (ref) => sheet.cells.get(ref)?.v ?? null;
const [hdrRef] = [...sheet.cells].find(([, c]) => norm(c.v) === "unidade");
const hdrRow = Number(hdrRef.match(/\d+$/)[0]);
const cols = {};
for (const [ref, c] of sheet.cells) {
  if (Number(ref.match(/\d+$/)[0]) !== hdrRow) continue;
  const t = norm(c.v), col = ref.match(/^[A-Z]+/)[0];
  if (t === "unidade") cols.code = col;
  else if (t === "tipo") cols.type = col;
  else if (t.startsWith("privativ")) cols.area = col;
  else if (t.startsWith("vaga")) cols.parking = col;
  else if (t.startsWith("valor total")) cols.price = col;
}
for (const k of ["code", "price"]) if (!cols[k]) throw new Error(`coluna ausente: ${k}`);
const title = [...sheet.cells.values()].map((c) => String(c.v ?? "")).find((v) => /tabela de vendas/i.test(v)) ?? basename(file);

const rows = [];
for (let r = hdrRow + 1; r < hdrRow + 500; r++) {
  const code = at(cols.code + r);
  if (code === null || code === "") continue;
  const priceRaw = at(cols.price + r);
  const price = Number(priceRaw);
  rows.push({
    code: String(code).trim(),
    sold: /vendid/i.test(String(priceRaw ?? "")),
    price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
    typology: cols.type ? String(at(cols.type + r) ?? "").trim() || null : null,
    area: cols.area && Number.isFinite(Number(at(cols.area + r))) ? Math.round(Number(at(cols.area + r)) * 100) / 100 : null,
    parking: cols.parking && !/^-?$/.test(String(at(cols.parking + r) ?? "").trim()) ? `Vagas ${String(at(cols.parking + r)).trim()}` : null,
  });
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "ouz-tabela-vendas" });
await db.connect();
try {
  const dev = (await db.query(`select id, name from public.developments where slug = $1`, [slug])).rows[0];
  if (!dev) throw new Error(`empreendimento "${slug}" não encontrado`);
  const units = new Map((await db.query(`select id, code, status from public.units where development_id = $1 and not is_demo`, [dev.id])).rows.map((u) => [u.code, u]));
  const errors = [], warnings = [];
  for (const r of rows) {
    const u = units.get(r.code);
    if (!u) { errors.push(`unidade ${r.code} não cadastrada`); continue; }
    if (r.price && u.status !== "disponivel") warnings.push(`unidade ${r.code} tem preço na tabela, mas está "${u.status}" no app`);
    if (r.sold && u.status === "disponivel") warnings.push(`unidade ${r.code} está VENDIDA na tabela, mas "disponível" no app`);
    if (!r.price && !r.sold) errors.push(`unidade ${r.code}: sem preço e sem "VENDIDO"`);
  }
  const priced = rows.filter((r) => r.price);
  console.log(`\n${title} · ${dev.name} · ambiente: ${env}`);
  console.table(priced.map((r) => ({ unidade: r.code, tipologia: r.typology, "área (m²)": r.area, vagas: r.parking, preço: r.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) })));
  console.log(`${rows.filter((r) => r.sold).length} unidade(s) marcadas como VENDIDO na tabela.`);
  if (warnings.length) console.log("\nAVISOS:\n" + warnings.map((w) => "  • " + w).join("\n"));
  if (errors.length) { console.log("\nERROS (nada foi gravado):\n" + errors.map((e) => "  ✗ " + e).join("\n")); process.exitCode = 1; }
  else {
    await db.query("begin");
    if ((await db.query(`select 1 from public.price_tables where development_id = $1 and status = 'rascunho'`, [dev.id])).rowCount) {
      throw new Error("já existe um rascunho de tabela para este empreendimento: publique ou exclua o rascunho na administração antes");
    }
    const { rows: [t] } = await db.query(
      `insert into public.price_tables (development_id, version_number, notes, data_source, external_ref)
       select $1, coalesce(max(version_number), 0) + 1, $2, 'importacao', $3 from public.price_tables where development_id = $1 returning id, version_number`,
      [dev.id, title, basename(file)]);
    for (const r of rows) {
      const u = units.get(r.code);
      if (r.price) await db.query(`insert into public.price_table_items (price_table_id, unit_id, price) values ($1, $2, $3)`, [t.id, u.id, r.price]);
      await db.query(`update public.units set typology = coalesce($2, typology), private_area_m2 = coalesce($3, private_area_m2), parking = coalesce($4, parking) where id = $1`,
        [u.id, r.typology, r.area, r.parking]);
    }
    if (args.includes("--gravar")) { await db.query("commit"); console.log(`\n✓ Rascunho v${t.version_number} criado com ${priced.length} preço(s). Revise e publique em Administração › ${dev.name} › Comercial.`); }
    else { await db.query("rollback"); console.log(`\nSimulação OK (rascunho v${t.version_number}, ${priced.length} preço(s)) — nada gravado. Repita com --gravar.`); }
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("\n✗ Cancelado, nada foi gravado:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
