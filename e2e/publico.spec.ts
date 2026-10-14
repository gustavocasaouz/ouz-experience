import { expect, test } from "@playwright/test";
import { expectAccessible, purgeE2eData } from "./helpers";

test.afterAll(purgeE2eData);

test("página inicial com identidade OUZ e empreendimentos publicados", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/criamos empreendimentos com significado/i);
  await expect(page.getByRole("img", { name: "OUZ" }).first()).toBeVisible();
  for (const nome of ["SOHO", "MAUI", "UMAN"]) await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
  await expectAccessible(page);
});

test("página do empreendimento mostra só conteúdo público (sem preços)", async ({ page }) => {
  await page.goto("/empreendimentos/soho");
  await expect(page.getByRole("heading", { name: "SOHO", level: 1 })).toBeVisible();
  await expect(page.getByText("Rooftop 360º").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("R$");
  await expectAccessible(page);
});

test("formulário de interesse valida e registra o contato", async ({ page }) => {
  await page.goto("/interesse");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Revise os campos destacados.")).toBeVisible();
  await page.getByLabel("Nome completo").fill("[E2E] Visitante");
  await page.getByLabel("E-mail").fill(`e2e+${Date.now()}@teste.ouz.app.br`);
  await page.getByLabel(/política de privacidade/).check();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/Recebemos seu contato/)).toBeVisible();
});

test("áreas restritas exigem login", async ({ page }) => {
  for (const path of ["/cliente", "/corretor", "/admin", "/conta"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar\?next=/);
  }
  await expectAccessible(page);
});
