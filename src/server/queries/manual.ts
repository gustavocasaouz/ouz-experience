import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { fold, type ManualKind, type SectionRef } from "@/lib/manual";

export type Manual = {
  id: string;
  kind: ManualKind;
  title: string;
  pdf_path: string | null;
  suppliers: Array<{ group: string; category: string; name: string; address: string; phones: string[]; emails: string[] }>;
  legal_documents: Array<{ n: number; doc: string; initial: string; renewal: string; frequency: string }>;
};

/**
 * Manuais publicados que valem para a unidade: os do empreendimento (unit_id nulo) e os da própria unidade.
 * Para o mesmo tipo, o da unidade prevalece. Proprietário primeiro. O RLS confere o acesso.
 */
export const listManuals = cache(async (developmentId: string, unitId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("development_manuals")
    .select("id, kind, title, unit_id")
    .eq("development_id", developmentId)
    .eq("is_published", true)
    .or(`unit_id.is.null,unit_id.eq.${unitId}`);
  const rows = (data ?? []) as Array<{ id: string; kind: ManualKind; title: string; unit_id: string | null }>;
  return (["proprietario", "condominio"] as const)
    .map((k) => rows.find((r) => r.kind === k && r.unit_id) ?? rows.find((r) => r.kind === k && !r.unit_id))
    .filter((r): r is (typeof rows)[number] => Boolean(r));
});

export const getManual = cache(async (developmentId: string, unitId: string, kind: ManualKind): Promise<Manual | null> => {
  const chosen = (await listManuals(developmentId, unitId)).find((m) => m.kind === kind);
  if (!chosen) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("development_manuals")
    .select("id, kind, title, suppliers, legal_documents, pdf:documents(versions:document_versions(storage_path, version_number))")
    .eq("id", chosen.id)
    .maybeSingle();
  if (!data) return null;
  const versions = ((data.pdf as unknown as { versions: Array<{ storage_path: string; version_number: number }> } | null)?.versions ?? [])
    .sort((a, b) => b.version_number - a.version_number);
  return {
    id: data.id,
    kind: data.kind as ManualKind,
    title: data.title,
    pdf_path: versions[0] ? `/arquivos/client-documents/${versions[0].storage_path}` : null,
    suppliers: data.suppliers as Manual["suppliers"],
    legal_documents: data.legal_documents as Manual["legal_documents"],
  };
});

/** Índice (sem o texto). */
export const manualIndex = cache(async (manualId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("manual_sections").select("num, title, level").eq("manual_id", manualId).order("sort_order");
  return (data ?? []) as SectionRef[];
});

/** Texto de uma seção e das subseções dela. */
export async function manualSectionsUnder(manualId: string, num: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("manual_sections")
    .select("num, title, level, html")
    .eq("manual_id", manualId)
    .or(`num.eq.${num},num.like.${num}.%`)
    .order("sort_order");
  return (data ?? []) as Array<SectionRef & { html: string }>;
}

export async function searchManual(manualId: string, term: string) {
  const q = fold(term).replace(/[%_\\]/g, "").trim();
  if (q.length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("manual_sections")
    .select("num, title, level, html")
    .eq("manual_id", manualId)
    .ilike("search_text", `%${q}%`)
    .neq("num", "0")
    .order("sort_order")
    .limit(40);
  return (data ?? []) as Array<SectionRef & { html: string }>;
}

export async function manualWarranty(manualId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("manual_warranty_items")
    .select("id, row_number, system, aspect, months")
    .eq("manual_id", manualId)
    .order("sort_order");
  return (data ?? []) as Array<{ id: string; row_number: number; system: string; aspect: string; months: number }>;
}

export async function manualMaintenance(manualId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("manual_maintenance_tasks")
    .select("id, section_num, system, frequency, description")
    .eq("manual_id", manualId)
    .order("sort_order");
  return (data ?? []) as Array<{ id: string; section_num: string | null; system: string; frequency: string; description: string }>;
}

/** Só a seção pedida (sem as subseções). */
export async function manualSection(manualId: string, num: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("manual_sections").select("num, title, level, html").eq("manual_id", manualId).eq("num", num).maybeSingle();
  return data as (SectionRef & { html: string }) | null;
}

export type ManualAttachment = { id: string; section_num: string; title: string; file_path: string | null };

/** Anexos da seção e das subseções. Sem arquivo (ou com documento oculto ao cliente): `file_path` nulo. */
export async function manualAttachments(manualId: string, num: string): Promise<ManualAttachment[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("manual_attachments")
    .select("id, section_num, title, document:documents(versions:document_versions(storage_path, version_number))")
    .eq("manual_id", manualId)
    .or(`section_num.eq.${num},section_num.like.${num}.%`)
    .order("sort_order");
  type Row = { id: string; section_num: string; title: string; document: { versions: Array<{ storage_path: string; version_number: number }> } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const latest = (r.document?.versions ?? []).sort((a, b) => b.version_number - a.version_number)[0];
    return { id: r.id, section_num: r.section_num, title: r.title, file_path: latest ? `/arquivos/client-documents/${latest.storage_path}` : null };
  });
}
