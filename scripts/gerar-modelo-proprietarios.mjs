// Gera a planilha "Proprietários" já com as unidades vendidas que ainda não têm cliente vinculado no app.
// Uso: node --env-file=.env.local scripts/gerar-modelo-proprietarios.mjs [saida.xlsx] [--excluir "MAUI:102,104"]
// --excluir: unidades que virão de outra fonte (ex.: planilha de fluxo de pagamentos ainda não importada).
import pg from "pg";
import { writeFileSync } from "node:fs";
import { writeXlsx } from "./lib/xlsx-write.mjs";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`
  select d.name as dev, u.code
    from public.units u join public.developments d on d.id = u.development_id
   where not u.is_demo and u.status = 'vendida'
     and not exists (select 1 from public.client_units cu where cu.unit_id = u.id and cu.active)
   order by d.sort_order, d.name, (u.code ~ '^[0-9]+$') desc, u.code`);
await db.end();
const exIdx = process.argv.indexOf("--excluir");
const excluded = new Set(exIdx > -1 ? process.argv[exIdx + 1].split(";").flatMap((g) => {
  const [dev, codes] = g.split(":");
  return codes.split(",").map((c) => `${dev.trim().toUpperCase()}|${c.trim()}`);
}) : []);
const list = rows.filter((r) => !excluded.has(`${r.dev.toUpperCase()}|${r.code}`));

const COLUNAS = ["Empreendimento *", "Unidade *", "Nome completo ou razão social *", "E-mail *", "Celular com DDD",
  "Vínculo *", "Tem parcelas a pagar à OUZ? *", "Observações"];
const instrucoes = [
  ["Proprietários — OUZ Experience"],
  [""],
  ["Para que serve"],
  ["Cadastrar quem é dono de cada unidade vendida para dar acesso ao portal do cliente (acompanhamento, documentos, chamados, concierge e, quando houver, financeiro)."],
  [""],
  ["Como preencher (aba Proprietários)"],
  ["• As unidades vendidas que ainda não têm proprietário no app já estão listadas. Complete uma linha por pessoa."],
  ["• Mais de um proprietário na mesma unidade (casal, sócios): copie a linha e marque o vínculo como Cotitular."],
  ["• Procurador: pessoa que representa o proprietário. Ela também recebe acesso ao portal."],
  ["• E-mail: o que o proprietário vai usar para entrar no app (um por pessoa)."],
  ["• Tem parcelas a pagar à OUZ: marque Sim se ainda houver saldo (o fluxo de pagamentos será cadastrado depois); Não se está quitado."],
  ["• Não informe CPF, endereço ou documentos: o app não precisa deles para o acesso."],
  [""],
  ["O que acontece depois"],
  ["Os dados são conferidos (e-mails, unidades repetidas) e cada proprietário recebe o convite quando a OUZ decidir abrir o portal, em lotes."],
  [""],
  ["Privacidade (LGPD)"],
  ["Os dados servem somente para o acesso ao OUZ Experience. Depois de enviar à OUZ, apague cópias desnecessárias desta planilha."],
];
const out = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "Proprietários - OUZ.xlsx";
writeFileSync(out, writeXlsx([
  { name: "Instruções", rows: instrucoes, widths: [120], wrap: true },
  {
    name: "Proprietários", header: true,
    rows: [COLUNAS, ...list.map((r) => [r.dev, r.code, "", "", "", "Titular", "", ""])],
    widths: [16, 10, 36, 32, 18, 14, 18, 40],
    lists: [{ col: 5, values: ["Titular", "Cotitular", "Procurador"] }, { col: 6, values: ["Sim", "Não"] }],
  },
]));
console.log(`gerado: ${out} (${list.length} unidade(s))`);
console.log(list.map((r) => `${r.dev} ${r.code}`).join(", "));
