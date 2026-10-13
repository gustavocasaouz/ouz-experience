-- OUZ Experience — Etapa 2: configurações comerciais, tabelas de preço e políticas de venda versionadas, checklist.

create type public.sales_mode as enum ('fechado', 'pre_lancamento', 'aberto');
create type public.version_status as enum ('rascunho', 'vigente', 'substituida');
create type public.person_type as enum ('pf', 'pj');

-- ---------------------------------------------------------------------------
-- Configuração comercial por empreendimento
-- ---------------------------------------------------------------------------
create table public.development_commercial_settings (
  development_id uuid primary key references public.developments (id) on delete cascade,
  sales_mode public.sales_mode not null default 'fechado',
  reservation_hours integer not null default 48 check (reservation_hours between 1 and 720),
  regularization_hours integer not null default 24 check (regularization_hours between 1 and 720),
  regularization_expires boolean not null default true,     -- se false, pendência não expira sozinha; OUZ decide
  show_queue_position boolean not null default false,
  keys_expected_date date,                                   -- previsão de entrega das chaves (informada pela OUZ)
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger dcs_updated_at before update on public.development_commercial_settings
  for each row execute function public.set_updated_at();
create trigger dcs_audit after insert or update on public.development_commercial_settings
  for each row execute function public.audit_row_change();
insert into public.development_commercial_settings (development_id) select id from public.developments on conflict do nothing;

create or replace function public.ensure_commercial_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.development_commercial_settings (development_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger developments_commercial_settings after insert on public.developments
  for each row execute function public.ensure_commercial_settings();

-- ---------------------------------------------------------------------------
-- Tabelas de preço (cada versão é imutável depois de publicada)
-- ---------------------------------------------------------------------------
create table public.price_tables (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  version_number integer not null,
  status public.version_status not null default 'rascunho',
  notes text,
  is_demo boolean not null default false,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  unique (development_id, version_number)
);
create unique index price_tables_one_current on public.price_tables (development_id) where status = 'vigente';

create table public.price_table_items (
  price_table_id uuid not null references public.price_tables (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  primary key (price_table_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- Políticas de venda versionadas.
-- rules = { "padrao": {...}, "por_tipologia": {"<tipologia>": {...}}, "por_unidade": {"<unit_id>": {...}} }
-- Chaves aceitas em cada bloco (todas opcionais; ausente = sem limite):
--   preco_minimo, desconto_maximo_percentual, entrada_minima_percentual, percentual_minimo_ate_chaves,
--   prazo_maximo_meses, parcelas_max_quantidade, reforcos_max_quantidade,
--   permuta_permitida (bool), permuta_max_percentual, exigir_analise_com_permuta (bool),
--   exigir_analise_pessoa_juridica (bool), sempre_exigir_analise (bool)
-- ---------------------------------------------------------------------------
create table public.sales_policies (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  version_number integer not null,
  status public.version_status not null default 'rascunho',
  rules jsonb not null default '{"padrao": {}, "por_tipologia": {}, "por_unidade": {}}'::jsonb,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  unique (development_id, version_number),
  check (jsonb_typeof(rules) = 'object')
);
create unique index sales_policies_one_current on public.sales_policies (development_id) where status = 'vigente';

-- Versões publicadas são imutáveis.
create or replace function public.protect_published_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then raise exception 'versão publicada não pode ser excluída'; end if;
    return old;
  end if;
  if old.status <> 'rascunho' then
    -- só a transição vigente → substituida é permitida
    if not (old.status = 'vigente' and new.status = 'substituida'
            and new.version_number = old.version_number and new.development_id = old.development_id) then
      raise exception 'versão publicada é imutável';
    end if;
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'versão publicada é imutável';
    end if;
  end if;
  return new;
end $$;
create trigger price_tables_protect before update or delete on public.price_tables
  for each row execute function public.protect_published_version();
create trigger sales_policies_protect before update or delete on public.sales_policies
  for each row execute function public.protect_published_version();

create or replace function public.protect_published_items() returns trigger
language plpgsql set search_path = '' as $$
declare v_status public.version_status;
begin
  select status into v_status from public.price_tables where id = coalesce(new.price_table_id, old.price_table_id);
  if v_status is distinct from 'rascunho' then raise exception 'itens de tabela publicada são imutáveis'; end if;
  return coalesce(new, old);
end $$;
create trigger price_table_items_protect before insert or update or delete on public.price_table_items
  for each row execute function public.protect_published_items();

create trigger price_tables_audit after insert or update or delete on public.price_tables
  for each row execute function public.audit_row_change();
create trigger sales_policies_audit after insert or update or delete on public.sales_policies
  for each row execute function public.audit_row_change();

-- Cria rascunho (opcionalmente copiando a versão vigente).
create or replace function public.admin_create_price_table_draft(p_development_id uuid, p_copy_current boolean default true)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_next int; v_current uuid;
begin
  if not public.has_staff_permission('politicas') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if exists (select 1 from public.price_tables where development_id = p_development_id and status = 'rascunho') then
    raise exception 'já existe um rascunho de tabela para este empreendimento' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_next from public.price_tables where development_id = p_development_id;
  insert into public.price_tables (development_id, version_number, created_by) values (p_development_id, v_next, auth.uid()) returning id into v_id;
  if p_copy_current then
    select id into v_current from public.price_tables where development_id = p_development_id and status = 'vigente';
    if v_current is not null then
      insert into public.price_table_items (price_table_id, unit_id, price)
      select v_id, unit_id, price from public.price_table_items where price_table_id = v_current;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.admin_publish_price_table(p_price_table_id uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_dev uuid; v_status public.version_status;
begin
  if not public.has_staff_permission('politicas') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select development_id, status into v_dev, v_status from public.price_tables where id = p_price_table_id for update;
  if v_status is distinct from 'rascunho' then raise exception 'somente rascunhos podem ser publicados' using errcode = '22023'; end if;
  if not exists (select 1 from public.price_table_items where price_table_id = p_price_table_id) then
    raise exception 'tabela sem preços' using errcode = '22023';
  end if;
  update public.price_tables set status = 'substituida' where development_id = v_dev and status = 'vigente';
  update public.price_tables set notes = coalesce(p_notes, notes) where id = p_price_table_id;
  update public.price_tables set status = 'vigente', published_at = now(), published_by = auth.uid() where id = p_price_table_id;
  perform public.write_audit('tabela_publicada', 'price_tables', p_price_table_id::text, '{}'::jsonb, p_notes, v_dev);
end $$;

create or replace function public.admin_create_sales_policy_draft(p_development_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_next int; v_rules jsonb;
begin
  if not public.has_staff_permission('politicas') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if exists (select 1 from public.sales_policies where development_id = p_development_id and status = 'rascunho') then
    raise exception 'já existe um rascunho de política para este empreendimento' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_next from public.sales_policies where development_id = p_development_id;
  select rules into v_rules from public.sales_policies where development_id = p_development_id and status = 'vigente';
  insert into public.sales_policies (development_id, version_number, rules, created_by)
  values (p_development_id, v_next, coalesce(v_rules, '{"padrao": {}, "por_tipologia": {}, "por_unidade": {}}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_publish_sales_policy(p_policy_id uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_dev uuid; v_status public.version_status;
begin
  if not public.has_staff_permission('politicas') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select development_id, status into v_dev, v_status from public.sales_policies where id = p_policy_id for update;
  if v_status is distinct from 'rascunho' then raise exception 'somente rascunhos podem ser publicados' using errcode = '22023'; end if;
  update public.sales_policies set status = 'substituida' where development_id = v_dev and status = 'vigente';
  update public.sales_policies set notes = coalesce(p_notes, notes) where id = p_policy_id;
  update public.sales_policies set status = 'vigente', published_at = now(), published_by = auth.uid() where id = p_policy_id;
  perform public.write_audit('politica_publicada', 'sales_policies', p_policy_id::text, '{}'::jsonb, p_notes, v_dev);
end $$;

-- ---------------------------------------------------------------------------
-- Checklist de documentos da reserva (PF / PJ), por empreendimento ou global (development_id nulo)
-- ---------------------------------------------------------------------------
create table public.document_checklist_items (
  id uuid primary key default gen_random_uuid(),
  development_id uuid references public.developments (id) on delete cascade,
  person_type public.person_type not null,
  label text not null check (length(label) between 2 and 200),
  description text,
  required boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create trigger checklist_audit after insert or update or delete on public.document_checklist_items
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.development_commercial_settings enable row level security;
alter table public.price_tables enable row level security;
alter table public.price_table_items enable row level security;
alter table public.sales_policies enable row level security;
alter table public.document_checklist_items enable row level security;

create policy dcs_select on public.development_commercial_settings for select to authenticated
  using (public.broker_can_see_development_card(development_id) or public.has_staff_permission('comercial') or public.has_staff_permission('politicas'));
create policy dcs_write on public.development_commercial_settings for update to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));

create policy price_tables_staff on public.price_tables for select to authenticated
  using (public.has_staff_permission('politicas') or public.has_staff_permission('comercial'));
create policy price_tables_staff_update on public.price_tables for update to authenticated
  using (public.has_staff_permission('politicas')) with check (public.has_staff_permission('politicas'));
create policy price_tables_staff_delete on public.price_tables for delete to authenticated
  using (public.has_staff_permission('politicas'));
revoke insert on public.price_tables from authenticated;  -- criação via função
revoke update on public.price_tables from authenticated;
grant update (notes) on public.price_tables to authenticated;

create policy price_items_staff on public.price_table_items for all to authenticated
  using (public.has_staff_permission('politicas') or public.has_staff_permission('comercial'))
  with check (public.has_staff_permission('politicas'));
-- Leitura de preços por corretores: policy definida na migração de propostas (depende do pré-lançamento).

create policy sales_policies_staff on public.sales_policies for select to authenticated
  using (public.has_staff_permission('politicas') or public.has_staff_permission('comercial'));
create policy sales_policies_staff_update on public.sales_policies for update to authenticated
  using (public.has_staff_permission('politicas') and status = 'rascunho') with check (public.has_staff_permission('politicas'));
create policy sales_policies_staff_delete on public.sales_policies for delete to authenticated
  using (public.has_staff_permission('politicas') and status = 'rascunho');
revoke insert on public.sales_policies from authenticated;
revoke update on public.sales_policies from authenticated;
grant update (rules, notes) on public.sales_policies to authenticated;

create policy checklist_select on public.document_checklist_items for select to authenticated
  using (public.is_approved_broker() or public.has_staff_permission('comercial') or public.has_staff_permission('documentos'));
create policy checklist_write on public.document_checklist_items for all to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));

revoke all on public.development_commercial_settings, public.price_tables, public.price_table_items,
  public.sales_policies, public.document_checklist_items from anon;
