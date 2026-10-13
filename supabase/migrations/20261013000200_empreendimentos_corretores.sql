-- OUZ Experience — Etapa 1: empreendimentos, conteúdo público/teaser/restrito, corretores e autorizações

create type public.development_stage as enum ('pre_lancamento', 'lancamento', 'em_obra', 'em_entrega', 'entregue');
create type public.broker_access_mode as enum ('aberto', 'restrito', 'teaser', 'oculto');
create type public.broker_status as enum ('pendente', 'ajustes_solicitados', 'aprovado', 'recusado', 'suspenso', 'revogado');
create type public.unit_status as enum ('disponivel', 'reservada', 'vendida', 'bloqueada', 'indisponivel');
create type public.broker_material_kind as enum ('apresentacao', 'planta', 'material_comercial', 'tabela', 'comunicado', 'outro');

-- ---------------------------------------------------------------------------
-- Empreendimentos (linha mínima; detalhes em tabelas separadas por nível de acesso)
-- ---------------------------------------------------------------------------
create table public.developments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (length(name) between 1 and 120),
  city text not null default 'Florianópolis',
  stage public.development_stage not null,
  is_published boolean not null default false,       -- aparece na área pública
  broker_access_mode public.broker_access_mode not null default 'oculto',
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger developments_updated_at before update on public.developments
  for each row execute function public.set_updated_at();
create trigger developments_audit after insert or update or delete on public.developments
  for each row execute function public.audit_row_change();

