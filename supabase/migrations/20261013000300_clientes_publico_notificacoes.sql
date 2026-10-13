-- OUZ Experience — Etapa 1: clientes e vínculo com unidades, área pública, consentimentos, notificações, retenção

create type public.client_unit_relation as enum ('titular', 'cotitular', 'procurador');
create type public.document_type as enum ('cpf', 'cnpj');
create type public.consent_purpose as enum ('termos_uso', 'privacidade', 'comunicacoes_marketing', 'cadastro_corretor');
create type public.event_audience as enum ('geral', 'clientes', 'corretores_aprovados', 'empreendimento', 'convidados');
create type public.outbox_status as enum ('pendente', 'processando', 'enviado', 'falhou', 'descartado');

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,   -- preenchido só ao aceitar convite
  full_name text not null check (length(full_name) between 2 and 200),
  email text not null check (email = lower(email)),
  phone text,
  is_demo boolean not null default false,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_email_idx on public.clients (email);
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function public.audit_row_change();

-- Documento do cliente em tabela separada: atendimento vê o cliente, mas não o CPF.
create table public.client_identities (
  client_id uuid primary key references public.clients (id) on delete cascade,
  document_type public.document_type not null,
  document_number text not null check (document_number ~ '^\d{11}$|^\d{14}$'),
  document_hash text not null unique,                 -- HMAC(pepper) calculado no servidor
  updated_at timestamptz not null default now()
);
create trigger client_identities_audit after insert or update or delete on public.client_identities
  for each row execute function public.audit_row_change();

create table public.client_units (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete restrict,
  relation public.client_unit_relation not null default 'titular',
  active boolean not null default true,
  linked_by uuid references public.profiles (id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unique (client_id, unit_id)
);
create index client_units_unit_idx on public.client_units (unit_id) where active;
create trigger client_units_audit after insert or update or delete on public.client_units
  for each row execute function public.audit_row_change();

create table public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at timestamptz
);

create or replace function public.is_client() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c join public.client_units cu on cu.client_id = c.id and cu.active
    where c.user_id = auth.uid()
  )
$$;

create or replace function public.is_client_of_unit(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c join public.client_units cu on cu.client_id = c.id and cu.active
    where c.user_id = auth.uid() and cu.unit_id = p_unit_id
  )
$$;

create or replace function public.is_client_of_development(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    join public.client_units cu on cu.client_id = c.id and cu.active
    join public.units u on u.id = cu.unit_id
    where c.user_id = auth.uid() and u.development_id = p_development_id
  )
$$;

create or replace function public.create_client_invitation(p_client_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_email text;
  v_id uuid;
begin
  if not public.has_staff_permission('clientes') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select email into v_email from public.clients where id = p_client_id and user_id is null;
  if v_email is null then raise exception 'cliente inexistente ou já vinculado a uma conta' using errcode = '22023'; end if;

  update public.client_invitations set revoked_at = now()
  where client_id = p_client_id and accepted_at is null and revoked_at is null;

  insert into public.client_invitations (client_id, email, token_hash, expires_at, created_by)
  values (p_client_id, v_email, public.hash_token(v_token), now() + interval '7 days', auth.uid())
  returning id into v_id;

  perform public.write_audit('convite_cliente_criado', 'client_invitations', v_id::text, jsonb_build_object('client_id', p_client_id));
  return v_token;
end $$;

-- O e-mail verificado da conta precisa ser o mesmo do convite. CPF não é usado.
create or replace function public.accept_client_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.client_invitations;
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  if v_user.email_confirmed_at is null then raise exception 'e-mail não verificado' using errcode = '42501'; end if;

  select * into v_inv from public.client_invitations where token_hash = public.hash_token(p_token) for update;
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'convite inválido ou expirado' using errcode = '22023';
  end if;
  if lower(v_user.email) <> v_inv.email then
    raise exception 'convite emitido para outro e-mail' using errcode = '42501';
  end if;
  if exists (select 1 from public.clients where user_id = v_user.id and id <> v_inv.client_id) then
    raise exception 'esta conta já está vinculada a outro cadastro de cliente; contate a OUZ' using errcode = '22023';
  end if;

  update public.clients set user_id = v_user.id where id = v_inv.client_id and (user_id is null or user_id = v_user.id);
  if not found then raise exception 'cadastro já vinculado a outra conta' using errcode = '22023'; end if;

  update public.client_invitations set accepted_at = now(), accepted_by = v_user.id where id = v_inv.id;
  perform public.write_audit('convite_cliente_aceito', 'client_invitations', v_inv.id::text, jsonb_build_object('client_id', v_inv.client_id));
  return v_inv.client_id;
end $$;

alter table public.clients enable row level security;
alter table public.client_identities enable row level security;
alter table public.client_units enable row level security;
alter table public.client_invitations enable row level security;

create policy clients_select on public.clients for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission('clientes') or public.has_staff_permission('atendimento'));
create policy clients_write on public.clients for insert to authenticated
  with check (public.has_staff_permission('clientes'));
