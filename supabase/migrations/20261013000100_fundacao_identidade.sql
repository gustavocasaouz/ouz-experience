-- OUZ Experience — Etapa 1: identidade, staff, auditoria e utilitários
-- Todos os horários em UTC (timestamptz). Exibição em America/Sao_Paulo na aplicação.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('operador', 'administrador');

create type public.staff_permission as enum (
  'atendimento',   -- chamados e contato com clientes (sem financeiro/documentos pessoais)
  'clientes',      -- cadastro de clientes e vínculo com unidades
  'corretores',    -- análise e gestão de corretores
  'comercial',     -- unidades, propostas, reservas, filas, acesso por empreendimento
  'politicas',     -- tabelas de preço e políticas de venda
  'documentos',    -- documentos privados de clientes e reservas
  'financeiro',    -- informações financeiras de clientes
  'conteudo',      -- área pública, conteúdo de empreendimentos e atualizações
  'eventos',
  'concierge',
  'notificacoes',
  'auditoria',
  'administracao'  -- convites de staff e permissões
);

create type public.data_source as enum ('experience', 'importacao', 'ouz_gestao', 'granatum', 'trimble', 'google_drive');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.hash_token(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

-- Mascara CPF (11 dígitos) ou CNPJ (14 dígitos) para exibição/auditoria.
create or replace function public.mask_document(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) = 11 then
      '***.' || substr(regexp_replace(p, '\D', '', 'g'), 4, 3) || '.' || substr(regexp_replace(p, '\D', '', 'g'), 7, 3) || '-**'
    when length(regexp_replace(p, '\D', '', 'g')) = 14 then
      '**.' || substr(regexp_replace(p, '\D', '', 'g'), 3, 3) || '.' || substr(regexp_replace(p, '\D', '', 'g'), 6, 3) || '/****-**'
    else '***'
  end
$$;

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users). Nunca concedem papel.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 200),
  email text not null,
  phone text check (phone is null or length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Mantém o e-mail do perfil sincronizado com o e-mail verificado do Auth.
create or replace function public.handle_auth_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Staff (operadores e administradores). Sem INSERT para usuários comuns.
-- ---------------------------------------------------------------------------
create table public.staff_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  active boolean not null default true,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_members_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();

create table public.staff_permissions (
  user_id uuid not null references public.staff_members (user_id) on delete cascade,
  permission public.staff_permission not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  role public.staff_role not null,
  permissions public.staff_permission[] not null default '{}',
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Funções de autorização (usadas nas policies e nas server actions)
-- ---------------------------------------------------------------------------
create or replace function public.current_aal() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

-- Staff ativo E autenticado com MFA (aal2).
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_aal() = 'aal2' and exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.active
  )
$$;

create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_aal() = 'aal2' and exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.active and s.role = 'administrador'
  )
$$;

create or replace function public.has_staff_permission(p public.staff_permission) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_aal() = 'aal2' and exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.active
      and (
        s.role = 'administrador'
        or exists (select 1 from public.staff_permissions sp where sp.user_id = s.user_id and sp.permission = p)
      )
  )
$$;

-- Staff ativo sem exigir aal2: usado apenas para a UI decidir mandar o usuário ao desafio MFA.
create or replace function public.staff_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'is_staff', true,
      'role', s.role,
      'mfa_ok', public.current_aal() = 'aal2',
      'permissions', case when s.role = 'administrador'
        then to_jsonb(enum_range(null::public.staff_permission))
        else coalesce((select jsonb_agg(sp.permission) from public.staff_permissions sp where sp.user_id = s.user_id), '[]'::jsonb)
      end
    )
    from public.staff_members s where s.user_id = auth.uid() and s.active
  ), jsonb_build_object('is_staff', false))
$$;

-- ---------------------------------------------------------------------------
-- Auditoria (somente inserção; ninguém altera ou apaga)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  development_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb   -- nunca CPF completo, documentos ou tokens
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);

create or replace function public.prevent_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log é somente inserção';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.prevent_audit_mutation();

create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_metadata jsonb default '{}'::jsonb, p_reason text default null, p_development_id uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata, reason, development_id)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_reason, p_development_id)
$$;
revoke execute on function public.write_audit(text, text, text, jsonb, text, uuid) from public, anon, authenticated;

-- Trigger genérico: registra quais colunas mudaram, sem copiar valores.
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[];
  v_id text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_changed is null then return new; end if;
  end if;
  v_id := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'development_id', to_jsonb(coalesce(new, old)) ->> 'user_id');
  perform public.write_audit(
    lower(tg_op), tg_table_name, v_id,
    case when v_changed is null then '{}'::jsonb else jsonb_build_object('changed', v_changed) end
  );
  return coalesce(new, old);
end $$;

create trigger staff_members_audit after insert or update or delete on public.staff_members
  for each row execute function public.audit_row_change();
