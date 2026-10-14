import { expect, test } from "@playwright/test";
import { expectAccessible, sessao } from "./helpers";

test.describe("equipe", () => {
test.use(sessao("equipe"));
test("equipe com verificação em duas etapas navega pela administração", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await expectAccessible(page);
  for (const [link, heading] of [
    ["Corretores", "Corretores"],
    ["Propostas", "Propostas"],
    ["Reservas", "Reservas"],
    ["Chamados", "Chamados"],
    ["Concierge", "Solicitações"],
  ] as const) {
    await page.getByRole("navigation", { name: /Navegação — Administração/ }).getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  // operador sem permissão de administração não vê a gestão da equipe
  await page.goto("/admin/equipe");
  await expect(page.getByText("Acesso restrito")).toBeVisible();
});

});

test.describe("conta comum", () => {
test.use(sessao("corretorSemUman"));
test("conta comum não chega à administração", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/conta\?restrito=admin/);
});
});
