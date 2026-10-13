// Entra com cada conta de teste no Supabase de desenvolvimento e confere o isolamento (RLS + Storage).
// Uso: node --env-file=.env.local scripts/testar-acessos.mjs   (após criar-contas-teste.mjs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const text = readFileSync("contas-teste.local.txt", "utf8");
const creds = Object.fromEntries([...text.matchAll(/e-mail: (\S+)\n\s+senha:\s+(\S+)/g)].map((m) => [m[1], m[2]]));
const UMAN = "00000000-0000-4000-8000-000000000003";
const SOHO = "00000000-0000-4000-8000-000000000001";
let failures = 0;

async function as(email) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: creds[email] });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}
const count = async (q) => {
  const { data, error } = await q;
  return error ? 0 : data.length;
};
function expect(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FALHA"} ${label}${ok ? "" : ` — obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`}`);
}
const view = async (c) => ({
  unidadesUMAN: await count(c.from("units").select("id").eq("development_id", UMAN)),
  conteudoUMAN: await count(c.from("development_broker_content").select("development_id").eq("development_id", UMAN)),
  teaserUMAN: await count(c.from("development_teasers").select("development_id").eq("development_id", UMAN)),
  unidadesSOHO: await count(c.from("units").select("id").eq("development_id", SOHO)),
});

const pend = await as("corretor.pendente@teste.ouz.app.br");
expect("Corretor pendente: nada restrito", await view(pend), { unidadesUMAN: 0, conteudoUMAN: 0, teaserUMAN: 0, unidadesSOHO: 0 });
await pend.from("broker_profiles").update({ status: "aprovado" }).eq("user_id", (await pend.auth.getUser()).data.user.id);
const { data: st } = await pend.from("broker_profiles").select("status").single();
expect("Corretor pendente não se autoaprova", st?.status, "pendente");

const sem = await as("corretor.semuman@teste.ouz.app.br");
expect("Corretor aprovado SEM UMAN: só teaser do UMAN, SOHO completo", await view(sem), { unidadesUMAN: 0, conteudoUMAN: 0, teaserUMAN: 1, unidadesSOHO: 4 });
const { data: canSem } = await sem.rpc("broker_can_access_development", { p_development_id: UMAN });
expect("Corretor sem UMAN: acesso completo negado", canSem, false);
expect("Corretor não lista grupos nem autorizações", [await count(sem.from("broker_groups").select("id")), await count(sem.from("development_broker_grants").select("id"))], [0, 0]);
expect("Corretor não vê outros corretores", await count(sem.from("broker_profiles").select("user_id")), 1);

const com = await as("corretor.uman@teste.ouz.app.br");
expect("Corretor aprovado COM UMAN (via grupo): conteúdo completo", await view(com), { unidadesUMAN: 4, conteudoUMAN: 1, teaserUMAN: 1, unidadesSOHO: 4 });

const cli = await as("cliente@teste.ouz.app.br");
const units = (await cli.from("units").select("code, development_id")).data ?? [];
expect("Cliente vê só a própria unidade", units.map((u) => u.code), ["DEMO-101"]);
expect("Cliente não vê clientes, CPF de outros nem conteúdo de corretor", [
  await count(cli.from("clients").select("id")),
  await count(cli.from("development_broker_content").select("development_id")),
  await count(cli.from("broker_profiles").select("user_id")),
], [1, 0, 0]);
const staff = await cli.from("staff_members").insert({ user_id: (await cli.auth.getUser()).data.user.id, role: "administrador" });
expect("Cliente não vira staff", Boolean(staff.error), true);
const { data: sst } = await cli.rpc("staff_status");
expect("Cliente sem acesso administrativo", sst?.is_staff, false);

console.log(failures ? `\n${failures} falha(s).` : "\nTodas as verificações passaram.");
process.exit(failures ? 1 : 0);
