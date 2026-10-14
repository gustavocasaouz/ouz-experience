"use server";

import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { assertStaff, AuthorizationError } from "@/server/auth/viewer";
import { parseBRL } from "@/lib/format";
import { dbErrorMessage, type ActionState } from "../types";

const KINDS = ["entrada", "parcela", "reforco", "chaves", "outro"];
const STATUSES = ["aberta", "paga", "parcialmente_paga", "renegociada", "cancelada"];
const HEADER = ["empreendimento", "unidade", "numero", "tipo", "vencimento", "valor_original", "atualizacao", "juros", "multa", "valor_atualizado", "valor_pago", "data_pagamento", "situacao", "referencia_externa"];

const date = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
};

/** Importação validada: lê CSV (; ou tab), valida TODAS as linhas e só grava se não houver erro. */
export async function importInstallments(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await assertStaff("financeiro");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo CSV." };
  if (file.size > 2 * 1024 * 1024) return { error: "Arquivo acima de 2 MB." };
  const text = (await file.text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0] ?? "").includes("\t") ? "\t" : ";";
  const head = (lines[0] ?? "").split(sep).map((h) => h.trim().toLowerCase());
  if (HEADER.some((h, i) => head[i] !== h)) return { error: `Cabeçalho esperado: ${HEADER.join(";")}` };

  const supabase = await createSupabaseServerClient();
  const { data: units } = await supabase.from("units").select("id, code, development:developments(slug, name)");
  const key = (dev: string, code: string) => `${dev.trim().toLowerCase()}|${code.trim().toUpperCase()}`;
  const map = new Map(
    (units ?? []).flatMap((u) => {
      const d = u.development as unknown as { slug: string; name: string };
      return [[key(d.slug, u.code), u.id], [key(d.name, u.code), u.id]] as Array<[string, string]>;
    }),
  );

  const errors: string[] = [];
  const rows = lines.slice(1).map((line, idx) => {
    const n = idx + 2;
    const c = line.split(sep).map((x) => x.trim());
    const unitId = map.get(key(c[0] ?? "", c[1] ?? ""));
    const err = (m: string) => errors.push(`linha ${n}: ${m}`);
    if (!unitId) err(`unidade "${c[1]}" do empreendimento "${c[0]}" não encontrada`);
    const number = Number(c[2]);
    if (!Number.isInteger(number) || number < 1) err("número da parcela inválido");
    const kind = (c[3] || "parcela").toLowerCase();
    if (!KINDS.includes(kind)) err(`tipo "${c[3]}" inválido`);
    // Parcela das chaves pode ficar sem data (vence na entrega).
    const due = c[4] ? date(c[4]) : null;
    if (!due && !(kind === "chaves" && !c[4])) err("vencimento inválido (use DD/MM/AAAA; vazio só para chaves)");
    const money = (v: string | undefined, required = false) => {
      if (!v) {
        if (required) err("valor original obrigatório");
        return null;
      }
      const p = parseBRL(v);
      if (p === null) err(`valor "${v}" inválido`);
      return p;
    };
    const status = (c[12] || "aberta").toLowerCase();
    if (!STATUSES.includes(status)) err(`situação "${c[12]}" inválida`);
    const paidOn = date(c[11] ?? "");
    if (paidOn === undefined) err("data de pagamento inválida");
    return {
      line: n,
      unit_id: unitId,
      number,
      kind,
      due_date: due,
      original_amount: money(c[5], true),
      monetary_update: money(c[6]),
      interest: money(c[7]),
      fine: money(c[8]),
      updated_amount: money(c[9]),
      paid_amount: money(c[10]) ?? 0,
      paid_on: paidOn ?? null,
      status,
      external_ref: c[13] || null,
    };
  });
  if (!rows.length) return { error: "Arquivo sem linhas de dados." };
  if (errors.length) return { error: `Nada foi importado. ${errors.length} problema(s): ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? "…" : ""}` };

  const { data, error } = await supabase.rpc("admin_import_installments", { p_file_name: file.name.slice(0, 200), p_rows: rows });
  if (error) return { error: `Nada foi importado: ${dbErrorMessage(error, "erro ao gravar.")}` };
  const r = data as { inseridas: number; atualizadas: number };
  return { ok: true, message: `Importação concluída: ${r.inseridas} parcela(s) nova(s), ${r.atualizadas} atualizada(s).` };
}
