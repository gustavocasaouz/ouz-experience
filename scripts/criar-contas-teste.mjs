// Cria contas FICTÍCIAS de teste no Supabase de DESENVOLVIMENTO (idempotente) e as devolve ao estado-base.
// Atenção: gera senhas novas a cada execução.
// Uso: node --env-file=.env.local scripts/criar-contas-teste.mjs
// Senhas geradas aleatoriamente e gravadas em contas-teste.local.txt (fora do Git). Nada é impresso.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

if ((process.env.APP_ENV ?? "development") !== "development") {
  console.error("Recusado: APP_ENV precisa ser 'development'.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const db = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const UMAN = "00000000-0000-4000-8000-000000000003";
const SOHO = "00000000-0000-4000-8000-000000000001";

/** CPF fictício válido (dígitos verificadores corretos), derivado de uma semente. */
function cpf(seed) {
  const d = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    const s = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const must = (res, label) => {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data;
};

const ACCOUNTS = [
  { key: "corretor_pendente", email: "corretor.pendente@teste.ouz.app.br", name: "[Teste] Corretor Pendente", broker: { status: "pendente", cpf: cpf(901000001), creci: "90001" } },
  { key: "corretor_uman", email: "corretor.uman@teste.ouz.app.br", name: "[Teste] Corretor com UMAN", broker: { status: "aprovado", cpf: cpf(901000002), creci: "90002", uman: true } },
  { key: "corretor_sem_uman", email: "corretor.semuman@teste.ouz.app.br", name: "[Teste] Corretor sem UMAN", broker: { status: "aprovado", cpf: cpf(901000003), creci: "90003" } },
  { key: "cliente", email: "cliente@teste.ouz.app.br", name: "[Teste] Cliente SOHO", client: { unit: "DEMO-101", development: SOHO } },
];

const existing = must(await db.auth.admin.listUsers({ perPage: 1000 }), "listUsers").users;
const lines = ["CONTAS DE TESTE — Supabase de desenvolvimento (fictícias). Não use em produção.", ""];

for (const acc of ACCOUNTS) {
  const password = `Teste-${randomBytes(9).toString("base64url")}9`;
  let user = existing.find((u) => u.email === acc.email);
  if (user) {
    must(await db.auth.admin.updateUserById(user.id, { password }), "updateUser");
  } else {
    user = must(
      await db.auth.admin.createUser({ email: acc.email, password, email_confirm: true, user_metadata: { full_name: acc.name } }),
      "createUser",
    ).user;
  }
  must(await db.from("profiles").update({ full_name: acc.name }).eq("id", user.id), "profile");

  if (acc.broker) {
    const b = acc.broker;
    const { data: prev } = await db.from("broker_profiles").select("status").eq("user_id", user.id).maybeSingle();
    if (!prev) {
      must(
        await db.from("broker_profiles").insert({
          user_id: user.id, full_name: acc.name, cpf: b.cpf, cpf_hash: "calculado-no-banco", creci_number: b.creci, creci_uf: "SC",
          email: acc.email, phone: "+5548900000000", city: "Florianópolis", region: "SC", country: "Brasil",
          agency_name: "[Teste] Imobiliária Fictícia", terms_version: "teste", privacy_version: "teste", terms_accepted_at: new Date().toISOString(),
        }),
        "broker insert",
      );
    }
    // Volta ao estado-base do teste (desfaz aprovações/suspensões feitas manualmente nas telas).
    if (b.status === "pendente" && prev && prev.status !== "pendente") {
      must(await db.from("broker_profiles").update({ status: "pendente", status_reason: null, status_changed_at: new Date().toISOString() }).eq("user_id", user.id), "reset pendente");
      must(await db.from("broker_status_history").insert({ broker_user_id: user.id, from_status: prev.status, to_status: "pendente", reason: "Reset das contas de teste (script)" }), "history");
    }
    if (!b.uman) {
      await db.from("development_broker_grants").update({ revoked_at: new Date().toISOString(), revoke_reason: "Reset das contas de teste (script)" })
        .eq("development_id", UMAN).eq("broker_user_id", user.id).is("revoked_at", null);
    }
    if (b.status === "aprovado" && prev?.status !== "aprovado") {
      must(await db.from("broker_profiles").update({ status: "aprovado", status_reason: "Conta de teste", status_changed_at: new Date().toISOString() }).eq("user_id", user.id), "approve");
      must(await db.from("broker_status_history").insert({ broker_user_id: user.id, from_status: "pendente", to_status: "aprovado", reason: "Conta de teste (script)" }), "history");
    }
    if (b.uman) {
      let { data: group } = await db.from("broker_groups").select("id").eq("name", "[Teste] Parceiros UMAN").maybeSingle();
      if (!group) group = must(await db.from("broker_groups").insert({ name: "[Teste] Parceiros UMAN", description: "Grupo fictício de teste" }).select("id").single(), "group");
      await db.from("broker_group_members").upsert({ group_id: group.id, broker_user_id: user.id }, { onConflict: "group_id,broker_user_id", ignoreDuplicates: true });
      const { data: grant } = await db.from("development_broker_grants").select("id").eq("development_id", UMAN).eq("group_id", group.id).is("revoked_at", null).maybeSingle();
      if (!grant) must(await db.from("development_broker_grants").insert({ development_id: UMAN, group_id: group.id, reason: "Teste: grupo com acesso ao UMAN" }), "grant");
    }
  }

  if (acc.client) {
    let { data: client } = await db.from("clients").select("id").eq("email", acc.email).maybeSingle();
    if (!client) client = must(await db.from("clients").insert({ full_name: acc.name, email: acc.email, is_demo: true }).select("id").single(), "client");
    must(await db.from("clients").update({ user_id: user.id }).eq("id", client.id), "client link");
    const unit = must(await db.from("units").select("id").eq("development_id", acc.client.development).eq("code", acc.client.unit).single(), "unit");
    await db.from("client_units").upsert({ client_id: client.id, unit_id: unit.id, relation: "titular", active: true }, { onConflict: "client_id,unit_id" });
  }

  lines.push(`${acc.name}`, `  e-mail: ${acc.email}`, `  senha:  ${password}`, "");
}

writeFileSync("contas-teste.local.txt", lines.join("\n"), { mode: 0o600 });
console.log(`OK: ${ACCOUNTS.length} contas prontas. Credenciais em contas-teste.local.txt`);