create policy clients_update on public.clients for update to authenticated
  using (public.has_staff_permission('clientes')) with check (public.has_staff_permission('clientes'));
-- user_id só muda por accept_client_invitation.
revoke update on public.clients from authenticated;
grant update (full_name, email, phone) on public.clients to authenticated;

create policy client_identities_select on public.client_identities for select to authenticated
  using (public.has_staff_permission('clientes') or public.has_staff_permission('documentos') or public.has_staff_permission('financeiro')
         or exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
create policy client_identities_write on public.client_identities for all to authenticated
  using (public.has_staff_permission('clientes')) with check (public.has_staff_permission('clientes'));

create policy client_units_select on public.client_units for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
         or public.has_staff_permission('clientes') or public.has_staff_permission('atendimento'));
create policy client_units_write on public.client_units for all to authenticated
  using (public.has_staff_permission('clientes')) with check (public.has_staff_permission('clientes'));

create policy client_invitations_select on public.client_invitations for select to authenticated
  using (public.has_staff_permission('clientes'));

-- Cliente enxerga o empreendimento e as unidades às quais está vinculado.
create policy developments_select_client on public.developments for select to authenticated
  using (public.is_client_of_development(id));
create policy units_select_client on public.units for select to authenticated
  using (public.is_client_of_unit(id));
create policy units_select_atendimento on public.units for select to authenticated
  using (public.has_staff_permission('atendimento'));

revoke all on public.clients, public.client_identities, public.client_units, public.client_invitations from anon;
revoke insert, update, delete on public.client_invitations from authenticated;

-- ---------------------------------------------------------------------------
-- Área pública: novidades e eventos (agenda completa com RSVP na Etapa 3)
-- ---------------------------------------------------------------------------
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  title text not null,
  excerpt text,
  body text,
  cover_image_path text,
  development_id uuid references public.developments (id) on delete set null,
  published_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger news_posts_updated_at before update on public.news_posts
  for each row execute function public.set_updated_at();
create trigger news_posts_audit after insert or update or delete on public.news_posts
  for each row execute function public.audit_row_change();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_image_path text,
  location_text text,
  online_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  audience public.event_audience not null default 'geral',
  development_id uuid references public.developments (id) on delete set null,
  capacity integer check (capacity is null or capacity > 0),
  is_published boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger events_audit after insert or update or delete on public.events
  for each row execute function public.audit_row_change();

alter table public.news_posts enable row level security;
alter table public.events enable row level security;

create policy news_select_public on public.news_posts for select to anon, authenticated
  using (published_at is not null and published_at <= now());
create policy news_staff on public.news_posts for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy events_select_public on public.events for select to anon, authenticated
  using (is_published and audience = 'geral');
create policy events_select_clients on public.events for select to authenticated
  using (is_published and audience = 'clientes' and public.is_client());
create policy events_select_brokers on public.events for select to authenticated
  using (is_published and audience = 'corretores_aprovados' and public.is_approved_broker());
create policy events_select_development on public.events for select to authenticated
  using (is_published and audience = 'empreendimento' and development_id is not null
         and (public.is_client_of_development(development_id) or public.broker_can_access_development(development_id)));
create policy events_staff on public.events for all to authenticated
  using (public.has_staff_permission('eventos')) with check (public.has_staff_permission('eventos'));

-- ---------------------------------------------------------------------------
-- Formulário de interesse (leads). Inserção pelo servidor (com rate limit), leitura pelo staff.
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 200),
  email text not null check (length(email) <= 254),
  phone text check (phone is null or length(phone) <= 30),
  development_id uuid references public.developments (id) on delete set null,
  message text check (message is null or length(message) <= 2000),
  is_broker boolean not null default false,
  marketing_opt_in boolean not null default false,
  privacy_version text not null,
  status text not null default 'novo' check (status in ('novo', 'em_contato', 'encerrado')),
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create policy leads_staff_select on public.leads for select to authenticated
  using (public.has_staff_permission('atendimento') or public.has_staff_permission('comercial'));
create policy leads_staff_update on public.leads for update to authenticated
  using (public.has_staff_permission('atendimento') or public.has_staff_permission('comercial'))
  with check (public.has_staff_permission('atendimento') or public.has_staff_permission('comercial'));
revoke all on public.leads from anon;
revoke insert, delete on public.leads from authenticated;

-- ---------------------------------------------------------------------------
-- Consentimentos versionados
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  purpose public.consent_purpose not null,
  document_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (num_nonnulls(user_id, lead_id) = 1)
);
create index consents_user_idx on public.consents (user_id, purpose);
alter table public.consents enable row level security;
create policy consents_select on public.consents for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission('auditoria'));
create policy consents_insert_self on public.consents for insert to authenticated
  with check (user_id = auth.uid() and lead_id is null and revoked_at is null);
