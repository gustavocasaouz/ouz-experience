import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { CONTAS, sessao } from "./helpers";

// Varredura de telas: entra com cada perfil de teste, percorre todos os links internos (só GET, sem enviar
// formulários) e registra erros HTTP, telas de erro, erros de JavaScript e links quebrados.
// Uso: VARREDURA=1 npx playwright test e2e/varredura.spec.ts --project=desktop
test.skip(!process.env.VARREDURA, "varredura completa só com VARREDURA=1");
test.setTimeout(20 * 60_000);

type Achado = { perfil: string; url: string; tipo: string; detalhe: string; origem?: string };
const LIMITE_POR_MODELO = 3;
const LIMITE_TOTAL = 260;
const ERRO_TELA = /Algo não saiu como esperado|Página não encontrada|Application error|Unhandled Runtime Error/;
const IGNORAR_CONSOLE = /Download the React DevTools|\[HMR\]|\[Fast Refresh\]|favicon|Failed to load resource: the server responded with a status of 404 \(Not Found\).*_next\/image/;

const modelo = (path: string) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id").replace(/\?.*$/, "");

async function varrer(page: Page, perfil: string, inicio: string[], logado: boolean): Promise<{ achados: Achado[]; visitadas: number }> {
  const achados: Achado[] = [];
  const fila: Array<{ url: string; origem?: string }> = inicio.map((url) => ({ url }));
  const vistos = new Set<string>();
  const porModelo = new Map<string, number>();
  let atual = "";
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORAR_CONSOLE.test(m.text())) achados.push({ perfil, url: atual, tipo: "console", detalhe: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) => achados.push({ perfil, url: atual, tipo: "javascript", detalhe: String(e.message).slice(0, 300) }));

  let visitadas = 0;
  while (fila.length && visitadas < LIMITE_TOTAL) {
    const { url, origem } = fila.shift()!;
    if (vistos.has(url)) continue;
    vistos.add(url);
    const m = modelo(url);
    const n = porModelo.get(m) ?? 0;
    if (n >= LIMITE_POR_MODELO) continue;
    porModelo.set(m, n + 1);
    atual = url;
    visitadas++;
    let status = 0;
    try {
      const r = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
      status = r?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    } catch (e) {
      achados.push({ perfil, url, tipo: "navegacao", detalhe: String(e).slice(0, 200), origem });
      continue;
    }
    if (status >= 400) achados.push({ perfil, url, tipo: `http ${status}`, detalhe: "", origem });
    const texto = await page.locator("body").innerText().catch(() => "");
    const erro = texto.match(ERRO_TELA);
    if (erro) achados.push({ perfil, url, tipo: "tela de erro", detalhe: erro[0], origem });
    const final = new URL(page.url());
    // Conta logada mandada para o login = sessão perdida ou permissão faltando numa tela linkada.
    if (logado && final.pathname.startsWith("/entrar") && !url.startsWith("/entrar")) {
      achados.push({ perfil, url, tipo: "redirecionado ao login", detalhe: final.pathname + final.search, origem });
      continue;
    }
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const href of links) {
      const u = new URL(href);
      if (u.origin !== final.origin) continue;
      if (u.pathname.startsWith("/arquivos/") || u.pathname.startsWith("/_next/")) continue;
      const alvo = u.pathname + u.search;
      if (!vistos.has(alvo)) fila.push({ url: alvo, origem: final.pathname });
    }
  }
  return { achados, visitadas };
}

const PERFIS: Array<{ nome: string; conta?: keyof typeof CONTAS; inicio: string[] }> = [
  { nome: "visitante", inicio: ["/", "/entrar", "/entrar/cadastro", "/entrar/recuperar", "/privacidade", "/termos", "/offline"] },
  { nome: "cliente", conta: "cliente", inicio: ["/cliente", "/agenda", "/notificacoes", "/conta"] },
  { nome: "corretor sem UMAN", conta: "corretorSemUman", inicio: ["/corretor", "/agenda", "/notificacoes", "/conta"] },
  { nome: "corretor com UMAN", conta: "corretorComUman", inicio: ["/corretor"] },
  { nome: "corretor pendente", conta: "corretorPendente", inicio: ["/corretor", "/conta"] },
  { nome: "equipe", conta: "equipe", inicio: ["/admin", "/agenda", "/notificacoes", "/conta"] },
];

for (const p of PERFIS) {
  test.describe(p.nome, () => {
    if (p.conta) test.use(sessao(p.conta));
    test(`varredura: ${p.nome}`, async ({ page }) => {
      await page.addInitScript(() => sessionStorage.setItem("ouz_intro", "1"));
      const r = await varrer(page, p.nome, p.inicio, Boolean(p.conta));
      mkdirSync("e2e-report", { recursive: true });
      writeFileSync(`e2e-report/varredura-${p.nome.replace(/\s+/g, "-")}.json`, JSON.stringify(r, null, 2));
      console.log(`${p.nome}: ${r.visitadas} telas, ${r.achados.length} achado(s)`);
      expect(r.achados, JSON.stringify(r.achados, null, 2)).toEqual([]);
    });
  });
}
