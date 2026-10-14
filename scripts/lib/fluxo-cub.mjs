// Interpreta a planilha "Fluxo de Pagamentos Clientes" (uma aba por cliente + aba "Cub Mensal")
// e monta o payload de public.import_indexed_flow, com um relatório de conferência.
// Não lê CPF/CNPJ nem endereço: esses dados não entram no OUZ Experience.

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const serialToDate = (n) => new Date(EXCEL_EPOCH + Math.round(Number(n)) * 86400000).toISOString().slice(0, 10);
const num = (c) => (c && c.v !== null && c.v !== "" && Number.isFinite(Number(c.v)) ? Number(c.v) : null);
const str = (c) => (c && c.v !== null ? String(c.v).replace(/\s+/g, " ").trim() : "");
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const round2 = (n) => Math.round(n * 100) / 100;
const colOf = (ref) => ref.match(/^[A-Z]+/)[0];
const rowOf = (ref) => Number(ref.match(/\d+$/)[0]);
const nextCol = (col) => String.fromCharCode(col.charCodeAt(0) + 1);
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/;

function parseCub(sheet, currentMonth) {
  const values = [];
  for (const [ref, c] of sheet.cells) {
    if (colOf(ref) !== "B" || num(c) === null) continue;
    const v = num(sheet.cells.get("C" + rowOf(ref)));
    if (v === null || v <= 0) continue;
    const month = serialToDate(num(c)).slice(0, 8) + "01";
    if (month <= currentMonth) values.push({ month, value: round2(v) });
  }
  values.sort((a, b) => a.month.localeCompare(b.month));
  return values;
}

