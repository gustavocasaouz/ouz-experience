import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { adminDb, CONTAS, login } from "./helpers";

/** Um login por conta de teste (sessão reaproveitada pelos testes), como um usuário real faria. */
export default async function globalSetup(config: FullConfig) {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  // zera o limite de tentativas de login SÓ das contas de teste (banco de desenvolvimento)
  const db = adminDb();
  for (const email of Object.values(CONTAS)) await db.from("rate_limits").delete().like("key", `%:${email}`);
  await db.from("rate_limits").delete().like("key", "lead:%"); // formulário público (banco de desenvolvimento)

  mkdirSync("e2e/.auth", { recursive: true });
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  for (const [nome, email] of Object.entries(CONTAS)) {
    const page = await browser.newPage({ baseURL, locale: "pt-BR" });
    await login(page, email, nome === "equipe" ? "/admin" : "/conta");
    await page.context().storageState({ path: `e2e/.auth/${nome}.json` });
    await page.close();
  }
  await browser.close();
}
