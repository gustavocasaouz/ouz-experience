import { describe, expect, it } from "vitest";
import { pageNumFor, splitPanes, withoutLines } from "./manual";

describe("manual", () => {
  it("separa as abas do sistema pelos subtítulos marcados", () => {
    const panes = splitPanes(`<p>a</p><h4 class="sub sub-uso">Uso</h4><p>b</p><h4 class="sub sub-perda">Perda</h4><p>c</p>`);
    expect(panes).toEqual([
      { key: "geral", html: "<p>a</p>" },
      { key: "uso", html: "<p>b</p>" },
      { key: "perda", html: "<p>c</p>" },
    ]);
  });

  it("subseções de nível 3+ abrem na página da seção de nível 2", () => {
    const idx = [{ num: "10", title: "", level: 1 }, { num: "10.4", title: "", level: 2 }, { num: "10.4.4", title: "", level: 3 }, { num: "10.4.4.1", title: "", level: 4 }];
    expect(pageNumFor("10.4.4.1", idx)).toBe("10.4");
    expect(pageNumFor("10", idx)).toBe("10");
  });

  it("não repete no texto as linhas que viraram anexo (sem diferenciar acento e caixa)", () => {
    const html = `<p>Projeto Arquitetônico</p>\n<p>Projeto Estrutural</p>\n<p>Veja os anexos.</p>`;
    expect(withoutLines(html, ["projeto arquitetonico", "Projeto Estrutural"])).toBe("<p>Veja os anexos.</p>");
    expect(withoutLines(html, [])).toBe(html);
  });
});