function parseClient(sheet, opts) {
  const errors = [], warnings = [];
  const cells = sheet.cells;
  const labelValue = (...labels) => {
    for (const [ref, c] of cells) {
      if (rowOf(ref) > 11 || !labels.includes(norm(str(c)))) continue;
      return cells.get(nextCol(colOf(ref)) + rowOf(ref)) ?? null;
    }
    return null;
  };
  let code = null;
  for (const [ref, c] of cells) {
    const m = rowOf(ref) <= 5 && str(c).match(/^apto\.?\s*(\S+)$/i);
    if (m) { code = m[1]; break; }
  }
  if (!code) errors.push("número do apartamento não encontrado");
  const full_name = str(labelValue("nome"));
  const email = str(labelValue("email", "e-mail")).toLowerCase();
  const phone = str(labelValue("telefone")).replace(/[^\d+]/g, "") || null;
  const parking = str(labelValue("vagas", "vaga"));
  const base = num(labelValue("cub"));
  const committed = num(labelValue("valor das compromissadas"));
  if (full_name.length < 2) errors.push("nome ausente");
  if (!EMAIL.test(email)) errors.push(`e-mail inválido: "${email}"`);
  if (!base) errors.push("CUB-base (campo Cub) ausente");
  if (!committed) errors.push("valor das compromissadas ausente");

  const header = [...cells].find(([, c]) => norm(str(c)) === "parcelas");
  if (!header) return { errors: [...errors, "cabeçalho 'Parcelas' não encontrado"], warnings };
  const h = rowOf(header[0]);
  const cols = {};
  for (const [ref, c] of cells) {
    if (rowOf(ref) !== h) continue;
    const t = norm(str(c));
    if (t.startsWith("data")) cols.due = colOf(ref);
    else if (t === "cub") cols.qty = colOf(ref);
    else if (t.startsWith("fluxo sem")) cols.orig = colOf(ref);
    else if (t.startsWith("fluxo com")) cols.upd = colOf(ref);
    else if (t === "s/n") cols.flag = colOf(ref);
  }
  for (const k of ["due", "orig", "upd", "flag"]) if (!cols[k]) errors.push(`coluna ausente no cabeçalho: ${k}`);
  const labelCol = colOf(header[0]);

  const paidRow = [...cells].find(([, c]) => norm(str(c)).startsWith("total ja pago"));
  const paidFormula = paidRow && cells.get(cols.upd + rowOf(paidRow[0]))?.f;
  const paidUntil = paidFormula?.match(/:\s*\$?[A-Z]+\$?(\d+)\s*\)/)?.[1];
  if (!paidUntil) errors.push("linha 'Total já pago até a presente data' sem fórmula SOMA reconhecível");
  const sheetPaid = paidRow ? num(cells.get(cols.upd + rowOf(paidRow[0]))) : null;
  const balanceRow = [...cells].find(([, c]) => norm(str(c)).startsWith("saldo devedor"));
  const sheetBalance = balanceRow ? num(cells.get(cols.upd + rowOf(balanceRow[0]))) : null;

  const rows = [...new Set([...cells.keys()].map(rowOf))].filter((r) => r > h).sort((a, b) => a - b);
  const installments = [];
  for (const r of rows) {
    const label = str(cells.get(labelCol + r));
    const dueCell = cells.get(cols.due + r);
    const dueNum = num(dueCell);
    const atKeys = dueNum === null && /final|chave/i.test(str(dueCell));
    if (dueNum === null && !atKeys) continue; // linhas de ano, totais etc.
    const orig = num(cells.get(cols.orig + r));
    const upd = num(cells.get(cols.upd + r));
    const sheetQty = cols.qty ? num(cells.get(cols.qty + r)) : null;
    // Antecipação: valor pago lançado direto no reajustado, sem valor original (reduz os CUBs da parcela final).
    const prepay = !(orig > 0) && upd > 0 && sheetQty > 0;
    if (!(orig > 0) && !prepay) continue; // mês sem pagamento
    const flag = str(cells.get(cols.flag + r)).toUpperCase();
    if (!prepay && flag !== "S" && flag !== "N") warnings.push(`${label || "linha " + r}: S/N vazio — tratado como sem reajuste`);
    const paid = paidUntil ? r <= Number(paidUntil) : false;
    if (paid && upd === null) errors.push(`${label || "linha " + r}: parcela paga sem valor reajustado`);
    if (prepay && !paid) errors.push(`${label || "linha " + r}: antecipação fora do período pago — confira`);
    const qty = sheetQty > 0 ? sheetQty : base && orig ? orig / base : null;
    if (!prepay && sheetQty > 0 && base && Math.abs(sheetQty - orig / base) > 0.0001) {
      warnings.push(`${label || "linha " + r}: CUBs da planilha (${sheetQty.toFixed(4)}) diferem de valor ÷ CUB-base (${(orig / base).toFixed(4)}) — usados os da planilha (antecipações descontadas)`);
    }
    installments.push({
      number: installments.length + 1,
      label,
      kind: atKeys || /^final|chave/i.test(label) ? "chaves" : prepay ? "outro" : /^entrada|^sinal/i.test(label) ? "entrada" : "parcela",
      due_date: atKeys ? null : serialToDate(dueNum),
      original_amount: round2(prepay ? upd : orig),
      indexed: !prepay && flag === "S",
      index_quantity: qty === null ? null : Number(qty.toFixed(10)),
      paid,
      paid_amount: paid && upd !== null ? round2(upd) : undefined,
      prepay,
    });
  }
  if (!installments.length) errors.push("nenhuma parcela encontrada");

  // Conferências com a própria planilha.
  const sumOrig = round2(installments.filter((i) => !i.prepay).reduce((a, i) => a + i.original_amount, 0));
  if (committed && Math.abs(sumOrig - committed) > 1) warnings.push(`soma das parcelas (${sumOrig.toFixed(2)}) ≠ valor das compromissadas (${committed.toFixed(2)})`);
  const paidTotal = round2(installments.filter((i) => i.paid).reduce((a, i) => a + (i.paid_amount ?? 0), 0));
  if (sheetPaid !== null && Math.abs(paidTotal - sheetPaid) > 1) warnings.push(`total pago calculado (${paidTotal.toFixed(2)}) ≠ planilha (${sheetPaid.toFixed(2)})`);
  const cubAt = (date) => {
    const m = date ? date.slice(0, 8) + "01" : null;
    const exact = opts.cub.find((c) => c.month === m);
    return exact ? { v: exact.value, est: false } : opts.cub.length ? { v: opts.cub.at(-1).value, est: true } : null;
  };
  let balance = 0;
  for (const i of installments.filter((x) => !x.paid)) {
    if (!i.indexed) { balance += i.original_amount; continue; }
    const c = cubAt(i.due_date);
    balance += c && i.index_quantity ? round2(i.index_quantity * c.v) : i.original_amount;
  }
  balance = round2(balance);
  if (sheetBalance !== null && Math.abs(balance - sheetBalance) > Math.max(1, sheetBalance * 0.001)) {
    warnings.push(`saldo calculado pelo CUB (${balance.toFixed(2)}) difere da planilha (${sheetBalance.toFixed(2)})`);
  }

  return {
    errors, warnings,
    client: {
      ref: `${opts.slug}:apto-${code}`, unit_code: code, parking, full_name, email, phone,
      contract_value: committed ? round2(committed) : null, base_index: base ? round2(base) : null,
      note: parking ? `Vagas: ${parking}` : "",
      installments: installments.map((i) => { const out = { ...i }; delete out.label; delete out.prepay; return out; }),
    },
    summary: {
      sheet: sheet.name.trim(), unit: code, parcelas: installments.length, pagas: installments.filter((i) => i.paid).length,
      ultima_paga: installments.filter((i) => i.paid).at(-1)?.due_date ?? null,
      contrato: committed, pago: paidTotal, pago_planilha: sheetPaid, saldo_estimado: balance, saldo_planilha: sheetBalance,
      chaves: installments.filter((i) => i.kind === "chaves").length,
      antecipacoes: installments.filter((i) => i.prepay).length,
    },
  };
}

