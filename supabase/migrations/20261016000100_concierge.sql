-- OUZ Experience — Etapa 4: Concierge (serviços adicionais, separados da assistência técnica).
-- Operado pela OUZ: o sistema NÃO contrata prestadores, NÃO cobra e NÃO confirma serviços automaticamente.
-- Fluxo: solicitação → análise de disponibilidade → orçamento/condições (quando necessário) → aprovação do cliente
--        → agendamento → execução → conclusão e avaliação.

create type public.concierge_category as enum (
  'flores', 'passeio_cachorro', 'compras_mercado', 'limpeza', 'lavanderia', 'manutencao', 'recebimento_entregas', 'outros'
);
create type public.concierge_status as enum (
  'solicitada', 'em_analise', 'indisponivel', 'orcamento_enviado', 'aprovada_cliente', 'recusada_cliente',
  'agendada', 'em_execucao', 'concluida', 'cancelada'
);
create type public.occurrence_kind as enum ('atraso', 'nao_comparecimento', 'dano', 'reclamacao', 'reagendamento', 'outro');

-- ---------------------------------------------------------------------------
-- Catálogo por empreendimento e prestadores
-- ---------------------------------------------------------------------------
create table public.concierge_services (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  category public.concierge_category not null,
  name text not null check (length(name) between 2 and 120),
  description text,
  pricing_note text,                         -- ex.: "Sob orçamento", "A partir de R$ ..." (informativo)
  requires_quote boolean not null default true,  -- false: a OUZ pode agendar sem orçamento (ex.: serviço incluso)
  cancellation_policy text,
  active boolean not null default true,
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger concierge_services_updated_at before update on public.concierge_services
  for each row execute function public.set_updated_at();
create trigger concierge_services_audit after insert or update or delete on public.concierge_services
  for each row execute function public.audit_row_change();

create table public.concierge_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 200),
  document text,                              -- CPF/CNPJ do prestador (opcional), só staff
  contact_name text,
  phone text,
  email text,
  categories public.concierge_category[] not null default '{}',
  notes text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document is null or public.is_valid_cpf(document) or public.is_valid_cnpj(document))
);
create trigger concierge_providers_updated_at before update on public.concierge_providers
  for each row execute function public.set_updated_at();
create trigger concierge_providers_audit after insert or update or delete on public.concierge_providers
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Solicitações, orçamentos, histórico e ocorrências
-- ---------------------------------------------------------------------------
create sequence public.concierge_number_seq start 5001;

create table public.concierge_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.concierge_number_seq'),
  client_id uuid not null references public.clients (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  service_id uuid not null references public.concierge_services (id),
  details text not null check (length(details) between 3 and 4000),
  preferred_at timestamptz,                 -- preferência do cliente (não é confirmação)
  status public.concierge_status not null default 'solicitada',
  provider_id uuid references public.concierge_providers (id),   -- interno
  scheduled_at timestamptz,
  service_amount numeric(14,2),             -- valor do serviço (orçamento vigente)
  ouz_fee numeric(14,2),                    -- taxa da OUZ, quando houver
  conditions text,
  quote_valid_until date,
  status_note text,                         -- última mensagem da OUZ ao cliente
  cancel_reason text,
  cancelled_by_client boolean,
  rating smallint check (rating between 1 and 5),
  rating_comment text,
  completed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_amount is null or service_amount >= 0),
  check (ouz_fee is null or ouz_fee >= 0)
);
create index concierge_requests_status_idx on public.concierge_requests (status, created_at);
create index concierge_requests_unit_idx on public.concierge_requests (unit_id, created_at desc);
create trigger concierge_requests_updated_at before update on public.concierge_requests
  for each row execute function public.set_updated_at();
create trigger concierge_requests_audit after insert or update on public.concierge_requests
  for each row execute function public.audit_row_change();

