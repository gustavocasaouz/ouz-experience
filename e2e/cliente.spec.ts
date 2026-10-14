import { expect, test } from "@playwright/test";
import { expectAccessible, purgeE2eData, sessao } from "./helpers";

test.beforeAll(purgeE2eData);
test.afterAll(purgeE2eData);
test.use(sessao("cliente"));

test("cliente vê a própria unidade, acompanhamento e financeiro", async ({ page }) => {
  await page.goto("/cliente");
  await expect(page.getByRole("heading", { name: "Unidade DEMO-101" })).toBeVisible();
  await page.getByRole("link", { name: /Unidade DEMO-101/ }).click();
  // SOHO está entregue: visão de entregue, sem personalização, com "Entrega e garantia".
  await expect(page.getByText("Empreendimento entregue")).toBeVisible();
  const secoes = page.getByRole("navigation", { name: "Seções" });
  await expect(secoes.getByRole("link", { name: "Entrega e garantia" })).toBeVisible();
  await expect(secoes.getByRole("link", { name: "Personalização" })).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Financeiro" }).click();
  await expect(page.getByText("Última atualização pela OUZ")).toBeVisible();
  await expect(page.getByRole("table", { name: "Parcelas do contrato" })).toBeVisible();
  await expectAccessible(page);
});

test("cliente abre chamado e solicita concierge", async ({ page }) => {
  await page.goto("/cliente");
  await page.goto("/cliente/chamados/novo");
  await page.getByLabel("Assunto").fill("[E2E] Torneira pingando");
  await page.getByLabel("Descreva a situação").fill("Teste automatizado: torneira do lavabo pingando.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByText(/Chamado aberto/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "[E2E] Torneira pingando" })).toBeVisible();

  await page.goto("/cliente/concierge");
  await page.getByRole("link", { name: /Limpeza/ }).first().click();
  await page.getByLabel("O que você precisa?").fill("[E2E] Limpeza após mudança");
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page.getByText(/Solicitação enviada/)).toBeVisible();
  await expect(page.getByText("Solicitada").first()).toBeVisible();
});

test("cliente não acessa outras áreas nem unidades de terceiros", async ({ page }) => {
  await page.goto("/cliente");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/conta\?restrito=admin/);
  await page.goto("/cliente/unidades/00000000-0000-4000-8000-000000000099");
  await expect(page.getByText("Página não encontrada")).toBeVisible(); // nenhum dado de outra unidade é exibido
  await expect(page.locator("body")).not.toContainText("Financeiro");
});