create trigger staff_permissions_audit after insert or delete on public.staff_permissions
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Rate limit (chamado pelo servidor com service role)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Convites de staff
-- ---------------------------------------------------------------------------
create or replace function public.create_staff_invitation(
  p_email text, p_role public.staff_role, p_permissions public.staff_permission[]
) returns text   -- token em claro, devolvido uma única vez para compor o link do e-mail
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if not public.has_staff_permission('administracao') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_role = 'administrador' and not public.is_staff_admin() then
    raise exception 'somente administradores convidam administradores' using errcode = '42501';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;

  update public.staff_invitations set revoked_at = now()
  where email = lower(p_email) and accepted_at is null and revoked_at is null;

  insert into public.staff_invitations (email, role, permissions, token_hash, expires_at, created_by)
  values (lower(p_email), p_role, coalesce(p_permissions, '{}'), public.hash_token(v_token), now() + interval '72 hours', auth.uid())
  returning id into v_id;

  perform public.write_audit('convite_staff_criado', 'staff_invitations', v_id::text,
    jsonb_build_object('role', p_role, 'permissions', p_permissions));
  return v_token;
end $$;

create or replace function public.accept_staff_invitation(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.staff_invitations;
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  if v_user.email_confirmed_at is null then raise exception 'e-mail não verificado' using errcode = '42501'; end if;

  select * into v_inv from public.staff_invitations
  where token_hash = public.hash_token(p_token) for update;

  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'convite inválido ou expirado' using errcode = '22023';
  end if;
  if lower(v_user.email) <> v_inv.email then
    raise exception 'convite emitido para outro e-mail' using errcode = '42501';
  end if;

  insert into public.staff_members (user_id, role, invited_by)
  values (v_user.id, v_inv.role, v_inv.created_by)
  on conflict (user_id) do update set role = excluded.role, active = true;

  delete from public.staff_permissions where user_id = v_user.id;
  insert into public.staff_permissions (user_id, permission, granted_by)
  select v_user.id, p, v_inv.created_by from unnest(v_inv.permissions) p
  on conflict do nothing;

  update public.staff_invitations set accepted_at = now(), accepted_by = v_user.id where id = v_inv.id;
  perform public.write_audit('convite_staff_aceito', 'staff_invitations', v_inv.id::text);
end $$;

create or replace function public.admin_set_staff_access(
  p_user_id uuid, p_active boolean, p_role public.staff_role, p_permissions public.staff_permission[], p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('administracao') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if (p_role = 'administrador' or exists (select 1 from public.staff_members where user_id = p_user_id and role = 'administrador'))
     and not public.is_staff_admin() then
    raise exception 'somente administradores alteram administradores' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and (not p_active or p_role <> 'administrador') then
    raise exception 'não é possível remover o próprio acesso administrativo' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'motivo obrigatório' using errcode = '22023';
  end if;

  update public.staff_members set active = p_active, role = p_role where user_id = p_user_id;
  if not found then raise exception 'membro não encontrado' using errcode = '22023'; end if;

  delete from public.staff_permissions where user_id = p_user_id and permission <> all (coalesce(p_permissions, '{}'));
  insert into public.staff_permissions (user_id, permission, granted_by)
  select p_user_id, p, auth.uid() from unnest(coalesce(p_permissions, '{}')) p
  on conflict do nothing;

  perform public.write_audit('staff_acesso_alterado', 'staff_members', p_user_id::text,
    jsonb_build_object('active', p_active, 'role', p_role, 'permissions', p_permissions), p_reason);
end $$;

-- Primeiro administrador: só pode ser executado com service role (CLI/SQL), e só se não houver admin.
create or replace function public.bootstrap_first_admin(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if exists (select 1 from public.staff_members where role = 'administrador' and active) then
    raise exception 'já existe administrador ativo';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email) and email_confirmed_at is not null;
  if v_user is null then raise exception 'usuário com e-mail verificado não encontrado'; end if;
  insert into public.staff_members (user_id, role) values (v_user, 'administrador');
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id)
  values (null, 'bootstrap_primeiro_admin', 'staff_members', v_user::text);
end $$;
revoke execute on function public.bootstrap_first_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;  -- sem policies: só service role

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_staff_permission('clientes') or public.has_staff_permission('corretores')
         or public.has_staff_permission('administracao') or public.has_staff_permission('atendimento')
         or public.has_staff_permission('auditoria'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create policy staff_members_select on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission('administracao'));
create policy staff_permissions_select on public.staff_permissions for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission('administracao'));
create policy staff_invitations_select on public.staff_invitations for select to authenticated
  using (public.has_staff_permission('administracao'));
-- staff_*: nenhuma policy de insert/update/delete → somente via funções acima.

create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_staff_permission('auditoria'));

revoke all on public.staff_members, public.staff_permissions, public.staff_invitations, public.audit_log, public.rate_limits from anon;
revoke insert, update, delete on public.staff_members, public.staff_permissions, public.staff_invitations, public.audit_log from authenticated;
revoke all on public.rate_limits from authenticated;
