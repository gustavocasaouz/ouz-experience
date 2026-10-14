// Confere ouz.app.br: delegação DNS, site respondendo e verificação do domínio no Resend (pede nova verificação se pendente).
// Uso: node --env-file=.env.local scripts/verificar-dominio.mjs
import { resolveNs } from "node:dns/promises";

const DOMAIN = "ouz.app.br";
const ok = (l, v, extra = "") => console.log(`${v ? "OK  " : "…   "} ${l}${extra ? ` — ${extra}` : ""}`);

const ns = await resolveNs(DOMAIN).catch(() => []);
ok("DNS delegado à Vercel", ns.some((n) => n.includes("vercel-dns")), ns.join(", "));

for (const url of [`https://${DOMAIN}/`, `https://www.${DOMAIN}/`]) {
  const r = await fetch(url, { redirect: "manual" }).catch((e) => ({ status: e.cause?.code ?? "erro" }));
  ok(`Site ${url}`, r.status === 200 || r.status === 308 || r.status === 307, String(r.status));
}

const key = process.env.RESEND_API_KEY;
if (key) {
  const list = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json());
  const d = list.data?.find((x) => x.name === DOMAIN);
  if (!d) ok("Domínio no Resend", false, "não cadastrado");
  else {
    if (d.status !== "verified") await fetch(`https://api.resend.com/domains/${d.id}/verify`, { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    ok("Domínio verificado no Resend", d.status === "verified", d.status);
  }
}
