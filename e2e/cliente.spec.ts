import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, purgeE2eData, sessao } from "./helpers";

test.beforeAll(purgeE2eData);
test.afterAll(purgeE2eData);
test.use(sessao("cliente"));

// Cliente de teste: SOHO DEMO-101, MAUI 108 e UMAN 105 do bloco A (scripts/criar-contas-teste.mjs).
const CODIGO = { SOHO: "DEMO-101", MAUI: "108", UMAN: "105" } as const;
const unidade = (page: Page, empreendimento: keyof typeof CODIGO) =>
  page.getByRole("link", { name: new RegExp(`${empreendimento}.*Unidade ${CODIGO[empreendimento]}`) });

test("cliente vê as três unidades; SOHO entregue fica enxuto", async ({ page }) => {
  await page.goto("/cliente");
  for (const nome of ["SOHO", "MAUI", "UMAN"] as const) await expect(unidade(page, nome)).toBeVisible();
  await unidade(page, "SOHO").click();
  await expect(page.getByText("Empreendimento entregue")).toBeVisible();
  const secoes = page.getByRole("navigation", { name: "Seções" });
  await expect(secoes.getByRole("link")).toHaveText(["Visão geral", "Documentos", "Financeiro"]); // manual do SOHO ainda não publicado
  await expect(page.getByText("Últimas atualizações")).toHaveCount(0);
  await expectAccessible(page);
  await secoes.getByRole("link", { name: "Financeiro" }).click();
  await expect(page.getByText("Última atualização pela OUZ")).toBeVisible();
  await expect(page.getByRole("table", { name: "Parcelas do contrato" })).toBeVisible();
  await expectAccessible(page);
});

test("MAUI: evolução física na visão geral e manual do proprietário com a estrutura", async ({ page }) => {
  await page.goto("/cliente");
  await unidade(page, "MAUI").click();
  const secoes = page.getByRole("navigation", { name: "Seções" });
  await expect(secoes.getByRole("link")).toHaveText(["Visão geral", "Documentos", "Financeiro", "Manual do proprietário"]);
  await expect(page.getByText("94,51%")).toBeVisible();
  await expectAccessible(page);
  await secoes.getByRole("link", { name: "Manual do proprietário" }).click();
  await expect(page.getByRole("heading", { name: "Manual do Proprietário" })).toBeVisible();
  await page.getByRole("link", { name: /Começar a leitura/ }).click();
  await expect(page.getByRole("link", { name: /Referências normativas/ })).toBeVisible(); // capítulo: os títulos
  await page.getByRole("navigation", { name: "Continuar a leitura" }).getByRole("link", { name: /Próxima/ }).click();
  await expect(page.getByRole("heading", { name: "Introdução" })).toBeVisible();
  await expect(page.getByText(/em preparação/)).toBeVisible(); // seção: ainda sem texto
  await expectAccessible(page);
  await page.goto(page.url().replace(/\/secao\/.*/, "/garantias"));
  await expect(page.getByText(/tabela de prazos de garantia de cada sistema está em preparação/)).toBeVisible();
});

test("UMAN: acompanhamento e catálogo de personalização com upgrades", async ({ page }) => {
  await page.goto("/cliente");
  await unidade(page, "UMAN").click();
  const secoes = page.getByRole("navigation", { name: "Seções" });
  await expect(secoes.getByRole("link")).toHaveText(["Visão geral", "Acompanhamento", "Documentos", "Financeiro", "Personalização"]);
  await secoes.getByRole("link", { name: "Personalização" }).click();
  const piso = page.getByRole("group", { name: "Piso das áreas sociais" });
  await expect(piso.getByRole("radio", { name: /90×90/ })).toBeChecked();
  await piso.getByRole("radio", { name: /120×120/ }).check();
  await expect(page.getByText("R$ 12.000,00").first()).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect(page.getByText(/Escolhas salvas/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Piso das áreas sociais" }).getByRole("radio", { name: /120×120/ })).toBeChecked();
  // volta ao padrão para não deixar estado
  await page.getByRole("group", { name: "Piso das áreas sociais" }).getByRole("radio", { name: /90×90/ }).check();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  await expect(page.getByText(/Escolhas salvas/)).toBeVisible();
});

test("cliente abre chamado e solicita concierge", async ({ page }) => {
  await page.goto("/cliente");
  await page.goto("/cliente/chamados/novo");
  // SOHO entregue: sem assistência técnica; MAUI: assistência técnica liberada.
  await page.getByLabel("Unidade").selectOption({ label: "SOHO · DEMO-101" });
  await expect(page.getByLabel("Categoria").getByRole("option")).toHaveText(["Dúvidas administrativas", "Solicitações sobre a unidade", "Pós-entrega", "Solicitação geral"]);
  await page.getByLabel("Unidade").selectOption({ label: "MAUI · 108" });
  await expect(page.getByLabel("Categoria").getByRole("option", { name: "Assistência técnica" })).toHaveCount(1);
  await page.getByLabel("Unidade").selectOption({ label: "SOHO · DEMO-101" });
  await page.getByLabel("Categoria").selectOption({ label: "Solicitação geral" });
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
