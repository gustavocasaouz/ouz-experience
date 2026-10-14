// Teste de concorrência REAL no Supabase de desenvolvimento:
// dois corretores enviam, ao mesmo tempo, propostas para a mesma unidade livre.
// Esperado: exatamente uma reserva; a outra proposta entra na fila. Depois, limpa (retira as propostas).
// Uso: node --env-file=.env.local scripts/testar-concorrencia.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

if ((process.env.APP_ENV ?? "development") !== "development") throw new Error("Somente em desenvolvimento.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const creds = Object.fromEntries([...readFileSync("contas-teste.local.txt", "utf8").matchAll(/e-mail: (\S+)\n\s+senha:\s+(\S+)/g)].map((m) => [m[1], m[2]]));
const SOHO = "00000000-0000-4000-8000-000000000001";

function cpf(seed) {
  const d = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    const s = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
async function login(email) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: creds[email] });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}
const iso = (d) => d.toISOString().slice(0, 10);

const [b1, b2] = await Promise.all([login("corretor.uman@teste.ouz.app.br"), login("corretor.semuman@teste.ouz.app.br")]);

// Remove restos de execuções anteriores (somente dados deste teste, em desenvolvimento).
async function purgeTestData() {
  const { data: old } = await admin.from("proposals").select("id, unit_id").eq("client_name", "[Teste] Concorrência");
  const ids = (old ?? []).map((p) => p.id);
  if (ids.length) {
    await admin.from("reservations").delete().in("proposal_id", ids);
    await admin.from("proposals").delete().in("id", ids);
    await admin.from("units").update({ status: "disponivel" }).in("id", [...new Set(old.map((p) => p.unit_id))]).eq("status", "reservada");
  }
}
await purgeTestData();

// unidade livre, sem reserva e sem fila
const { data: units } = await admin.from("units").select("id, code, status").eq("development_id", SOHO).eq("status", "disponivel").order("code");
let unit = null;
for (const u of units ?? []) {
  const { count } = await admin.from("proposals").select("*", { count: "exact", head: true }).eq("unit_id", u.id).in("status", ["na_fila", "reservada"]);
  if (!count) { unit = u; break; }
}
if (!unit) throw new Error("Nenhuma unidade livre no SOHO para o teste.");
const { data: prices } = await b1.rpc("current_unit_prices", { p_development_id: SOHO });
const price = Number(prices.find((p) => p.unit_id === unit.id).price);
const { data: settings } = await admin.from("development_commercial_settings").select("keys_expected_date").eq("development_id", SOHO).single();
const entrada = Math.round(price * 0.3 * 100) / 100;
const parcela = Math.round((price * 0.2) / 20 * 100) / 100;
const payments = [
  { kind: "entrada", amount: entrada, quantity: 1, first_due: iso(new Date(Date.now() + 86400000)) },
  { kind: "parcela", amount: parcela, quantity: 20, first_due: iso(new Date(Date.now() + 31 * 86400000)), interval_months: 1 },
  { kind: "chaves", amount: Math.round((price - entrada - parcela * 20) * 100) / 100, quantity: 1, first_due: settings.keys_expected_date },
];
const stamp = Date.now();
const draft = async (c, doc, k) => {
  const { data, error } = await c.rpc("broker_save_proposal_draft", {
    p_id: null, p_unit_id: unit.id, p_client_name: "[Teste] Concorrência", p_client_document: doc, p_offered_price: price,
    p_payments: payments, p_observations: "teste de concorrência", p_prelaunch_registration_id: null, p_idempotency_key: `conc-${stamp}-${k}`,
  });
  if (error) throw new Error(error.message);
  return data;
};
const [p1, p2] = await Promise.all([draft(b1, cpf(700000000 + (stamp % 99999)), 1), draft(b2, cpf(710000000 + (stamp % 99999)), 2)]);

console.log(`Unidade ${unit.code}: enviando duas propostas simultâneas…`);
const results = await Promise.all([
  b1.rpc("broker_submit_proposal", { p_proposal_id: p1, p_request_analysis: false }),
  b2.rpc("broker_submit_proposal", { p_proposal_id: p2, p_request_analysis: false }),
  // reenvios duplicados simultâneos (idempotência)
  b1.rpc("broker_submit_proposal", { p_proposal_id: p1, p_request_analysis: false }),
  b2.rpc("broker_submit_proposal", { p_proposal_id: p2, p_request_analysis: false }),
]);
const errors = results.filter((r) => r.error).map((r) => r.error.message);
const statuses = results.slice(0, 2).map((r) => r.data?.status);
const { data: active } = await admin.from("reservations").select("id").eq("unit_id", unit.id)
  .in("status", ["aguardando_documentos", "documentacao_enviada", "aguardando_conferencia", "documentacao_validada", "pendencias_documentacao"]);
const ok = errors.length === 0 && active.length === 1 && statuses.sort().join(",") === "na_fila,reservada";
console.log(ok ? "OK   Exatamente uma reserva; a outra proposta entrou na fila; reenvios não duplicaram." : `FALHA ${JSON.stringify({ errors, statuses, reservasAtivas: active.length })}`);

// limpeza: apaga os dados do teste (sem gerar carência para os corretores de teste)
await purgeTestData();
const { data: after } = await admin.from("units").select("status").eq("id", unit.id).single();
console.log(after.status === "disponivel" ? "OK   Limpeza concluída; unidade disponível." : `ATENÇÃO unidade ficou ${after.status}`);
process.exit(ok ? 0 : 1);
