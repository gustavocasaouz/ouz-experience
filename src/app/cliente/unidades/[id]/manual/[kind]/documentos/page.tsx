import { Table, Td } from "@/design-system";
import { manualSection } from "@/server/queries/manual";
import { fold } from "@/lib/manual";
import { Crumbs, ManualTitle, Prose, loadManual } from "../../ui";
import { ListFilter } from "../filter";

export default async function ManualLegalDocuments({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { manual, base } = await loadManual(params);
  const intro = await manualSection(manual.id, "8");
  // A tabela já aparece abaixo, com busca; do texto do capítulo fica só a explicação.
  const introHtml = intro?.html.replace(/<div class="tbl">[\s\S]*?<\/div>/g, "") ?? "";
  const who = (s: string) => (/construtora|incorporadora/i.test(s) ? "construtora" : /condom/i.test(s) ? "condominio" : "");
  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Documentação legal" }]} />
      <ManualTitle tone="gold" icon="paper" eyebrow="Capítulo 8" title="Documentação técnica e legal" />
      {introHtml.trim() && <Prose html={introHtml} className="max-w-3xl mb-8" />}
      <ListFilter
        target="legal-docs"
        placeholder="Buscar documento"
        noun={["documento", "documentos"]}
        chips={[
          { value: "construtora", label: "Fornecidos pela construtora" },
          { value: "condominio", label: "Providenciados pelo condomínio" },
        ]}
      />
      <div id="legal-docs">
        <Table head={["#", "Documento", "Fornecimento inicial", "Renovação", "Periodicidade"]} caption="Documentos técnicos e legais">
          {manual.legal_documents.map((d) => (
            <tr key={d.n} data-k={fold(d.doc)} data-f={who(d.initial)} className="border-t border-line align-top">
              <Td className="text-ink-mute tabular-nums">{d.n}</Td>
              <Td className="font-medium min-w-56">{d.doc}</Td>
              <Td className="min-w-40">{d.initial}</Td>
              <Td className="min-w-32">{d.renewal}</Td>
              <Td className="min-w-56 text-ink-soft">{d.frequency}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
