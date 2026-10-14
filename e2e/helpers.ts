import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { totp } from "../scripts/lib/totp.mjs";

type Account = { email: string; password: string; mfa?: string };

export function account(email: string): Account {
  const text = readFileSync("contas-teste.local.txt", "utf8");
  const block = text.split(/\n\s*\n/).find((b) => b.includes(`e-mail: ${email}`));
  if (!block) throw new Error(`Conta de teste não encontrada: ${email}. Rode scripts/criar-contas-teste.mjs`);
  return {
    email,
    password: /senha:\s+(\S+)/.exec(block)![1]!,
    mfa: /mfa:\s+(\S+)/.exec(block)?.[1],
  };
}

export const CONTAS = {
  corretorSemUman: "corretor.semuman@teste.ouz.app.br",
  corretorComUman: "corretor.uman@teste.ouz.app.br",
  corretorPendente: "corretor.pendente@teste.ouz.app.br",
  cliente: "cliente@teste.ouz.app.br",
  equipe: "equipe@teste.ouz.app.br",
};

/** Sessão salva no início da suíte (e2e/global-setup.ts). */
export const sessao = (nome: keyof typeof CONTAS) => ({ storageState: `e2e/.auth/${nome}.json` });

export async function login(page: Page, email: string, next = "/conta") {
  const acc = account(email);
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail").fill(acc.email);
  await page.getByLabel("Senha").fill(acc.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (acc.mfa && next.startsWith("/admin")) {
    await page.waitForURL(/\/entrar\/mfa/);
    await page.getByLabel("Código de 6 dígitos").fill(totp(acc.mfa));
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}

/** Acessibilidade: falha em violações graves ou críticas (WCAG A/AA). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Cliente com chave secreta, só para preparar e limpar dados de teste no banco de desenvolvimento. */
export function adminDb() {
  if ((process.env.APP_ENV ?? "development") !== "development") throw new Error("E2E só em desenvolvimento.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
  return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export const E2E_TAG = "[E2E]";

export async function purgeE2eData() {
  const db = adminDb();
  const { data: props } = await db.from("proposals").select("id, unit_id").like("client_name", `${E2E_TAG}%`);
  const ids = (props ?? []).map((p) => p.id);
  if (ids.length) {
    await db.from("reservations").delete().in("proposal_id", ids);
    await db.from("proposals").delete().in("id", ids);
    await db.from("units").update({ status: "disponivel" }).in("id", [...new Set(props!.map((p) => p.unit_id))]).eq("status", "reservada");
  }
  await db.from("tickets").delete().like("title", `${E2E_TAG}%`);
  await db.from("concierge_requests").delete().like("details", `${E2E_TAG}%`);
  await db.from("leads").delete().like("email", "e2e+%");
}

/** CPF fictício válido. */
export function cpf(seed: number) {
  const d = String(seed).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    const s = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
