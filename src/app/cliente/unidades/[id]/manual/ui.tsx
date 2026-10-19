import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, cx } from "@/design-system";
import { myUnit } from "@/server/queries/client-unit";
import { getManual, manualIndex, type ManualAttachment } from "@/server/queries/manual";
import type { ManualKind } from "@/lib/manual";
import { Icon, IconBadge, type Tone } from "./icons";

/** Unidade + manual + índice. Se o cliente não tem a unidade ou o manual não está publicado, 404. */
export async function loadManual(params: Promise<{ id: string; kind: string }>) {
  const { id, kind } = await params;
  if (kind !== "proprietario" && kind !== "condominio") notFound();
  const u = await myUnit(id);
  if (!u) notFound();
  const manual = await getManual(u.development.id, u.unit.id, kind as ManualKind);
  if (!manual) notFound();
  const index = await manualIndex(manual.id);
  return { u, manual, index, base: `/cliente/unidades/${id}/manual/${kind}` };
}

export type ManualArea = { href: string; icon: string; tone: Tone; title: string; text: string; match: string[] };

/**
 * As áreas do manual, na mesma ordem e com os mesmos nomes no menu e nos quadros da página inicial.
 * `match`: páginas que contam como "dentro" da área (para destacar no menu).
 */
export function manualAreas(
  { manual, index, base }: Pick<Awaited<ReturnType<typeof loadManual>>, "manual" | "index" | "base">,
  warrantyText = "Contados a partir do habite-se",
): ManualArea[] {
  const has = (n: string) => index.some((s) => s.num === n);
  const s = (n: string) => `${base}/secao/${n}`;
  const systems = index.filter((x) => x.num.startsWith("5.") && x.level === 2).length;
  const areas: Array<ManualArea | false> = [
    has("5") && { href: `${base}/sistemas`, icon: "tools", tone: "gold", title: "Sistemas da edificação", text: `Uso, cuidados e manutenção de ${systems} sistemas`, match: [s("5")] },
    { href: `${base}/garantias`, icon: "shield", tone: "gold", title: "Prazos de garantia", text: warrantyText, match: [s("2")] },
    { href: `${base}/manutencao`, icon: "calendar", tone: "green", title: "Plano de manutenção", text: "Atividades por periodicidade", match: [s("7")] },
    manual.suppliers.length > 0 && { href: `${base}/fornecedores`, icon: "users", tone: "blue", title: "Fornecedores", text: "Projetistas e fornecedores com contato", match: [s("6")] },
    has("3") && { href: s("3"), icon: "building", tone: "blue", title: "Memorial descritivo", text: manual.kind === "proprietario" ? "Seu apartamento, ambientes e o empreendimento" : "Áreas comuns, pavimentos e plantas", match: [s("3")] },
    manual.legal_documents.length > 0
      ? { href: `${base}/documentos`, icon: "paper", tone: "gold", title: "Documentação legal", text: `${manual.legal_documents.length} documentos, responsáveis e renovação`, match: [s("8")] }
      : has("8") && { href: s("8"), icon: "paper", tone: "gold", title: "Documentação legal", text: "Documentos da unidade, guarda e renovação", match: [s("8")] },
    has("9.2") && { href: `${base}/emergencia`, icon: "alert", tone: "red", title: "Emergência", text: "Gás, água, energia, elevador e incêndio", match: [s("9.2"), s("9.3")] },
    has("4") && { href: s("4"), icon: "key", tone: "gold", title: "Recebimento e reformas", text: "Ligações de serviços e modificações", match: [s("4")] },
    has("9.1") && { href: s("9.1"), icon: "leaf", tone: "green", title: "Sustentabilidade", text: "Uso consciente de água, energia e resíduos", match: [s("9.1")] },
    has("10") && { href: s("10"), icon: "folder", tone: "gold", title: "Anexos técnicos", text: "Projetos, ART e modelos de registro", match: [s("10")] },
  ];
  return areas.filter((a): a is ManualArea => Boolean(a));
}

export { Icon, IconBadge, systemIcon, CHAPTER_ICONS } from "./icons";

/** Cor da área a que a seção pertence (a mesma do quadro na página inicial). */
export function sectionTone(num: string): Tone {
  if (num === "9.1" || num.startsWith("9.1.") || num === "7" || num.startsWith("7.")) return "green";
  if (num === "9.2" || num.startsWith("9.2.") || num === "9.3" || num.startsWith("9.3.")) return "red";
  if (num === "3" || num.startsWith("3.") || num === "6" || num.startsWith("6.")) return "blue";
  return "gold";
}

/**
 * Botão de voltar um nível (para a página-mãe; no primeiro nível, ao início do manual) + trilha da página.
 * O primeiro item é sempre o início do manual; o último, a página atual.
 */
export function Crumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  const up = items.length >= 2 ? items[items.length - 2] : undefined;
  return (
    <div className="flex flex-col gap-3 mb-6">
      {up?.href && (
        <Link href={up.href} className={buttonClass("secondary", "sm", "self-start gap-1.5 pl-3 max-w-full")}>
          <Icon name="chev" className="size-4 rotate-180" />
          <span className="truncate">{up === items[0] ? "Voltar ao início do manual" : `Voltar para ${up.label}`}</span>
        </Link>
      )}
      <nav aria-label="Você está em" className="text-sm text-ink-mute">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>›</span>}
              {c.href ? <Link href={c.href} className="hover:text-ink underline-offset-4 hover:underline">{c.label}</Link> : <span aria-current="page" className="text-ink">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

export function ManualTitle({ icon, tone, eyebrow, title, lead }: { icon: string; tone?: Tone; eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-4">
        <IconBadge name={icon} tone={tone} />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-2xl md:text-3xl leading-tight">{title}</h2>
        </div>
      </div>
      {lead && <p className="text-ink-soft mt-4 max-w-2xl">{lead}</p>}
    </header>
  );
}

/** HTML do manual oficial, importado e limpo na importação (scripts/lib/manual.mjs). Só a equipe importa. */
export function Prose({ html, className }: { html: string; className?: string }) {
  return <div className={cx("manual-prose", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Linhas de anexos (plantas, ART, projetos…). O arquivo é baixado, não aberto no app; sem arquivo, "Em breve". */
export function AttachmentRows({ items, className }: { items: ManualAttachment[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx("divide-y divide-line border border-line rounded-[var(--radius-md)] bg-surface max-w-3xl", className)} aria-label="Anexos">
      {items.map((a) => (
        <li key={a.id}>
          {a.file_path ? (
            <a href={`${a.file_path}?baixar=${encodeURIComponent(a.title)}`} download className="flex items-center gap-3 px-4 min-h-14 hover:bg-sand/60">
              <Icon name="paper" className="size-[18px] text-ink-mute" />
              <span className="flex-1 py-3">{a.title}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon name="download" className="size-4" />
                Baixar
              </span>
            </a>
          ) : (
            <div className="flex items-center gap-3 px-4 min-h-14 text-ink-mute">
              <Icon name="paper" className="size-[18px]" />
              <span className="flex-1 py-3">{a.title}</span>
              <span className="text-xs">Em breve</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
