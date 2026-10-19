/** Regras de leitura dos manuais de uso, operação e manutenção (sem acesso ao banco). */

export type ManualKind = "proprietario" | "condominio";
export const MANUAL_KIND_LABELS: Record<ManualKind, string> = {
  proprietario: "Manual do proprietário",
  condominio: "Manual do condomínio",
};

export type SectionRef = { num: string; title: string; level: number };

export const MAINTENANCE_FREQUENCY_LABELS: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  plurianual: "A cada 2 anos ou mais",
  conforme: "Conforme necessidade ou fabricante",
};

export const parentNum = (n: string) => (n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : null);
export const chapterOf = (n: string) => n.split(".")[0]!;
export const isSystem = (s: SectionRef) => s.num.startsWith("5.") && s.level === 2;

/** "1.10" depois de "1.9". */
export function compareNums(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** Ordem de leitura: capítulos e seções de nível 2 (as de nível 3+ aparecem dentro da seção-mãe). */
export function readingSequence(sections: SectionRef[]) {
  return sections.filter((s) => s.num !== "0" && s.level <= 2).map((s) => s.num);
}

/** Uma seção mostra o próprio texto e o das subseções (3.2 inclui 3.2.1, 3.2.2…). Capítulos mostram só a introdução. */
export function pageNumFor(num: string, sections: SectionRef[]): string {
  const s = sections.find((x) => x.num === num);
  if (!s || s.level <= 2) return num;
  let p = parentNum(num);
  while (p) {
    const ps = sections.find((x) => x.num === p);
    if (ps && ps.level <= 2) return p;
    p = parentNum(p);
  }
  return num;
}

/**
 * As seções de sistema trazem subtítulos marcados (h4.sub-uso / sub-man / sub-perda) que viram abas:
 * visão geral, cuidados de uso, manutenção preventiva e perda de garantia.
 */
export type PaneKey = "geral" | "uso" | "man" | "perda";
export const PANE_LABELS: Record<PaneKey, string> = {
  geral: "Visão geral",
  uso: "Cuidados de uso",
  man: "Manutenção preventiva",
  perda: "Perda de garantia",
};
export function splitPanes(html: string): Array<{ key: PaneKey; html: string }> {
  const out: Record<PaneKey, string> = { geral: "", uso: "", man: "", perda: "" };
  let cur: PaneKey = "geral";
  for (const part of html.split(/(<h4 class="sub sub-(?:uso|man|perda)"[^>]*>[\s\S]*?<\/h4>)/)) {
    const m = part.match(/^<h4 class="sub sub-(uso|man|perda)"/);
    if (m) cur = m[1] as PaneKey;
    else out[cur] += part;
  }
  return (Object.keys(out) as PaneKey[]).filter((k) => out[k].trim()).map((k) => ({ key: k, html: out[k] }));
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
export function plainText(html: string) {
  return html
    .replace(/<figure[\s\S]*?<\/figure>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Trecho em volta da primeira ocorrência (sem acento/caixa), para os resultados de busca. */
export function snippet(text: string, term: string, radius = 90): { before: string; match: string; after: string } | null {
  const i = fold(text).indexOf(fold(term));
  if (i < 0) return null;
  const a = Math.max(0, i - radius);
  return {
    before: (a > 0 ? "…" : "") + text.slice(a, i),
    match: text.slice(i, i + term.length),
    after: text.slice(i + term.length, i + term.length + radius * 1.5) + "…",
  };
}

export function matches(text: string, term: string) {
  return fold(text).includes(fold(term));
}

/** Tira do texto as linhas que já aparecem como anexo (mesmo texto), para não repetir. */
export function withoutLines(html: string, lines: string[]) {
  if (!lines.length) return html;
  const set = new Set(lines.map((l) => fold(l).trim()));
  return html.replace(/<p>([\s\S]*?)<\/p>\s*/g, (m, inner: string) => (set.has(fold(plainText(inner))) ? "" : m));
}
