-- OUZ Experience — manuais de uso, operação e manutenção por empreendimento (19/10/2026).
--
-- Cada empreendimento pode ter dois manuais: o do proprietário (unidades privativas) e o do
-- condomínio (áreas comuns). O conteúdo é estruturado para a leitura no portal: seções numeradas,
-- tabela de prazos de garantia (um item por sistema e aspecto coberto) e plano de manutenção.
-- Os prazos de garantia contam a partir do habite-se (developments.habite_se_date), como diz o manual.
-- O PDF completo é um documento comum (documents, categoria "manual") apontado pelo manual.

create type public.manual_kind as enum ('proprietario', 'condominio');
create type public.maintenance_frequency as enum
  ('diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'plurianual', 'conforme');

create table public.development_manuals (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  kind public.manual_kind not null,
  title text not null,
  is_published boolean not null default false,
  pdf_document_id uuid references public.documents(id) on delete set null,
  -- Listas de consulta, sem regra de negócio: [{group, category, name, address, phones[], emails[]}]
  suppliers jsonb not null default '[]'::jsonb,
  -- [{n, doc, initial, renewal, frequency}]
  legal_documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id, kind)
);
create trigger development_manuals_updated before update on public.development_manuals
  for each row execute function public.set_updated_at();
create trigger development_manuals_audit after insert or update or delete on public.development_manuals
  for each row execute function public.audit_row_change();

create table public.manual_sections (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.development_manuals(id) on delete cascade,
  num text not null check (num ~ '^\d+(\.\d+)*$'),
  title text not null,
  level smallint not null check (level between 1 and 6),
  html text not null default '',
  -- Título + texto sem marcação, sem acentos e em minúsculas (busca do portal). Gerado na importação.
  search_text text not null default '',
  sort_order int not null,
  unique (manual_id, num)
);
create index manual_sections_manual on public.manual_sections (manual_id, sort_order);

-- Um item por sistema × aspecto coberto (ex.: "Esquadrias de alumínio" · "Borrachas e escovas" · 24 meses).
-- É a lista que o chamado de assistência técnica vai oferecer enquanto o prazo estiver vigente.
create table public.manual_warranty_items (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.development_manuals(id) on delete cascade,
  row_number int not null,
  system text not null,
  aspect text not null,
  months int not null check (months > 0),
  sort_order int not null
);
create index manual_warranty_items_manual on public.manual_warranty_items (manual_id, sort_order);

create table public.manual_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.development_manuals(id) on delete cascade,
  section_num text,
  system text not null,
  frequency public.maintenance_frequency not null,
  description text not null,
  sort_order int not null
);
create index manual_maintenance_tasks_manual on public.manual_maintenance_tasks (manual_id, sort_order);

-- ---------------------------------------------------------------------------
-- Leitura: equipe com "conteudo" vê tudo; cliente vê os manuais publicados do seu empreendimento.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_manual(p_manual_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('conteudo') or exists (
    select 1 from public.development_manuals m
    where m.id = p_manual_id and m.is_published and public.is_client_of_development(m.development_id)
  )
$$;

alter table public.development_manuals enable row level security;
alter table public.manual_sections enable row level security;
alter table public.manual_warranty_items enable row level security;
alter table public.manual_maintenance_tasks enable row level security;

create policy manuals_read on public.development_manuals for select to authenticated using (public.can_read_manual(id));
create policy manuals_staff_update on public.development_manuals for update to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
create policy manual_sections_read on public.manual_sections for select to authenticated using (public.can_read_manual(manual_id));
create policy manual_warranty_items_read on public.manual_warranty_items for select to authenticated using (public.can_read_manual(manual_id));
create policy manual_maintenance_tasks_read on public.manual_maintenance_tasks for select to authenticated using (public.can_read_manual(manual_id));

-- O conteúdo entra pela importação (scripts/importar-manual.mjs). Pelo portal, a equipe só publica
-- e escolhe o PDF completo.
revoke all on public.development_manuals, public.manual_sections, public.manual_warranty_items, public.manual_maintenance_tasks from anon;
revoke insert, update, delete on public.development_manuals, public.manual_sections, public.manual_warranty_items, public.manual_maintenance_tasks from authenticated;
grant update (is_published, pdf_document_id) on public.development_manuals to authenticated;

-- O PDF escolhido precisa ser um documento do mesmo empreendimento.
create or replace function public.check_manual_pdf() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pdf_document_id is not null and not exists (
    select 1 from public.documents d where d.id = new.pdf_document_id and d.development_id = new.development_id
  ) then
    raise exception 'o PDF precisa ser um documento do próprio empreendimento' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger development_manuals_pdf before insert or update of pdf_document_id on public.development_manuals
  for each row execute function public.check_manual_pdf();
