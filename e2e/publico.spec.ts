import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

// Pula a animação de abertura (exibida uma vez por sessão).
test.beforeEach(async ({ page }) => page.addInitScript(() => sessionStorage.setItem("ouz_intro", "1")));

test("página inicial é só a porta de acesso: cliente, corretor e equipe", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/criamos empreendimentos com significado/i);
  const acessos = page.getByRole("navigation", { name: "Acessos" });
  await expect(acessos.getByRole("link", { name: /Área do cliente/ })).toHaveAttribute("href", "/entrar?next=/cliente");
  await expect(acessos.getByRole("link", { name: /Portal do corretor/ })).toHaveAttribute("href", "/entrar?next=/corretor");
  await expect(page.getByRole("link", { name: "Acesso da equipe OUZ" })).toHaveAttribute("href", "/entrar?next=/admin");
  // "Voltar ao site" só no computador (no celular/app levaria para fora do app).
  const site = page.getByRole("link", { name: /Voltar ao site da OUZ/ });
  if (isMobile) await expect(site).toBeHidden();
  else await expect(site).toHaveAttribute("href", "https://ouzgroup.com.br");
  await expectAccessible(page);
});

test("login mostra o acesso escolhido e volta para o início (não para o site)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Acessos" }).getByRole("link", { name: /Portal do corretor/ }).click();
  await expect(page).toHaveURL(/\/entrar\?next=%2Fcorretor|\/entrar\?next=\/corretor/);
  await expect(page.getByText("Portal do corretor")).toBeVisible();
  await page.getByRole("link", { name: /Voltar ao início/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expectAccessible(page);
});

test("páginas institucionais antigas levam ao site oficial", async ({ request }) => {
  for (const path of ["/empreendimentos", "/empreendimentos/soho", "/novidades", "/eventos", "/interesse"]) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(307);
    expect(r.headers().location, path).toMatch(/^https:\/\/ouzgroup\.com\.br\/?$/);
  }
});

test("áreas restritas exigem login", async ({ page }) => {
  for (const path of ["/cliente", "/corretor", "/admin", "/conta"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar\?next=/);
  }
  await expectAccessible(page);
});
