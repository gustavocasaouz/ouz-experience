import { Card, EmptyState, RestrictedState, SectionTitle, SelectField, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { createUnit, updateUnitStatus } from "@/server/actions/admin/developments";
import { UNIT_STATUS_LABELS } from "@/lib/labels";

const STATUS_OPTIONS = Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export default async function DevelopmentUnits({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas"], "/admin/empreendimentos");
  if (denied) return denied;
  const dev = await loadDevelopment((await params).id);
  if (!hasPermission(viewer, "comercial")) {
    return (
      <>
        <DevelopmentHeader dev={dev} tab="unidades" />
        <RestrictedState>Unidades exigem a permissão “Comercial”.</RestrictedState>
      </>
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: units } = await supabase
    .from("units")
    .select("id, code, tower, floor, typology, bedrooms, private_area_m2, status, is_demo, data_source")
    .eq("development_id", dev.id)
    .order("code");

  return (
    <>
      <DevelopmentHeader dev={dev} tab="unidades" />
      <Flash searchParams={searchParams} />
      <section className="mb-14">
        <SectionTitle title="Nova unidade" />
        <Card className="p-6">
          <form action={createUnit} className="grid gap-5 sm:grid-cols-3">
            <input type="hidden" name="id" value={dev.id} />
            <TextField label="Unidade" name="code" required />
            <TextField label="Torre" name="tower" />
            <TextField label="Andar" name="floor" type="number" />
            <TextField label="Tipologia" name="typology" />
            <TextField label="Dormitórios" name="bedrooms" type="number" min={0} />
            <TextField label="Área privativa (m²)" name="private_area_m2" inputMode="decimal" />
            <SelectField label="Situação" name="status" required defaultValue="indisponivel" options={STATUS_OPTIONS} />
            <SubmitButton className="self-end">Cadastrar</SubmitButton>
          </form>
        </Card>
      </section>
      <section>
        <SectionTitle title="Unidades" />
        <p className="text-sm text-ink-mute mb-4">
          Na Etapa 2, a situação “Reservada” passará a ser controlada pelo fluxo de reservas e fila, sem edição manual.
        </p>
        {!units?.length ? (
          <EmptyState title="Nenhuma unidade cadastrada" />
        ) : (
          <Table head={["Unidade", "Torre/Andar", "Tipologia", "Área", "Origem", "Situação"]} caption="Unidades">
            {units.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.code}{u.is_demo ? " · demo" : ""}</Td>
                <Td>{[u.tower, u.floor].filter((v) => v !== null && v !== "").join(" / ") || "—"}</Td>
                <Td>{u.typology ?? "—"}{u.bedrooms !== null ? ` · ${u.bedrooms} dorm.` : ""}</Td>
                <Td>{u.private_area_m2 ? `${Number(u.private_area_m2).toLocaleString("pt-BR")} m²` : "—"}</Td>
                <Td className="text-xs text-ink-mute">{u.data_source}</Td>
                <Td>
                  <form action={updateUnitStatus} className="flex gap-2 items-center">
                    <input type="hidden" name="development_id" value={dev.id} />
                    <input type="hidden" name="unit_id" value={u.id} />
                    <label className="sr-only" htmlFor={`st-${u.id}`}>Situação da unidade {u.code}</label>
                    <select id={`st-${u.id}`} name="status" defaultValue={u.status} className="border border-line bg-surface px-2 py-1 text-sm">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="text-xs underline underline-offset-4">Salvar</button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}
