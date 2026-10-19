// Importa um manual (supabase/manuais/*.json) para o banco. Substitui o conteúdo do mesmo manual
// (empreendimento + tipo) e mantém o que a equipe definiu no portal: publicado e PDF escolhido.
// `db` precisa ter query(sql, params) — pg.Client ou PGlite — e estar numa transação.

const FREQUENCIES = new Set(["diaria", "semanal", "quinzenal", "mensal", "bimestral", "trimestral", "semestral", "anual", "plurianual", "conforme"]);

/** Remove o que não é conteúdo de leitura: scripts, estilos, atributos de evento e links javascript:. */
export function cleanHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
}

/** Texto para a busca: sem marcação, sem imagens, sem acentos, minúsculo. Igual a `fold(plainText())` em src/lib/manual.ts. */
export function searchText(title, html) {
  const plain = String(html ?? "")
    .replace(/<figure[\s\S]*?<\/figure>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#\w]+;/g, " ");
  return `${title} ${plain}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function validateManual(m) {
  const errs = [];
  if (!/^[a-z0-9-]+$/.test(m.development_slug ?? "")) errs.push("development_slug inválido");
  if (!["proprietario", "condominio"].includes(m.kind)) errs.push("kind deve ser proprietario ou condominio");
  if (!m.title) errs.push("title obrigatório");
  if (m.unit_code !== undefined && !/^[\w-]{1,20}$/.test(m.unit_code)) errs.push("unit_code inválido");
  const nums = new Set();
  for (const s of m.sections ?? []) {
    if (!/^\d+(\.\d+)*$/.test(s.num)) errs.push(`seção com número inválido: ${s.num}`);
    if (nums.has(s.num)) errs.push(`seção repetida: ${s.num}`);
    nums.add(s.num);
  }
  for (const w of m.warranty_items ?? []) if (!(w.months > 0) || !w.system || !w.aspect) errs.push(`garantia inválida: ${JSON.stringify(w)}`);
  for (const t of m.maintenance ?? []) if (!FREQUENCIES.has(t.frequency)) errs.push(`periodicidade inválida: ${t.frequency}`);
  for (const a of m.attachments ?? []) if (!/^\d+(\.\d+)*$/.test(a.section ?? "") || !a.title) errs.push(`anexo inválido: ${JSON.stringify(a)}`);
  if (errs.length) throw new Error(errs.join("; "));
}

export async function importManual(db, m) {
  validateManual(m);
  const dev = (await db.query(`select id from public.developments where slug = $1`, [m.development_slug])).rows[0];
  if (!dev) throw new Error(`empreendimento não encontrado: ${m.development_slug}`);
  // Manual de uma unidade (ex.: proprietário do apto 201) ou do empreendimento todo.
  let unitId = null;
  if (m.unit_code) {
    const unit = (await db.query(`select id from public.units where development_id = $1 and code = $2`, [dev.id, m.unit_code])).rows[0];
    if (!unit) throw new Error(`unidade não encontrada: ${m.development_slug} ${m.unit_code}`);
    unitId = unit.id;
  }
  const existing = (
    await db.query(`select id from public.development_manuals where development_id = $1 and kind = $2 and unit_id is not distinct from $3`, [dev.id, m.kind, unitId])
  ).rows[0];
  const values = [m.title, JSON.stringify(m.suppliers ?? []), JSON.stringify(m.legal_documents ?? [])];
  const { id } = existing
    ? (await db.query(`update public.development_manuals set title = $2, suppliers = $3, legal_documents = $4 where id = $1 returning id`, [existing.id, ...values])).rows[0]
    : (
        await db.query(
          `insert into public.development_manuals (development_id, kind, unit_id, title, suppliers, legal_documents) values ($1, $2, $3, $4, $5, $6) returning id`,
          [dev.id, m.kind, unitId, ...values],
        )
      ).rows[0];
  await db.query(`delete from public.manual_sections where manual_id = $1`, [id]);
  await db.query(`delete from public.manual_warranty_items where manual_id = $1`, [id]);
  await db.query(`delete from public.manual_maintenance_tasks where manual_id = $1`, [id]);
  let i = 0;
  for (const s of m.sections ?? []) {
    await db.query(`insert into public.manual_sections (manual_id, num, title, level, html, search_text, sort_order) values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, s.num, s.title, s.level, cleanHtml(s.html), searchText(s.title, s.html), i++]);
  }
  i = 0;
  for (const w of m.warranty_items ?? []) {
    await db.query(`insert into public.manual_warranty_items (manual_id, row_number, system, aspect, months, sort_order) values ($1, $2, $3, $4, $5, $6)`,
      [id, w.row, w.system, w.aspect, w.months, i++]);
  }
  i = 0;
  for (const t of m.maintenance ?? []) {
    await db.query(`insert into public.manual_maintenance_tasks (manual_id, section_num, system, frequency, description, sort_order) values ($1, $2, $3, $4, $5, $6)`,
      [id, t.section ?? null, t.system, t.frequency, t.description, i++]);
  }
  // Anexos: só acrescenta as linhas novas; as existentes mantêm o arquivo que a equipe ligou.
  i = 0;
  for (const a of m.attachments ?? []) {
    await db.query(`insert into public.manual_attachments (manual_id, section_num, title, sort_order) values ($1, $2, $3, $4)
                    on conflict (manual_id, section_num, title) do update set sort_order = excluded.sort_order`, [id, a.section, a.title, i++]);
  }
  return { id, sections: m.sections?.length ?? 0, warranty: m.warranty_items?.length ?? 0, maintenance: m.maintenance?.length ?? 0, attachments: m.attachments?.length ?? 0 };
}
