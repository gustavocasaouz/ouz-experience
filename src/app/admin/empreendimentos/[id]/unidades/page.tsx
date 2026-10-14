import { Card, EmptyState, RestrictedState, SectionTitle, SelectField, Table, Td, TextField } from "@/design-system";
import { SubmitButton } from "@/design-system/submit-button";
import { Flash, type SP } from "@/components/admin/flash";
import { staffWith } from "@/components/admin/require-perm";
import { DevelopmentHeader, loadDevelopment } from "@/components/admin/development-header";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { hasPermission } from "@/server/auth/viewer";
import { createUnit, updateUnitStatus } from "@/server/actions/admin/developments";
import { RESERVATION_STATUS_LABELS, UNIT_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

const STATUS_OPTIONS = Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export default async function DevelopmentUnits({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { viewer, denied } = await staffWith(["conteudo", "comercial", "politicas", "documentos"], "/admin/empreendimentos");
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
  const { data: overview } = await supabase.rpc("admin_units_overview", { p_development_id: dev.id });
  type Ov = { unit_id: string; queue_count: number; reservation_id: string | null; reservation_status: string | null; reservation_deadline: string | null };
  const ov = new Map(((overview ?? []) as Ov[]).map((o) => [o.unit_id, o]));
  const { data: units } = await supabase
    .from("units")
    .select("id, code, tower, floor, typology, bedrooms, private_area_m2, parking, status, is_demo, data_source")
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
            <TextField label="Vagas" name="parking" placeholder="ex.: 7/7A no subsolo" />
            <SelectField label="Situação" name="status" required defaultValue="indisponivel" options={STATUS_OPTIONS} />
            <SubmitButton className="self-end">Cadastrar</SubmitButton>
          </form>
        </Card>
      </section>
      <section>
        <SectionTitle title="Unidades" />
        <p className="text-sm text-ink-mute mb-4">
          “Reservada” é exibida aos corretores somente depois que o corretor da reserva envia a documentação completa; até lá a unidade aparece como disponível, mas a reserva e a fila já valem. Não altere manualmente para “Reservada”: o fluxo de reservas controla essa situação.
        </p>
        {!units?.length ? (
          <EmptyState title="Nenhuma unidade cadastrada" />
        ) : (
          <Table head={["Unidade", "Torre/Andar", "Tipologia", "Área", "Reserva (visão OUZ)", "Fila", "Situação para corretores"]} caption="Unidades">
            {units.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium"><Link className="hover:underline underline-offset-4" href={`/admin/unidades/${u.id}`}>{u.code}</Link>{u.is_demo ? " · demo" : ""}</Td>
                <Td>{[u.tower, u.floor].filter((v) => v !== null && v !== "").join(" / ") || "—"}</Td>
                <Td>{u.typology ?? "—"}{u.bedrooms !== null ? ` · ${u.bedrooms} dorm.` : ""}</Td>
                <Td>{u.private_area_m2 ? `${Number(u.private_area_m2).toLocaleString("pt-BR")} m²` : "—"}{u.parking && <span className="block text-xs text-ink-mute">{u.parking}</span>}</Td>
                <Td className="text-sm">
                  {ov.get(u.id)?.reservation_id ? (
                    <Link className="underline underline-offset-4" href={`/admin/reservas/${ov.get(u.id)!.reservation_id}`}>
                      {RESERVATION_STATUS_LABELS[ov.get(u.id)!.reservation_status!]}
                    </Link>
                  ) : "—"}
                  {ov.get(u.id)?.reservation_deadline && <span className="block text-xs text-ink-mute">até {formatDateTime(ov.get(u.id)!.reservation_deadline)}</span>}
                </Td>
                <Td className="text-sm">{ov.get(u.id)?.queue_count ?? 0}</Td>
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
