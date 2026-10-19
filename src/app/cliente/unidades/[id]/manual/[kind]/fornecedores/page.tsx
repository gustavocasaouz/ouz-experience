import { fold } from "@/lib/manual";
import { Crumbs, Icon, ManualTitle, loadManual } from "../../ui";
import { ListFilter } from "../filter";

export default async function ManualSuppliers({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { manual, base } = await loadManual(params);
  return (
    <div>
      <Crumbs items={[{ href: base, label: "Início" }, { label: "Fornecedores" }]} />
      <ManualTitle
        tone="blue"
        icon="users"
        eyebrow="Capítulo 6"
        title="Projetistas e fornecedores"
        lead="Quem projetou, forneceu e instalou cada parte do empreendimento. Toque no telefone ou e-mail para entrar em contato."
      />
      <ListFilter
        target="suppliers"
        placeholder="Buscar por serviço, empresa ou cidade"
        noun={["contato", "contatos"]}
        chips={[{ value: "6.1", label: "Projetistas" }, { value: "6.2", label: "Fornecedores" }]}
      />
      <ul id="suppliers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {manual.suppliers.map((f, i) => (
          <li key={i} data-k={fold([f.category, f.name, f.address].join(" "))} data-f={f.group} className="p-5 bg-surface border border-line rounded-[var(--radius-md)] flex flex-col gap-1.5">
            <span className="eyebrow">{f.category || (f.group === "6.1" ? "Projetista" : "Fornecedor")}</span>
            {f.name && <span className="font-medium">{f.name}</span>}
            {f.address && <span className="text-sm text-ink-soft">{f.address}</span>}
            <div className="flex flex-col gap-1 mt-2">
              {f.phones.map((t) => (
                <a key={t} href={`tel:${t.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm min-h-9 underline-offset-4 hover:underline">
                  <Icon name="phone" className="size-4 text-ink-mute" />
                  {t}
                </a>
              ))}
              {f.emails.map((m) => (
                <a key={m} href={`mailto:${m}`} className="flex items-center gap-2 text-sm min-h-9 underline-offset-4 hover:underline break-all">
                  <Icon name="mail" className="size-4 text-ink-mute" />
                  {m}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