/**
 * @param {{ name: string, cells: Map<string, {v: string|null, f: string|null}> }[]} sheets
 * @param {{ slug: string, today?: string }} o  today = AAAA-MM-DD (America/Sao_Paulo)
 */
export function parseFluxo(sheets, o) {
  const today = o.today ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const currentMonth = today.slice(0, 8) + "01";
  const cubSheet = sheets.find((s) => /cub/i.test(s.name));
  const errors = [];
  const cub = cubSheet ? parseCub(cubSheet, currentMonth) : [];
  if (!cub.length) errors.push("aba 'Cub Mensal' não encontrada ou vazia");
  const warnings = [];
  const last = cub.slice(-3);
  if (last.length >= 2 && last.at(-1).value === last.at(-2).value) {
    warnings.push(`CUB de ${last.at(-1).month.slice(0, 7)} igual ao do mês anterior: confira se já é o valor oficial`);
  }
  const clientSheets = sheets.filter((s) => [...s.cells.values()].some((c) => norm(str(c)).startsWith("total ja pago")));
  const parsed = clientSheets.map((s) => ({ sheet: s.name.trim(), ...parseClient(s, { slug: o.slug, cub }) }));
  const seen = new Map();
  for (const p of parsed) {
    const code = p.client?.unit_code;
    if (code && seen.has(code)) p.errors.push(`apartamento ${code} repetido (também na aba ${seen.get(code)})`);
    if (code) seen.set(code, p.sheet);
  }
  return {
    errors: [...errors, ...parsed.flatMap((p) => p.errors.map((e) => `${p.sheet}: ${e}`))],
    warnings: [...warnings, ...parsed.flatMap((p) => p.warnings.map((w) => `${p.sheet}: ${w}`))],
    cub: { meses: cub.length, ultimos: last },
    summaries: parsed.map((p) => p.summary).filter(Boolean),
    payload: { index_values: cub, clients: parsed.map((p) => p.client).filter(Boolean) },
  };
}
