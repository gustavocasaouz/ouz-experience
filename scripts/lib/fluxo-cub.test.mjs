import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readXlsx } from "./xlsx.mjs";
import { parseFluxo } from "./fluxo-cub.mjs";

// Monta um .xlsx mínimo (ZIP) com strings inline, no formato da planilha da OUZ. Dados fictícios.
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const cell = (ref, v) => {
  if (v && typeof v === "object") return `<c r="${ref}"><f>${v.f}</f><v>${v.v}</v></c>`;
  return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
};
const sheet = (cells) => `<worksheet><sheetData><row>${Object.entries(cells).map(([r, v]) => cell(r, v)).join("")}</row></sheetData></worksheet>`;
const serial = (iso) => Math.round((Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000);

function workbook() {
  const cub = { B3: "MÊS", C3: "CUB" };
  ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].forEach((m, k) => { cub[`B${4 + k}`] = serial(m); cub[`C${4 + k}`] = 2000 + k * 100; });
  // Cliente A: entrada sem reajuste paga, P1 paga, P2 em aberto, FINAL nas chaves. CUB-base 2000.
  const a = {
    C3: "Apto 101", C4: "Nome ", D4: "Cliente  Fictício", E4: "Endereço", F4: "não importar", C5: "Cub", D5: 2000,
    C6: "CPF", D6: "000.000.000-00", C8: "Email", D8: " Ficticio@Exemplo.com ", C9: "Vagas", D9: "Vaga 7",
    E9: "Valor das compromissadas ", F9: 40000,
    B12: "Parcelas", C12: "Data/Venc", D12: "Cub", E12: "Cub Mensal", F12: "Fluxo Sem Reaj.", G12: "Fluxo com Rajuste", H12: "S/N",
    B13: "Ano 2026",
    B14: "Entrada", C14: serial("2026-01-10"), D14: 5, F14: 10000, G14: 10000, H14: "N",
    B15: "P1", C15: serial("2026-02-10"), D15: 5, F15: 10000, G15: 10500, H15: "S",
    B16: "P2", C16: serial("2026-03-10"), D16: 0, H16: "S", // mês sem pagamento
    B17: "P3", C17: serial("2026-03-15"), D17: 1, G17: 2200, H17: "S", // antecipação (sem valor original)
    B18: "P4", C18: serial("2026-05-10"), D18: 5, F18: 10000, G18: 11500, H18: "S",
    B19: "P5", C19: "FINAL ", D19: 4, F19: 10000, G19: 9200, H19: "S", // 5 CUBs − 1 antecipado
    B20: "Apto 101", F20: 40000,
    B22: "Total já pago ate a presente data", G22: { f: "SUM(G14:G17)", v: 22700 },
    B23: "Saldo devedor remanescente", G23: { f: "SUM(G18:G19)", v: 20700 },
  };
  return zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Cub Mensal" sheetId="1" r:id="rId1"/><sheet name="CLIENTE A" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet(cub),
    "xl/worksheets/sheet2.xml": sheet(a),
  });
}

