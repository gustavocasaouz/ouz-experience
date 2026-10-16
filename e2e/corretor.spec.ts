import { expect, test } from "@playwright/test";
import { CONTAS, adminDb, cpf, expectAccessible, purgeE2eData, sessao } from "./helpers";

test.beforeAll(purgeE2eData);
test.afterAll(purgeE2eData);

test.describe("corretor aprovado", () => {
test.use(sessao("corretorSemUman"));
test("empreendimento oculto (UMAN antes do lançamento) não aparece para o corretor", async ({ page }) => {
  await page.goto("/corretor");
  await expect(page.getByRole("heading", { name: "MAUI", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("UMAN");
  await page.goto("/corretor/empreendimentos/uman");
  await expect(page.getByText("Página não encontrada")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("R$");
});

test("corretor envia proposta dentro da política e recebe a reserva de 48 h", async ({ page }) => {
  const db = adminDb();
  const { data: soho } = await db.from("developments").select("id").eq("slug", "soho").single();
  const { data: units } = await db.from("units").select("id, code").eq("development_id", soho!.id).eq("status", "disponivel").eq("is_demo", true).order("code"); // só unidades demonstrativas
  // Corretor que teve reserva encerrada na unidade há pouco fica em carência (regra comercial): pula essas unidades.
  const { data: me } = await db.from("profiles").select("id").eq("email", CONTAS.corretorSemUman).single();
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  let free: { id: string; code: string } | undefined;
  for (const u of units ?? []) {
    const { count } = await db.from("reservations").select("id", { count: "exact", head: true }).eq("unit_id", u.id)
      .in("status", ["aguardando_documentos", "documentacao_enviada", "aguardando_conferencia", "documentacao_validada", "pendencias_documentacao"]);
    const { count: carencia } = await db.from("reservations").select("id", { count: "exact", head: true }).eq("unit_id", u.id)
      .eq("broker_user_id", me!.id).gte("ended_at", since);
    if (!count && !carencia) { free = u; break; }
  }
  test.skip(!free, "Nenhuma unidade livre no SOHO de desenvolvimento");

  await page.goto("/corretor/empreendimentos/soho");
  await expect(page.getByRole("columnheader", { name: "Preço de tabela" })).toBeVisible();
  await page.goto(`/corretor/propostas/nova?unidade=${free!.id}`);
  await expect(page.getByRole("button", { name: "Avaliar condições" })).toHaveCount(0); // regras ocultas do corretor
  await page.getByLabel("Nome do cliente").fill("[E2E] Cliente Proposta");
  await page.getByLabel("CPF ou CNPJ do cliente").fill(cpf(700000000 + (Date.now() % 99999)));
  // entrada 30%, 20 parcelas somando 20% a partir do mês que vem, saldo nas chaves
  await page.getByLabel("Percentual da linha 1").fill("30");
  await page.getByLabel("Quantidade da linha 2").fill("20");
  await page.getByLabel("Percentual da linha 2").fill("20");
  const nextMonth = new Date(Date.now() + 32 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Primeiro vencimento da linha 2").fill(nextMonth);
  await page.getByLabel("Primeiro vencimento da linha 3").fill("2028-06-30");
  await page.getByRole("button", { name: "Completar saldo" }).nth(2).click();
  await expect(page.getByText("confere com o valor ofertado")).toBeVisible();
  await page.getByRole("button", { name: "Enviar proposta" }).click();
  await page.waitForURL(/\/corretor\/propostas\/[0-9a-f-]+\?enviada=1/);
  await expect(page.getByText("Com reserva").first()).toBeVisible();
  await expect(page.getByText("Enviar documentação completa até")).toBeVisible();
  await expectAccessible(page);

  // para os outros corretores a unidade continua "Disponível" até o envio dos documentos
  const { data: unit } = await db.from("units").select("status").eq("id", free!.id).single();
  expect(unit!.status).toBe("disponivel");
});

});

test.describe("corretor pendente", () => {
test.use(sessao("corretorPendente"));
test("corretor pendente não acessa empreendimentos", async ({ page }) => {
  await page.goto("/corretor");
  await expect(page.getByText("Em análise").first()).toBeVisible();
  await page.goto("/corretor/empreendimentos/soho");
  await expect(page.getByText("Disponível apenas para corretores aprovados.")).toBeVisible();
});
});
