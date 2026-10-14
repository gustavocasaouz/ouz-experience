// Gera a planilha em branco "Cadastro de corretores ativos" para o comercial preencher.
// Uso: node scripts/gerar-modelo-corretores.mjs [saida.xlsx]
import { writeFileSync } from "node:fs";
import { writeXlsx } from "./lib/xlsx-write.mjs";

export const COLUNAS = [
  "Nome completo *", "CPF *", "CRECI – número *", "CRECI – UF *", "E-mail *", "Celular com DDD *", "Cidade *", "Estado *",
  "Imobiliária (se houver)", "CNPJ da imobiliária", "Acesso SOHO *", "Acesso MAUI *", "Acesso UMAN *", "Observações",
];
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

const instrucoes = [
  ["Cadastro de corretores ativos — OUZ Experience"],
  [""],
  ["Para que serve"],
  ["Lista dos corretores que já trabalham com a OUZ. Quem estiver aqui entra no OUZ Experience já aprovado e com acesso aos empreendimentos marcados, sem passar pela fila de análise."],
  [""],
  ["Como preencher (aba Corretores)"],
  ["• Uma linha por corretor. Campos com * são obrigatórios."],
  ["• CPF e CNPJ: só números ou com pontuação, como preferir. O sistema confere os dígitos."],
  ["• CRECI: número como aparece na carteira (ex.: 12345 ou 12345-F) e a UF do conselho."],
  ["• E-mail: o mesmo que o corretor vai usar para entrar no app. Um e-mail por corretor."],
  ["• Acesso: escolha Sim ou Não em cada empreendimento. O UMAN é restrito: marque Sim só para quem a OUZ liberar."],
  ["• Não cole fotos nem documentos nesta planilha."],
  [""],
  ["O que acontece depois"],
  ["1. A OUZ envia a planilha preenchida; os dados são conferidos (CPF, CRECI, e-mails repetidos) antes de qualquer cadastro."],
  ["2. Cada corretor recebe um convite por e-mail, cria a própria senha e aceita os termos de uso e a política de privacidade no primeiro acesso."],
  ["3. Ao concluir o cadastro, já entra aprovado e vê os empreendimentos liberados."],
  [""],
  ["Privacidade (LGPD)"],
  ["Os dados servem somente para o cadastro no OUZ Experience. Avise os corretores de que as informações serão usadas para esse fim. Depois de enviada à OUZ, apague cópias desnecessárias desta planilha."],
];

const out = process.argv[2] ?? "Cadastro de corretores ativos - OUZ.xlsx";
writeFileSync(out, writeXlsx([
  { name: "Instruções", rows: instrucoes, widths: [120], wrap: true },
  {
    name: "Corretores", header: true, rows: [COLUNAS],
    widths: [34, 16, 16, 12, 32, 18, 20, 10, 28, 20, 13, 13, 13, 40],
    lists: [
      { col: 3, values: UFS }, { col: 7, values: UFS },
      { col: 10, values: ["Sim", "Não"] }, { col: 11, values: ["Sim", "Não"] }, { col: 12, values: ["Sim", "Não"] },
    ],
  },
]));
console.log(`gerado: ${out}`);