describe("importação do fluxo de pagamentos (CUB)", () => {
  const r = parseFluxo(readXlsx(workbook()), { slug: "maui", today: "2026-03-20" });
  const c = r.payload.clients[0];

  it("lê o CUB só até o mês corrente", () => {
    expect(r.payload.index_values).toEqual([
      { month: "2026-01-01", value: 2000 }, { month: "2026-02-01", value: 2100 }, { month: "2026-03-01", value: 2200 },
    ]);
  });

  it("lê cliente e contrato sem CPF nem endereço", () => {
    expect(r.errors).toEqual([]);
    expect({ ...c, installments: undefined }).toEqual({
      ref: "maui:apto-101", unit_code: "101", parking: "Vaga 7", full_name: "Cliente Fictício", email: "ficticio@exemplo.com",
      phone: null, contract_value: 40000, base_index: 2000, note: "Vagas: Vaga 7", installments: undefined,
    });
    expect(JSON.stringify(r.payload)).not.toMatch(/000\.000|não importar/);
  });

  it("parcelas: pagas até a fórmula do total pago, antecipação, chaves sem data com CUBs da planilha", () => {
    expect(c.installments).toEqual([
      { number: 1, kind: "entrada", due_date: "2026-01-10", original_amount: 10000, indexed: false, index_quantity: 5, paid: true, paid_amount: 10000 },
      { number: 2, kind: "parcela", due_date: "2026-02-10", original_amount: 10000, indexed: true, index_quantity: 5, paid: true, paid_amount: 10500 },
      { number: 3, kind: "outro", due_date: "2026-03-15", original_amount: 2200, indexed: false, index_quantity: 1, paid: true, paid_amount: 2200 },
      { number: 4, kind: "parcela", due_date: "2026-05-10", original_amount: 10000, indexed: true, index_quantity: 5, paid: false, paid_amount: undefined },
      { number: 5, kind: "chaves", due_date: null, original_amount: 10000, indexed: true, index_quantity: 4, paid: false, paid_amount: undefined },
    ]);
  });

  it("confere com a planilha e aponta diferenças", () => {
    const s = r.summaries[0];
    expect(s).toMatchObject({ unit: "101", pagas: 3, pago: 22700, pago_planilha: 22700, antecipacoes: 1, chaves: 1 });
    // Saldo pelo último CUB (2200): 5×2200 + 4×2200 = 19.800; a planilha diz 20.700 → aviso.
    expect(s.saldo_estimado).toBe(19800);
    expect(r.warnings.some((w) => /saldo calculado/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /CUBs da planilha \(4\.0000\)/.test(w))).toBe(true);
  });

  it("bloqueia e-mail inválido", () => {
    const wb = readXlsx(workbook());
    wb[1].cells.set("D8", { v: "alguem@exemplo.com.br.", f: null });
    expect(parseFluxo(wb, { slug: "maui", today: "2026-03-20" }).errors).toEqual(['CLIENTE A: e-mail inválido: "alguem@exemplo.com.br."']);
  });

  it("aplica ajustes informados pela OUZ e recusa ajuste que não encontra o que corrigir", () => {
    const ajustes = {
      padrao: { dia_vencimento_parcelas: 10 },
      unidades: { "101": { email: "Novo@Exemplo.com", trocar_valor_original: [{ de: 10000, para: 10010 }], valor_chaves: 9000, nao_pagas: ["2026-02-10"], acrescimo_pago: { numero: 1, valor: 50 } } },
    };
    const a = parseFluxo(readXlsx(workbook()), { slug: "maui", today: "2026-03-20", ajustes });
    expect(a.errors).toEqual([]);
    const inst = a.payload.clients[0].installments;
    expect(a.payload.clients[0].email).toBe("novo@exemplo.com");
    expect(inst.map((i) => [i.number, i.original_amount, i.paid, i.paid_amount ?? null, i.index_quantity])).toEqual([
      [1, 10060, true, 10050, 5.03],      // 10.010 + 50 acrescentados (valor e pago)
      [2, 10010, false, null, 5.005],     // marcada como não paga
      [3, 2200, true, 2200, 1],           // antecipação intocada
      [4, 10010, false, null, 5.005],
      [5, 9000, false, null, 4.5],        // chaves corrigida (CUBs recalculados)
    ]);
    expect(inst[2].due_date).toBe("2026-03-15"); // dia do vencimento só muda em parcelas comuns, não em antecipações
    expect(a.summaries[0].ajustes).toHaveLength(5);
    const bad = parseFluxo(readXlsx(workbook()), { slug: "maui", today: "2026-03-20", ajustes: { unidades: { "101": { nao_pagas: ["2030-01-10"] } } } });
    expect(bad.errors).toEqual(["CLIENTE A: ajuste: nenhuma parcela paga com vencimento 2030-01-10"]);
  });
});
