// Verifica a conexão com o Supabase e o isolamento básico (sem imprimir segredos).
// Uso: node --env-file=.env.local scripts/verificar-supabase.mjs
import { createClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false } });
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false } });

const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);

const pub = await anon.from("developments").select("slug").order("sort_order");
check("Visitante lê empreendimentos publicados", !pub.error && pub.data?.length === 3, pub.error?.message ?? pub.data?.map((d) => d.slug).join(", "));

const units = await anon.from("units").select("id");
check("Visitante NÃO lê unidades", Boolean(units.error) || units.data?.length === 0, units.error ? "bloqueado" : `${units.data?.length} linhas`);

const restricted = await anon.from("development_broker_content").select("development_id");
check("Visitante NÃO lê conteúdo restrito", Boolean(restricted.error) || restricted.data?.length === 0, restricted.error ? "bloqueado" : `${restricted.data?.length} linhas`);

const staffIns = await anon.from("staff_members").insert({ user_id: "00000000-0000-0000-0000-000000000000", role: "administrador" });
check("Visitante NÃO cria staff", Boolean(staffIns.error), staffIns.error ? "bloqueado" : "INSERIU!");

const rl = await admin.rpc("check_rate_limit", { p_key: "verificacao", p_max: 100, p_window_seconds: 60 });
check("Chave secreta funciona no servidor", !rl.error, rl.error?.message ?? "");

const buckets = await admin.storage.listBuckets();
check("Buckets de arquivos", !buckets.error && buckets.data?.length >= 6, buckets.data?.map((b) => `${b.id}${b.public ? "(público)" : ""}`).join(", "));

const cron = await admin.from("retention_policies").select("category");
check("Políticas de retenção", !cron.error && cron.data?.length === 3);