create policy consents_revoke_self on public.consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.consents from authenticated;
grant update (revoked_at) on public.consents to authenticated;
revoke all on public.consents from anon;

-- ---------------------------------------------------------------------------
-- Notificações in-app e outbox de e-mail (dedupe + reprocessamento)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke all on public.notifications from anon;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  channel text not null default 'email' check (channel in ('email')),
  template text not null,
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_email text,                       -- quando não há usuário (ex.: convite)
  payload jsonb not null default '{}'::jsonb, -- nunca CPF completo nem documentos
  status public.outbox_status not null default 'pendente',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(recipient_user_id, recipient_email) >= 1)
);
create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at) where status in ('pendente', 'falhou');
create trigger notification_outbox_updated_at before update on public.notification_outbox
  for each row execute function public.set_updated_at();
alter table public.notification_outbox enable row level security;
create policy outbox_staff_select on public.notification_outbox for select to authenticated
  using (public.has_staff_permission('notificacoes'));
revoke all on public.notification_outbox from anon;
revoke insert, update, delete on public.notification_outbox from authenticated;

-- Worker (service role): pega um lote com lock, sem colidir com execuções paralelas.
create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  -- itens presos em "processando" há mais de 10 min voltam para a fila
  update public.notification_outbox set status = 'falhou', last_error = 'timeout de processamento'
  where status = 'processando' and updated_at < now() - interval '10 minutes';

  return query
  update public.notification_outbox o set status = 'processando', attempts = o.attempts + 1
  where o.id in (
    select id from public.notification_outbox
    where status in ('pendente', 'falhou') and next_attempt_at <= now() and attempts < 8
    order by next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning o.*;
end $$;
revoke execute on function public.claim_outbox_batch(integer) from public, anon, authenticated;

create or replace function public.complete_outbox_item(p_id uuid, p_ok boolean, p_provider_id text, p_error text)
returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox
     set status = case when p_ok then 'enviado'::public.outbox_status else 'falhou'::public.outbox_status end,
         sent_at = case when p_ok then now() else sent_at end,
         provider_message_id = coalesce(p_provider_id, provider_message_id),
         last_error = case when p_ok then null else left(p_error, 500) end,
         next_attempt_at = case when p_ok then next_attempt_at else now() + make_interval(mins => least(power(2, attempts)::int, 240)) end
   where id = p_id and status = 'processando'
$$;
revoke execute on function public.complete_outbox_item(uuid, boolean, text, text) from public, anon, authenticated;

-- Reprocessamento manual pelo staff.
create or replace function public.admin_retry_outbox_item(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('notificacoes') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.notification_outbox set status = 'pendente', attempts = 0, next_attempt_at = now(), last_error = null
  where id = p_id and status in ('falhou', 'descartado');
  if not found then raise exception 'item não pode ser reprocessado' using errcode = '22023'; end if;
  perform public.write_audit('outbox_reprocessar', 'notification_outbox', p_id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Retenção configurável (rotina criada; políticas desligadas até decisão jurídica)
-- ---------------------------------------------------------------------------
create table public.retention_policies (
  category text primary key,
  retain_days integer not null check (retain_days > 0),
  action text not null check (action in ('excluir', 'anonimizar')),
  enabled boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);
insert into public.retention_policies (category, retain_days, action, notes) values
  ('leads', 730, 'anonimizar', 'Prazo provisório — aguarda definição jurídica'),
  ('rate_limits', 2, 'excluir', 'Contadores técnicos'),
  ('notification_outbox_enviados', 180, 'excluir', 'Itens enviados');
alter table public.retention_policies enable row level security;
create policy retention_select on public.retention_policies for select to authenticated
  using (public.has_staff_permission('administracao'));
create policy retention_update on public.retention_policies for update to authenticated
  using (public.is_staff_admin()) with check (public.is_staff_admin());
revoke all on public.retention_policies from anon;

create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_n integer;
  p record;
begin
  for p in select * from public.retention_policies where enabled loop
    if p.category = 'leads' then
      update public.leads set full_name = 'Anonimizado', email = 'anonimizado@invalid', phone = null, message = null
      where created_at < now() - make_interval(days => p.retain_days) and email <> 'anonimizado@invalid';
    elsif p.category = 'rate_limits' then
      delete from public.rate_limits where window_start < now() - make_interval(days => p.retain_days);
    elsif p.category = 'notification_outbox_enviados' then
      delete from public.notification_outbox where status = 'enviado' and sent_at < now() - make_interval(days => p.retain_days);
    end if;
    get diagnostics v_n = row_count;
    v_result := v_result || jsonb_build_object(p.category, v_n);
  end loop;
  if v_result <> '{}'::jsonb then
    insert into public.audit_log (action, entity_type, metadata) values ('retencao_aplicada', 'retention_policies', v_result);
  end if;
  return v_result;
end $$;
revoke execute on function public.apply_retention() from public, anon, authenticated;