-- Conteúdo PÚBLICO
create table public.development_public_content (
  development_id uuid primary key references public.developments (id) on delete cascade,
  headline text,
  summary text,
  body text,
  neighborhood text,
  highlights jsonb not null default '[]'::jsonb,     -- ["Diferencial 1", ...]
  cover_image_path text,                             -- bucket public-media
  gallery jsonb not null default '[]'::jsonb,        -- [{path, alt}]
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger development_public_content_updated_at before update on public.development_public_content
  for each row execute function public.set_updated_at();
create trigger development_public_content_audit after insert or update or delete on public.development_public_content
  for each row execute function public.audit_row_change();

-- TEASER (conteúdo separado e inofensivo: nada de preço, planta ou arquivo restrito)
create table public.development_teasers (
  development_id uuid primary key references public.developments (id) on delete cascade,
  title text not null default 'Em breve',
  message text,
  image_path text,                                   -- bucket public-media
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger development_teasers_updated_at before update on public.development_teasers
  for each row execute function public.set_updated_at();
create trigger development_teasers_audit after insert or update or delete on public.development_teasers
  for each row execute function public.audit_row_change();

-- Conteúdo RESTRITO para corretores autorizados
create table public.development_broker_content (
  development_id uuid primary key references public.developments (id) on delete cascade,
  presentation text,
  highlights jsonb not null default '[]'::jsonb,
  payment_conditions text,
  early_information text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger development_broker_content_updated_at before update on public.development_broker_content
  for each row execute function public.set_updated_at();
create trigger development_broker_content_audit after insert or update or delete on public.development_broker_content
  for each row execute function public.audit_row_change();

create table public.broker_materials (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  kind public.broker_material_kind not null,
  title text not null,
  storage_path text not null,                        -- bucket broker-content, prefixo {development_id}/
  is_published boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path like development_id::text || '/%')
);
create trigger broker_materials_updated_at before update on public.broker_materials
  for each row execute function public.set_updated_at();
create trigger broker_materials_audit after insert or update or delete on public.broker_materials
  for each row execute function public.audit_row_change();

-- Unidades (RESTRITO). Preço NÃO fica aqui: virá de price_table_items (Etapa 2).
create table public.units (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  code text not null,
  tower text,
  floor integer,
  typology text,
  bedrooms smallint,
  private_area_m2 numeric(8,2),
  status public.unit_status not null default 'indisponivel',
  is_demo boolean not null default false,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id, code)
);
create index units_development_idx on public.units (development_id);
create trigger units_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger units_audit after insert or update or delete on public.units
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Corretores
-- ---------------------------------------------------------------------------
create table public.broker_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null check (length(full_name) between 3 and 200),
  cpf text not null check (cpf ~ '^\d{11}$'),                     -- normalizado; validado no servidor (DV)
  cpf_hash text not null,                                         -- HMAC(pepper) calculado no servidor
  creci_number text not null check (creci_number ~ '^[0-9]{1,8}(-?[A-Za-z])?$'),
  creci_uf char(2) not null check (creci_uf ~ '^[A-Z]{2}$'),
  email text not null,
  phone text not null check (length(phone) between 8 and 30),
  city text not null,
  region text not null,                                           -- estado ou região
  country text not null default 'Brasil',
  address jsonb,                                                  -- opcional
  agency_name text,
  agency_cnpj text check (agency_cnpj is null or agency_cnpj ~ '^[0-9A-Z]{12}\d{2}$'),
  terms_version text not null,
  privacy_version text not null,
  terms_accepted_at timestamptz not null,
  status public.broker_status not null default 'pendente',
  status_reason text,
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index broker_profiles_cpf_hash_uniq on public.broker_profiles (cpf_hash);
create unique index broker_profiles_creci_uniq on public.broker_profiles (creci_uf, upper(creci_number));
create trigger broker_profiles_updated_at before update on public.broker_profiles
  for each row execute function public.set_updated_at();

-- Impede que o corretor altere o próprio status ou campos de análise.
create or replace function public.broker_profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Funções security definer (dono do banco) e service role passam; usuários comuns não.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pendente';
    new.status_reason := null;
    new.status_changed_by := null;
    new.status_changed_at := now();
  else
    if old.status not in ('pendente', 'ajustes_solicitados') then
      raise exception 'cadastro não pode ser editado neste status' using errcode = '42501';
    end if;
    new.status := old.status;
    new.status_reason := old.status_reason;
    new.status_changed_by := old.status_changed_by;
    new.status_changed_at := old.status_changed_at;
    new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger broker_profiles_guard before insert or update on public.broker_profiles
  for each row execute function public.broker_profiles_guard();

create table public.broker_status_history (
  id bigint generated always as identity primary key,
  broker_user_id uuid not null references public.broker_profiles (user_id) on delete cascade,
  from_status public.broker_status,
  to_status public.broker_status not null,
  reason text,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index broker_status_history_idx on public.broker_status_history (broker_user_id, changed_at desc);

create table public.broker_documents (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid not null references public.broker_profiles (user_id) on delete cascade,
  label text not null,
  storage_path text not null,                         -- bucket broker-documents, prefixo {user_id}/
  mime_type text,
  size_bytes integer,
  uploaded_at timestamptz not null default now(),
  check (storage_path like broker_user_id::text || '/%')
);

create table public.broker_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create trigger broker_groups_audit after insert or update or delete on public.broker_groups
  for each row execute function public.audit_row_change();

create table public.broker_group_members (
  group_id uuid not null references public.broker_groups (id) on delete cascade,
  broker_user_id uuid not null references public.broker_profiles (user_id) on delete cascade,
  added_by uuid references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (group_id, broker_user_id)
);
create trigger broker_group_members_audit after insert or delete on public.broker_group_members
  for each row execute function public.audit_row_change();

create table public.development_broker_grants (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  broker_user_id uuid references public.broker_profiles (user_id) on delete cascade,
  group_id uuid references public.broker_groups (id) on delete cascade,
  reason text,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoke_reason text,
  check (num_nonnulls(broker_user_id, group_id) = 1)
);
create unique index development_broker_grants_broker_active
  on public.development_broker_grants (development_id, broker_user_id) where revoked_at is null and broker_user_id is not null;
create unique index development_broker_grants_group_active
  on public.development_broker_grants (development_id, group_id) where revoked_at is null and group_id is not null;

-- ---------------------------------------------------------------------------
-- Funções de autorização de corretor
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_broker() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.broker_profiles b where b.user_id = auth.uid() and b.status = 'aprovado')
$$;

-- Conteúdo COMPLETO do empreendimento.
create or replace function public.broker_can_access_development(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_approved_broker() and exists (
    select 1 from public.developments d
    where d.id = p_development_id
      and (
        d.broker_access_mode = 'aberto'
        or (d.broker_access_mode = 'restrito' and exists (
          select 1 from public.development_broker_grants g
          where g.development_id = d.id and g.revoked_at is null
            and (
              g.broker_user_id = auth.uid()
              or g.group_id in (select m.group_id from public.broker_group_members m where m.broker_user_id = auth.uid())
            )
        ))
      )
  )
$$;

-- Corretor aprovado pode ver o cartão do empreendimento (completo ou teaser)?
create or replace function public.broker_can_see_development_card(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_approved_broker() and exists (
    select 1 from public.developments d where d.id = p_development_id and d.broker_access_mode <> 'oculto'
  )
$$;

-- ---------------------------------------------------------------------------
-- Operações administrativas de corretores (com histórico e auditoria)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_broker_status(
  p_broker_user_id uuid, p_status public.broker_status, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_from public.broker_status;
begin
  if not public.has_staff_permission('corretores') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_status = 'pendente' then
    raise exception 'status inválido para ação administrativa' using errcode = '22023';
  end if;
  if p_status <> 'aprovado' and coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'motivo obrigatório' using errcode = '22023';
  end if;

  select status into v_from from public.broker_profiles where user_id = p_broker_user_id for update;
  if v_from is null then raise exception 'corretor não encontrado' using errcode = '22023'; end if;

  if not (
    (v_from = 'pendente' and p_status in ('aprovado', 'recusado', 'ajustes_solicitados'))
    or (v_from = 'ajustes_solicitados' and p_status in ('recusado'))
    or (v_from = 'aprovado' and p_status in ('suspenso', 'revogado'))
    or (v_from = 'suspenso' and p_status in ('aprovado', 'revogado'))
  ) then
    raise exception 'transição % → % não permitida', v_from, p_status using errcode = '22023';
  end if;

  update public.broker_profiles
     set status = p_status, status_reason = p_reason, status_changed_at = now(), status_changed_by = auth.uid()
   where user_id = p_broker_user_id;

  insert into public.broker_status_history (broker_user_id, from_status, to_status, reason, changed_by)
  values (p_broker_user_id, v_from, p_status, p_reason, auth.uid());

  perform public.write_audit('corretor_status', 'broker_profiles', p_broker_user_id::text,
    jsonb_build_object('de', v_from, 'para', p_status), p_reason);

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_broker_user_id, 'corretor_status',
          case p_status
            when 'aprovado' then 'Cadastro aprovado'
            when 'recusado' then 'Cadastro não aprovado'
            when 'ajustes_solicitados' then 'Ajustes solicitados no cadastro'
            when 'suspenso' then 'Acesso suspenso'
            when 'revogado' then 'Acesso revogado'
          end,
          case when p_status = 'aprovado' then null else p_reason end,
          '/corretor',
          'corretor_status:' || p_broker_user_id || ':' || (select count(*) from public.broker_status_history h where h.broker_user_id = p_broker_user_id))
  on conflict (dedupe_key) do nothing;

  insert into public.notification_outbox (dedupe_key, channel, template, recipient_user_id, payload)
  values ('email:corretor_status:' || p_broker_user_id || ':' || (select count(*) from public.broker_status_history h where h.broker_user_id = p_broker_user_id),
          'email', 'corretor_status', p_broker_user_id, jsonb_build_object('status', p_status))
  on conflict (dedupe_key) do nothing;
end $$;

-- Corretor reenvia o cadastro após ajustes.
create or replace function public.broker_resubmit() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.broker_profiles
     set status = 'pendente', status_reason = null, status_changed_at = now(), status_changed_by = auth.uid()
   where user_id = auth.uid() and status = 'ajustes_solicitados';
  if not found then raise exception 'nada a reenviar' using errcode = '22023'; end if;
  insert into public.broker_status_history (broker_user_id, from_status, to_status, changed_by)
  values (auth.uid(), 'ajustes_solicitados', 'pendente', auth.uid());
end $$;

create or replace function public.admin_set_development_access_mode(
  p_development_id uuid, p_mode public.broker_access_mode, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.developments set broker_access_mode = p_mode where id = p_development_id;
  if not found then raise exception 'empreendimento não encontrado' using errcode = '22023'; end if;
  perform public.write_audit('empreendimento_modo_acesso', 'developments', p_development_id::text,
    jsonb_build_object('modo', p_mode), p_reason, p_development_id);
end $$;

create or replace function public.admin_grant_development_access(
  p_development_id uuid, p_broker_user_id uuid, p_group_id uuid, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_staff_permission('comercial') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  insert into public.development_broker_grants (development_id, broker_user_id, group_id, reason, granted_by)
  values (p_development_id, p_broker_user_id, p_group_id, p_reason, auth.uid())
  returning id into v_id;
  perform public.write_audit('acesso_empreendimento_concedido', 'development_broker_grants', v_id::text,
    jsonb_build_object('broker_user_id', p_broker_user_id, 'group_id', p_group_id), p_reason, p_development_id);
  return v_id;
exception when unique_violation then
  raise exception 'autorização já existe' using errcode = '23505';
end $$;

create or replace function public.admin_revoke_development_access(p_grant_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_dev uuid;
begin
  if not public.has_staff_permission('comercial') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'motivo obrigatório' using errcode = '22023';
  end if;
  update public.development_broker_grants
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where id = p_grant_id and revoked_at is null
  returning development_id into v_dev;
  if v_dev is null then raise exception 'autorização não encontrada' using errcode = '22023'; end if;
  perform public.write_audit('acesso_empreendimento_revogado', 'development_broker_grants', p_grant_id::text,
    '{}'::jsonb, p_reason, v_dev);
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.developments enable row level security;
alter table public.development_public_content enable row level security;
alter table public.development_teasers enable row level security;
alter table public.development_broker_content enable row level security;
alter table public.broker_materials enable row level security;
alter table public.units enable row level security;
alter table public.broker_profiles enable row level security;
alter table public.broker_status_history enable row level security;
alter table public.broker_documents enable row level security;
alter table public.broker_groups enable row level security;
alter table public.broker_group_members enable row level security;
alter table public.development_broker_grants enable row level security;

-- developments: linha mínima. Clientes vinculados são tratados na migração de clientes.
create policy developments_select_public on public.developments for select to anon, authenticated
  using (is_published);
create policy developments_select_broker on public.developments for select to authenticated
  using (public.broker_can_see_development_card(id));
create policy developments_select_staff on public.developments for select to authenticated
  using (public.has_staff_permission('conteudo') or public.has_staff_permission('comercial') or public.has_staff_permission('clientes'));
create policy developments_write_staff on public.developments for insert to authenticated
  with check (public.has_staff_permission('conteudo'));
create policy developments_update_staff on public.developments for update to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
-- broker_access_mode só muda pela função admin_set_development_access_mode (perm comercial).
revoke update on public.developments from authenticated;
grant update (slug, name, city, stage, is_published, sort_order) on public.developments to authenticated;

create policy dpc_select on public.development_public_content for select to anon, authenticated
  using (exists (select 1 from public.developments d where d.id = development_id and d.is_published)
         or public.has_staff_permission('conteudo'));
create policy dpc_write on public.development_public_content for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy teaser_select on public.development_teasers for select to authenticated
  using (public.broker_can_see_development_card(development_id) or public.has_staff_permission('conteudo'));
create policy teaser_write on public.development_teasers for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy dbc_select on public.development_broker_content for select to authenticated
  using (public.broker_can_access_development(development_id)
         or public.has_staff_permission('conteudo') or public.has_staff_permission('comercial'));
create policy dbc_write on public.development_broker_content for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy materials_select on public.broker_materials for select to authenticated
  using ((is_published and public.broker_can_access_development(development_id))
         or public.has_staff_permission('conteudo') or public.has_staff_permission('comercial'));
create policy materials_write on public.broker_materials for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy units_select_broker on public.units for select to authenticated
  using (public.broker_can_access_development(development_id));
create policy units_select_staff on public.units for select to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('clientes'));
create policy units_write on public.units for all to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));

create policy broker_profiles_select on public.broker_profiles for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission('corretores'));
create policy broker_profiles_insert_self on public.broker_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy broker_profiles_update_self on public.broker_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy broker_history_select on public.broker_status_history for select to authenticated
  using (broker_user_id = auth.uid() or public.has_staff_permission('corretores'));

create policy broker_documents_select on public.broker_documents for select to authenticated
  using (broker_user_id = auth.uid() or public.has_staff_permission('corretores'));
create policy broker_documents_insert on public.broker_documents for insert to authenticated
  with check (broker_user_id = auth.uid() and exists (
    select 1 from public.broker_profiles b where b.user_id = auth.uid() and b.status in ('pendente', 'ajustes_solicitados')));
create policy broker_documents_delete on public.broker_documents for delete to authenticated
  using (broker_user_id = auth.uid() and exists (
    select 1 from public.broker_profiles b where b.user_id = auth.uid() and b.status in ('pendente', 'ajustes_solicitados')));

create policy broker_groups_staff on public.broker_groups for all to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('corretores'))
  with check (public.has_staff_permission('comercial'));
create policy broker_group_members_staff on public.broker_group_members for all to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('corretores'))
  with check (public.has_staff_permission('comercial'));
-- Corretor não lista grupos nem membros (evita revelar outros corretores).

create policy grants_select_staff on public.development_broker_grants for select to authenticated
  using (public.has_staff_permission('comercial'));
-- Escrita somente via admin_grant/admin_revoke.

revoke insert, update, delete on public.development_broker_grants, public.broker_status_history from authenticated;
revoke all on public.units, public.development_broker_content, public.broker_materials, public.development_teasers,
  public.broker_profiles, public.broker_documents, public.broker_groups, public.broker_group_members,
  public.development_broker_grants, public.broker_status_history from anon;