create table public.concierge_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.concierge_requests (id) on delete cascade,
  service_amount numeric(14,2) not null check (service_amount >= 0),
  ouz_fee numeric(14,2) not null default 0 check (ouz_fee >= 0),
  conditions text,
  valid_until date,
  provider_id uuid references public.concierge_providers (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.concierge_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.concierge_requests (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  from_status public.concierge_status,
  to_status public.concierge_status,
  note text,
  visible_to_client boolean not null default true
);

create table public.concierge_occurrences (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.concierge_requests (id) on delete cascade,
  kind public.occurrence_kind not null,
  description text not null check (length(description) between 3 and 4000),
  visible_to_client boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create trigger concierge_occurrences_audit after insert on public.concierge_occurrences
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------
create or replace function public._concierge_event(p_id uuid, p_from public.concierge_status, p_to public.concierge_status, p_note text, p_visible boolean default true)
returns void language sql security definer set search_path = '' as $$
  insert into public.concierge_events (request_id, actor_user_id, from_status, to_status, note, visible_to_client)
  values (p_id, auth.uid(), p_from, p_to, p_note, p_visible)
$$;
revoke execute on function public._concierge_event(uuid, public.concierge_status, public.concierge_status, text, boolean) from public, anon, authenticated;

create or replace function public._concierge_notify_client(r public.concierge_requests, p_title text, p_body text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select user_id into v_user from public.clients where id = r.client_id;
  if v_user is not null then
    perform public.notify_user(v_user, 'concierge', p_title, p_body, '/cliente/concierge/' || r.id, 'concierge:' || r.id || ':' || p_key);
  end if;
end $$;
revoke execute on function public._concierge_notify_client(public.concierge_requests, text, text, text) from public, anon, authenticated;

create or replace function public.client_request_concierge(p_unit_id uuid, p_service_id uuid, p_details text, p_preferred_at timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.concierge_services; v_dev uuid; v_id uuid; v_number bigint;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into s from public.concierge_services where id = p_service_id;
  select development_id into v_dev from public.units where id = p_unit_id;
  if s.id is null or not s.active or s.development_id <> v_dev then raise exception 'serviço indisponível para esta unidade' using errcode = '22023'; end if;
  if p_preferred_at is not null and p_preferred_at < now() then raise exception 'a data preferida precisa ser futura' using errcode = '22023'; end if;
  insert into public.concierge_requests (client_id, unit_id, service_id, details, preferred_at, created_by)
  values (public.current_client_id(), p_unit_id, s.id, trim(p_details), p_preferred_at, auth.uid())
  returning id, number into v_id, v_number;
  perform public._concierge_event(v_id, null, 'solicitada', 'Solicitação recebida. A OUZ verificará a disponibilidade.');
  perform public.notify_staff('concierge', 'concierge', 'Nova solicitação de concierge #' || v_number, s.name, '/admin/concierge/' || v_id, 'concierge:' || v_id || ':nova');
  return v_id;
end $$;

-- Transições operadas pela OUZ (sem orçamento e sem agendamento: há funções próprias).
create or replace function public.admin_concierge_transition(p_id uuid, p_to public.concierge_status, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests; s public.concierge_services; v_ok boolean; v_prev public.concierge_status;
begin
  if not public.has_staff_permission('concierge') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null then raise exception 'solicitação não encontrada' using errcode = '22023'; end if;
  select * into s from public.concierge_services where id = r.service_id;
  v_ok := case
    when r.status = 'solicitada' then p_to in ('em_analise', 'indisponivel', 'cancelada')
    when r.status = 'em_analise' then p_to in ('indisponivel', 'cancelada')
    when r.status = 'orcamento_enviado' then p_to in ('cancelada', 'em_analise')
    when r.status = 'aprovada_cliente' then p_to in ('cancelada')
    when r.status = 'agendada' then p_to in ('em_execucao', 'cancelada')
    when r.status = 'em_execucao' then p_to in ('concluida', 'cancelada')
    else false end;
  if not v_ok then raise exception 'transição % → % não permitida', r.status, p_to using errcode = '22023'; end if;
  if p_to in ('indisponivel', 'cancelada') and coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'informe o motivo ao cliente' using errcode = '22023';
  end if;
  v_prev := r.status;
  update public.concierge_requests
     set status = p_to, status_note = coalesce(nullif(trim(p_note), ''), status_note),
         cancel_reason = case when p_to = 'cancelada' then trim(p_note) else cancel_reason end,
         cancelled_by_client = case when p_to = 'cancelada' then false else cancelled_by_client end,
         completed_at = case when p_to = 'concluida' then now() else completed_at end
   where id = r.id returning * into r;
  perform public._concierge_event(r.id, v_prev, p_to, nullif(trim(p_note), ''));
  perform public._concierge_notify_client(r, 'Concierge #' || r.number || ': ' ||
    case p_to when 'em_analise' then 'em análise' when 'indisponivel' then 'indisponível' when 'cancelada' then 'cancelada'
              when 'em_execucao' then 'em execução' when 'concluida' then 'concluída — avalie o serviço' else p_to::text end,
    coalesce(nullif(trim(p_note), ''), s.name), p_to::text);
end $$;

create or replace function public.admin_concierge_quote(p_id uuid, p_service_amount numeric, p_ouz_fee numeric, p_conditions text,
                                                        p_valid_until date, p_provider_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  if not public.has_staff_permission('concierge') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_service_amount is null or p_service_amount < 0 or coalesce(p_ouz_fee, 0) < 0 then raise exception 'valores inválidos' using errcode = '22023'; end if;
  if p_valid_until is not null and p_valid_until < current_date then raise exception 'validade no passado' using errcode = '22023'; end if;
  select * into r from public.concierge_requests where id = p_id for update;
  if r.status not in ('solicitada', 'em_analise', 'orcamento_enviado', 'recusada_cliente') then
    raise exception 'não é possível orçar nesta situação' using errcode = '22023';
  end if;
  insert into public.concierge_quotes (request_id, service_amount, ouz_fee, conditions, valid_until, provider_id, created_by)
  values (r.id, p_service_amount, coalesce(p_ouz_fee, 0), nullif(trim(p_conditions), ''), p_valid_until, p_provider_id, auth.uid());
  update public.concierge_requests
     set status = 'orcamento_enviado', service_amount = p_service_amount, ouz_fee = coalesce(p_ouz_fee, 0),
         conditions = nullif(trim(p_conditions), ''), quote_valid_until = p_valid_until, provider_id = coalesce(p_provider_id, provider_id)
   where id = r.id returning * into r;
  perform public._concierge_event(r.id, null, 'orcamento_enviado', 'Orçamento e condições enviados para aprovação.');
  perform public._concierge_notify_client(r, 'Concierge #' || r.number || ': orçamento para aprovação',
    'Valor total: R$ ' || to_char(p_service_amount + coalesce(p_ouz_fee, 0), 'FM999G999G990D00'), 'orcamento:' || extract(epoch from now())::bigint);
end $$;

-- Aprovação é sempre do cliente (nada é confirmado automaticamente).
create or replace function public.client_decide_concierge_quote(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.is_client_of_unit(r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'orcamento_enviado' then raise exception 'não há orçamento aguardando sua decisão' using errcode = '22023'; end if;
  if r.quote_valid_until is not null and r.quote_valid_until < current_date then raise exception 'orçamento vencido; peça uma atualização à OUZ' using errcode = '22023'; end if;
  update public.concierge_requests set status = case when p_approve then 'aprovada_cliente'::public.concierge_status else 'recusada_cliente'::public.concierge_status end
   where id = r.id;
  perform public._concierge_event(r.id, 'orcamento_enviado', case when p_approve then 'aprovada_cliente'::public.concierge_status else 'recusada_cliente'::public.concierge_status end,
    case when p_approve then 'Orçamento aprovado pelo cliente.' else 'Orçamento recusado pelo cliente.' end);
  perform public.notify_staff('concierge', 'concierge', 'Concierge #' || r.number || ': ' || case when p_approve then 'orçamento aprovado' else 'orçamento recusado' end,
    'Responda no painel.', '/admin/concierge/' || r.id, 'concierge:' || r.id || ':decisao:' || extract(epoch from now())::bigint);
end $$;

-- Agendamento pela OUZ: exige aprovação do cliente, salvo serviço que dispensa orçamento.
create or replace function public.admin_concierge_schedule(p_id uuid, p_scheduled_at timestamptz, p_provider_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests; s public.concierge_services; v_prev public.concierge_status;
begin
  if not public.has_staff_permission('concierge') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.concierge_requests where id = p_id for update;
  select * into s from public.concierge_services where id = r.service_id;
  if not (r.status in ('aprovada_cliente', 'agendada') or (r.status in ('solicitada', 'em_analise') and not s.requires_quote)) then
    raise exception 'agendamento exige aprovação do cliente (ou serviço que dispensa orçamento)' using errcode = '22023';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then raise exception 'informe uma data futura' using errcode = '22023'; end if;
  if p_provider_id is not null and not exists (select 1 from public.concierge_providers where id = p_provider_id and active) then
    raise exception 'prestador inválido ou inativo' using errcode = '22023';
  end if;
  v_prev := r.status;
  update public.concierge_requests set status = 'agendada', scheduled_at = p_scheduled_at, provider_id = coalesce(p_provider_id, provider_id),
         status_note = coalesce(nullif(trim(p_note), ''), status_note)
   where id = r.id returning * into r;
  perform public._concierge_event(r.id, v_prev, 'agendada',
    case when v_prev = 'agendada' then 'Reagendado para ' else 'Agendado para ' end || to_char(p_scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'));
  perform public._concierge_notify_client(r, 'Concierge #' || r.number || ': agendado',
    to_char(p_scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'), 'agenda:' || extract(epoch from p_scheduled_at)::bigint);
end $$;

create or replace function public.client_cancel_concierge(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.is_client_of_unit(r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status not in ('solicitada', 'em_analise', 'orcamento_enviado', 'aprovada_cliente', 'agendada') then
    raise exception 'esta solicitação não pode mais ser cancelada pelo portal; fale com a OUZ' using errcode = '22023';
  end if;
  update public.concierge_requests set status = 'cancelada', cancel_reason = nullif(trim(p_reason), ''), cancelled_by_client = true where id = r.id;
  perform public._concierge_event(r.id, r.status, 'cancelada', 'Cancelada pelo cliente' || coalesce(': ' || nullif(trim(p_reason), ''), '.'));
  perform public.notify_staff('concierge', 'concierge', 'Concierge #' || r.number || ' cancelado pelo cliente',
    case when r.status = 'agendada' then 'Estava agendado — avise o prestador.' else coalesce(nullif(trim(p_reason), ''), '') end,
    '/admin/concierge/' || r.id, 'concierge:' || r.id || ':cancelada');
end $$;

create or replace function public.client_rate_concierge(p_id uuid, p_rating integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.is_client_of_unit(r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'concluida' then raise exception 'avaliação disponível após a conclusão' using errcode = '22023'; end if;
  if r.rating is not null then raise exception 'serviço já avaliado' using errcode = '22023'; end if;
  if p_rating not between 1 and 5 then raise exception 'nota de 1 a 5' using errcode = '22023'; end if;
  update public.concierge_requests set rating = p_rating, rating_comment = nullif(trim(p_comment), '') where id = r.id;
end $$;

create or replace function public.admin_concierge_occurrence(p_id uuid, p_kind public.occurrence_kind, p_description text, p_visible boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  if not public.has_staff_permission('concierge') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.concierge_requests where id = p_id;
  if r.id is null then raise exception 'solicitação não encontrada' using errcode = '22023'; end if;
  insert into public.concierge_occurrences (request_id, kind, description, visible_to_client, created_by)
  values (r.id, p_kind, trim(p_description), coalesce(p_visible, false), auth.uid());
  if p_visible then
    perform public._concierge_notify_client(r, 'Concierge #' || r.number || ': atualização', left(trim(p_description), 200),
      'ocorrencia:' || extract(epoch from now())::bigint);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.concierge_services enable row level security;
alter table public.concierge_providers enable row level security;
alter table public.concierge_requests enable row level security;
alter table public.concierge_quotes enable row level security;
alter table public.concierge_events enable row level security;
alter table public.concierge_occurrences enable row level security;

create policy cs_client on public.concierge_services for select to authenticated
  using (active and public.is_client_of_development(development_id));
create policy cs_staff on public.concierge_services for all to authenticated
  using (public.has_staff_permission('concierge')) with check (public.has_staff_permission('concierge'));

-- Prestadores: exclusivo da OUZ.
create policy cp_staff on public.concierge_providers for all to authenticated
  using (public.has_staff_permission('concierge')) with check (public.has_staff_permission('concierge'));

create policy cr_client on public.concierge_requests for select to authenticated using (public.is_client_of_unit(unit_id));
create policy cr_staff on public.concierge_requests for select to authenticated using (public.has_staff_permission('concierge'));
-- O cliente não vê o prestador nem anotações internas: colunas liberadas explicitamente.
revoke select on public.concierge_requests from authenticated;
grant select (id, number, client_id, unit_id, service_id, details, preferred_at, status, scheduled_at, service_amount, ouz_fee,
              conditions, quote_valid_until, status_note, cancel_reason, cancelled_by_client, rating, rating_comment, completed_at,
              created_at, updated_at) on public.concierge_requests to authenticated;

create or replace function public.admin_concierge_internal(p_id uuid)
returns table (provider_id uuid, provider_name text, provider_phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('concierge') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select r.provider_id, p.name, p.phone from public.concierge_requests r
    left join public.concierge_providers p on p.id = r.provider_id where r.id = p_id;
end $$;

create policy cq_staff on public.concierge_quotes for select to authenticated using (public.has_staff_permission('concierge'));
create policy ce_client on public.concierge_events for select to authenticated
  using (visible_to_client and exists (select 1 from public.concierge_requests r where r.id = request_id and public.is_client_of_unit(r.unit_id)));
create policy ce_staff on public.concierge_events for select to authenticated using (public.has_staff_permission('concierge'));
create policy co_client on public.concierge_occurrences for select to authenticated
  using (visible_to_client and exists (select 1 from public.concierge_requests r where r.id = request_id and public.is_client_of_unit(r.unit_id)));
create policy co_staff on public.concierge_occurrences for select to authenticated using (public.has_staff_permission('concierge'));

revoke insert, update, delete on public.concierge_requests, public.concierge_quotes, public.concierge_events, public.concierge_occurrences from authenticated;
revoke all on public.concierge_services, public.concierge_providers, public.concierge_requests, public.concierge_quotes,
  public.concierge_events, public.concierge_occurrences from anon;
