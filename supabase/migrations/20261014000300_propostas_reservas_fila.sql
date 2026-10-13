-- OUZ Experience — Etapa 2: pré-lançamento (tabelas), propostas, avaliação de política, fila, reservas e documentação.
-- Regras críticas em funções transacionais com lock da unidade (SELECT ... FOR UPDATE) e índice único parcial.

create type public.proposal_status as enum (
  'rascunho', 'em_analise', 'na_fila', 'reservada', 'reprovada', 'retirada', 'expirada', 'substituida', 'concluida'
);
create type public.reservation_status as enum (
  'aguardando_documentos', 'documentacao_enviada', 'aguardando_conferencia', 'documentacao_validada',
  'pendencias_documentacao', 'expirada', 'cancelada', 'convertida'
);
create type public.reservation_item_status as enum ('pendente', 'enviado', 'aprovado', 'recusado');
create type public.prelaunch_campaign_status as enum ('rascunho', 'aberta', 'encerrada');
create type public.prelaunch_registration_status as enum (
  'registrado', 'em_analise_duplicidade', 'em_onda', 'convidado', 'proposta_enviada', 'janela_encerrada', 'cancelado'
);

-- ---------------------------------------------------------------------------
-- Pré-lançamento (registro de interesse ≠ proposta ≠ reserva). Nada é cobrado nem prometido.
-- ---------------------------------------------------------------------------
create table public.prelaunch_campaigns (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  name text not null,
  status public.prelaunch_campaign_status not null default 'rascunho',
  max_registrations_per_client integer not null default 1 check (max_registrations_per_client between 1 and 20),
  priority_criteria text not null default 'Ordem cronológica de registro',
  terms text,
  opened_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger prelaunch_campaigns_updated_at before update on public.prelaunch_campaigns
  for each row execute function public.set_updated_at();
create trigger prelaunch_campaigns_audit after insert or update or delete on public.prelaunch_campaigns
  for each row execute function public.audit_row_change();

create table public.prelaunch_waves (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.prelaunch_campaigns (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  released_at timestamptz,
  released_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (window_ends_at is null or window_ends_at > window_starts_at)
);
create trigger prelaunch_waves_audit after insert or update or delete on public.prelaunch_waves
  for each row execute function public.audit_row_change();

create table public.prelaunch_registrations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.prelaunch_campaigns (id) on delete cascade,
  broker_user_id uuid not null references public.broker_profiles (user_id),
  client_name text not null check (length(client_name) between 2 and 200),
  client_document_type public.document_type not null,
  client_document text not null,
  client_document_hash text not null,
  preferences text check (preferences is null or length(preferences) <= 1000),
  status public.prelaunch_registration_status not null default 'registrado',
  wave_id uuid references public.prelaunch_waves (id) on delete set null,
  priority_rank integer,
  registered_at timestamptz not null default now(),
  idempotency_key text not null,
  updated_at timestamptz not null default now(),
  unique (broker_user_id, idempotency_key),
  check ((client_document_type = 'cpf' and public.is_valid_cpf(client_document)) or (client_document_type = 'cnpj' and public.is_valid_cnpj(client_document)))
);
create index prelaunch_registrations_campaign_idx on public.prelaunch_registrations (campaign_id, status, registered_at);
create index prelaunch_registrations_hash_idx on public.prelaunch_registrations (campaign_id, client_document_hash);
create trigger prelaunch_registrations_updated_at before update on public.prelaunch_registrations
  for each row execute function public.set_updated_at();

create table public.prelaunch_registration_events (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.prelaunch_registrations (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  from_status public.prelaunch_registration_status,
  to_status public.prelaunch_registration_status not null,
  note text
);

create or replace function public.set_registration_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.client_document := regexp_replace(upper(new.client_document), '[^0-9A-Z]', '', 'g');
  new.client_document_hash := public.document_hash(new.client_document);
  return new;
end $$;
create trigger prelaunch_registrations_hash before insert or update of client_document, client_document_hash on public.prelaunch_registrations
  for each row execute function public.set_registration_hash();

-- Corretor tem janela de proposta aberta no pré-lançamento deste empreendimento?
create or replace function public.broker_has_open_window(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_approved_broker() and exists (
    select 1
    from public.prelaunch_registrations r
    join public.prelaunch_waves w on w.id = r.wave_id
    join public.prelaunch_campaigns c on c.id = r.campaign_id
    where c.development_id = p_development_id
      and r.broker_user_id = auth.uid()
      and r.status in ('convidado', 'proposta_enviada')
      and w.window_starts_at <= now() and w.window_ends_at > now()
  )
$$;

-- Corretor pode ver PREÇOS e disponibilidade deste empreendimento?
create or replace function public.broker_can_see_prices(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_approved_broker() and (
    (exists (select 1 from public.development_commercial_settings s where s.development_id = p_development_id and s.sales_mode = 'aberto')
      and public.broker_can_access_development(p_development_id))
    or public.broker_has_open_window(p_development_id)
  )
$$;

create or replace function public.price_table_visible_to_broker(p_price_table_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.price_tables pt
    where pt.id = p_price_table_id and pt.status = 'vigente' and public.broker_can_see_prices(pt.development_id)
  )
$$;

create policy price_items_broker on public.price_table_items for select to authenticated
  using (public.price_table_visible_to_broker(price_table_id));
create policy units_select_prelaunch_window on public.units for select to authenticated
  using (public.broker_has_open_window(development_id));

-- ---------------------------------------------------------------------------
-- Propostas
-- payments = [{ "kind": "entrada|parcela|reforco|chaves|permuta", "amount": 1000.00, "quantity": 1,
--               "first_due": "AAAA-MM-DD", "interval_months": 1, "description": "..." }]
-- ---------------------------------------------------------------------------
create sequence public.proposal_queue_seq;

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid not null references public.broker_profiles (user_id),
  development_id uuid not null references public.developments (id),
  unit_id uuid not null references public.units (id),
  status public.proposal_status not null default 'rascunho',
  client_name text check (client_name is null or length(client_name) between 2 and 200),
  client_document_type public.document_type,
  client_document text,
  client_document_hash text,
  offered_price numeric(14,2) check (offered_price is null or offered_price > 0),
  payments jsonb not null default '[]'::jsonb check (jsonb_typeof(payments) = 'array'),
  observations text check (observations is null or length(observations) <= 4000),
  -- snapshot no envio (preservado mesmo após nova tabela/política)
  price_table_id uuid references public.price_tables (id),
  table_price numeric(14,2),
  sales_policy_id uuid references public.sales_policies (id),
  policy_rules jsonb,
  evaluation jsonb,
  within_policy boolean,
  analysis_reasons text[] not null default '{}',
  prelaunch_registration_id uuid references public.prelaunch_registrations (id),
  previous_proposal_id uuid references public.proposals (id),
  idempotency_key text not null,
  submitted_at timestamptz,
  queue_entered_at timestamptz,
  queue_seq bigint,
  queue_priority integer not null default 0,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broker_user_id, idempotency_key),
  check (client_document is null or (client_document_type = 'cpf' and public.is_valid_cpf(client_document))
         or (client_document_type = 'cnpj' and public.is_valid_cnpj(client_document))),
  check (status = 'rascunho' or (client_name is not null and client_document is not null and offered_price is not null))
);
create index proposals_unit_queue_idx on public.proposals (unit_id, queue_priority desc, queue_entered_at, queue_seq) where status = 'na_fila';
create index proposals_broker_idx on public.proposals (broker_user_id, created_at desc);
create index proposals_client_hash_idx on public.proposals (development_id, client_document_hash) where status in ('em_analise', 'na_fila', 'reservada');
create trigger proposals_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

create or replace function public.set_proposal_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_document is null then
    new.client_document_hash := null;
  else
    new.client_document := regexp_replace(upper(new.client_document), '[^0-9A-Z]', '', 'g');
    new.client_document_hash := public.document_hash(new.client_document);
  end if;
  return new;
end $$;
create trigger proposals_hash before insert or update of client_document, client_document_hash on public.proposals
  for each row execute function public.set_proposal_hash();

create table public.proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  from_status public.proposal_status,
  to_status public.proposal_status,
  note text,
  visible_to_broker boolean not null default true
);
create index proposal_events_idx on public.proposal_events (proposal_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Reservas (uma única ativa por unidade)
-- ---------------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals (id),
  unit_id uuid not null references public.units (id),
  development_id uuid not null references public.developments (id),
  broker_user_id uuid not null references public.broker_profiles (user_id),
  status public.reservation_status not null default 'aguardando_documentos',
  person_type public.person_type not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,                 -- prazo para documentação completa
  docs_submitted_at timestamptz,
  review_started_at timestamptz,
  validated_at timestamptz,
  regularization_deadline timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reservations_one_active_per_unit on public.reservations (unit_id)
  where status in ('aguardando_documentos', 'documentacao_enviada', 'aguardando_conferencia', 'documentacao_validada', 'pendencias_documentacao');
create index reservations_deadline_idx on public.reservations (expires_at) where status = 'aguardando_documentos';
create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger reservations_audit after insert or update on public.reservations
  for each row execute function public.audit_row_change();

create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  checklist_item_id uuid references public.document_checklist_items (id) on delete set null,
  label text not null,
  description text,
  required boolean not null,
  sort_order integer not null default 0,
  status public.reservation_item_status not null default 'pendente',
  rejection_reason text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz
);
create index reservation_items_idx on public.reservation_items (reservation_id, sort_order);

create table public.reservation_files (
  id uuid primary key default gen_random_uuid(),
  reservation_item_id uuid not null references public.reservation_items (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz,
  check (storage_path like reservation_id::text || '/%')
);

create table public.reservation_extensions (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  deadline_field text not null check (deadline_field in ('expires_at', 'regularization_deadline')),
  previous_deadline timestamptz,
  new_deadline timestamptz not null,
  reason text not null,
  extended_by uuid references public.profiles (id),
  extended_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notificações (in-app + e-mail) com deduplicação
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_email boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user_id, p_kind, p_title, p_body, p_link, p_dedupe || ':' || p_user_id)
  on conflict (dedupe_key) do nothing;
  if p_email then
    insert into public.notification_outbox (dedupe_key, template, recipient_user_id, payload)
    values ('email:' || p_dedupe || ':' || p_user_id, 'aviso_generico', p_user_id,
            jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link))
    on conflict (dedupe_key) do nothing;
  end if;
end $$;
revoke execute on function public.notify_user(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.notify_staff(p_perm public.staff_permission, p_kind text, p_title text, p_body text, p_link text, p_dedupe text)
returns void
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  for s in
    select m.user_id from public.staff_members m
    where m.active and (m.role = 'administrador' or exists (
      select 1 from public.staff_permissions sp where sp.user_id = m.user_id and sp.permission = p_perm))
  loop
    perform public.notify_user(s.user_id, p_kind, p_title, p_body, p_link, p_dedupe, false);
  end loop;
end $$;
revoke execute on function public.notify_staff(public.staff_permission, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avaliação de condições contra a política (fonte única da regra; usada no envio, na fila e na prévia)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_policy_rules(p_rules jsonb, p_unit_id uuid, p_typology text) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(p_rules -> 'padrao', '{}'::jsonb)
      || coalesce(p_rules -> 'por_tipologia' -> coalesce(p_typology, ''), '{}'::jsonb)
      || coalesce(p_rules -> 'por_unidade' -> p_unit_id::text, '{}'::jsonb)
$$;

-- Erro de estrutura das condições (null = ok).
create or replace function public.validate_payments(p_payments jsonb, p_offered numeric, p_ref_date date) returns text
language plpgsql immutable set search_path = '' as $$
declare
  p jsonb; v_total numeric := 0; v_q int; v_amount numeric; v_due date;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    return 'Informe as condições de pagamento.';
  end if;
  if jsonb_array_length(p_payments) > 60 then return 'Condições demais.'; end if;
  for p in select * from jsonb_array_elements(p_payments) loop
    if coalesce(p ->> 'kind', '') not in ('entrada', 'parcela', 'reforco', 'chaves', 'permuta') then return 'Tipo de pagamento inválido.'; end if;
    begin
      v_amount := (p ->> 'amount')::numeric;
      v_q := coalesce((p ->> 'quantity')::int, 1);
      v_due := (p ->> 'first_due')::date;
    exception when others then
      return 'Valores, quantidades ou datas inválidos.';
    end;
    if v_amount is null or v_amount <= 0 then return 'Valores devem ser positivos.'; end if;
    if v_q < 1 or v_q > 600 then return 'Quantidade inválida.'; end if;
    if v_due is null then return 'Informe a data de cada pagamento.'; end if;
    if v_due < p_ref_date then return 'Datas de pagamento não podem estar no passado.'; end if;
    if v_q > 1 and coalesce((p ->> 'interval_months')::int, 0) < 1 then return 'Informe a periodicidade (meses) das séries.'; end if;
    v_total := v_total + v_amount * v_q;
  end loop;
  if abs(v_total - coalesce(p_offered, 0)) > 0.01 then
    return format('A soma das condições (%s) difere do valor ofertado (%s).', to_char(v_total, 'FM999G999G999D00'), to_char(p_offered, 'FM999G999G999D00'));
  end if;
  return null;
end $$;

create or replace function public.evaluate_terms(
  p_rules jsonb, p_table_price numeric, p_offered numeric, p_payments jsonb,
  p_keys_date date, p_ref_date date, p_person_type public.person_type
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  r jsonb := coalesce(p_rules, '{}'::jsonb);
  c jsonb := '[]'::jsonb;
  v_total numeric; v_entrada numeric; v_ate_chaves numeric; v_permuta numeric;
  v_last date; v_parcelas int; v_reforcos int; v_struct text;
  v_lim numeric;
begin
  v_struct := public.validate_payments(p_payments, p_offered, p_ref_date);
  c := c || jsonb_build_array(jsonb_build_object('code', 'estrutura', 'label', 'Condições consistentes com o valor ofertado',
         'ok', v_struct is null, 'detail', v_struct));
  if v_struct is not null then
    return jsonb_build_object('within', false, 'criteria', c, 'requires_analysis', false);
  end if;

  with sched as (
    select p ->> 'kind' as kind,
           ((p ->> 'first_due')::date + make_interval(months => g * coalesce((p ->> 'interval_months')::int, 1)))::date as due,
           (p ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_payments) p, generate_series(0, coalesce((p ->> 'quantity')::int, 1) - 1) g
  )
  select sum(amount),
         coalesce(sum(amount) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount) filter (where kind not in ('chaves', 'permuta') and p_keys_date is not null and due < p_keys_date), 0),
         coalesce(sum(amount) filter (where kind = 'permuta'), 0),
         max(due)
    into v_total, v_entrada, v_ate_chaves, v_permuta, v_last
  from sched;
  select coalesce(sum(coalesce((p ->> 'quantity')::int, 1)) filter (where p ->> 'kind' = 'parcela'), 0),
         coalesce(sum(coalesce((p ->> 'quantity')::int, 1)) filter (where p ->> 'kind' = 'reforco'), 0)
    into v_parcelas, v_reforcos
  from jsonb_array_elements(p_payments) p;

  -- preço de tabela
  c := c || jsonb_build_array(jsonb_build_object('code', 'tabela', 'label', 'Unidade com preço na tabela vigente',
         'ok', case when p_table_price is null then null else true end,
         'detail', case when p_table_price is null then 'Sem preço vigente: exige análise da OUZ.' else null end));

  if r ? 'preco_minimo' then
    v_lim := (r ->> 'preco_minimo')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'preco_minimo', 'label', 'Preço mínimo',
           'ok', p_offered >= v_lim, 'limit', v_lim, 'value', p_offered));
  end if;
  if r ? 'desconto_maximo_percentual' then
    v_lim := (r ->> 'desconto_maximo_percentual')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'desconto_maximo', 'label', 'Desconto máximo sobre a tabela (%)',
           'ok', case when p_table_price is null then null else p_offered >= round(p_table_price * (1 - v_lim / 100), 2) end,
           'limit', v_lim,
           'value', case when p_table_price is null then null else round((1 - p_offered / p_table_price) * 100, 2) end));
  end if;
  if r ? 'entrada_minima_percentual' then
    v_lim := (r ->> 'entrada_minima_percentual')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'entrada_minima', 'label', 'Entrada mínima (%)',
           'ok', round(v_entrada / p_offered * 100, 2) >= v_lim, 'limit', v_lim, 'value', round(v_entrada / p_offered * 100, 2)));
  end if;
  if r ? 'percentual_minimo_ate_chaves' then
    v_lim := (r ->> 'percentual_minimo_ate_chaves')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'ate_chaves', 'label', 'Percentual pago até as chaves (%)',
           'ok', case when p_keys_date is null then null else round(v_ate_chaves / p_offered * 100, 2) >= v_lim end,
           'limit', v_lim,
           'value', case when p_keys_date is null then null else round(v_ate_chaves / p_offered * 100, 2) end,
           'detail', case when p_keys_date is null then 'Previsão de chaves não informada pela OUZ.' else null end));
  end if;
  if r ? 'prazo_maximo_meses' then
    v_lim := (r ->> 'prazo_maximo_meses')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'prazo_maximo', 'label', 'Prazo máximo (meses)',
           'ok', v_last <= (p_ref_date + make_interval(months => v_lim::int))::date, 'limit', v_lim,
           'value', (extract(year from age(v_last, p_ref_date)) * 12 + extract(month from age(v_last, p_ref_date)))::int));
  end if;
  if r ? 'parcelas_max_quantidade' then
    v_lim := (r ->> 'parcelas_max_quantidade')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'parcelas_max', 'label', 'Quantidade máxima de parcelas',
           'ok', v_parcelas <= v_lim, 'limit', v_lim, 'value', v_parcelas));
  end if;
  if r ? 'reforcos_max_quantidade' then
    v_lim := (r ->> 'reforcos_max_quantidade')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'reforcos_max', 'label', 'Quantidade máxima de reforços',
           'ok', v_reforcos <= v_lim, 'limit', v_lim, 'value', v_reforcos));
  end if;
  if v_permuta > 0 then
    c := c || jsonb_build_array(jsonb_build_object('code', 'permuta', 'label', 'Permuta permitida',
           'ok', coalesce((r ->> 'permuta_permitida')::boolean, false)));
    if r ? 'permuta_max_percentual' then
      v_lim := (r ->> 'permuta_max_percentual')::numeric;
      c := c || jsonb_build_array(jsonb_build_object('code', 'permuta_max', 'label', 'Permuta máxima (%)',
             'ok', round(v_permuta / p_offered * 100, 2) <= v_lim, 'limit', v_lim, 'value', round(v_permuta / p_offered * 100, 2)));
    end if;
  end if;
  if coalesce((r ->> 'sempre_exigir_analise')::boolean, false)
     or (v_permuta > 0 and coalesce((r ->> 'exigir_analise_com_permuta')::boolean, false))
     or (p_person_type = 'pj' and coalesce((r ->> 'exigir_analise_pessoa_juridica')::boolean, false)) then
    c := c || jsonb_build_array(jsonb_build_object('code', 'analise_obrigatoria', 'label', 'Condição que exige análise da OUZ', 'ok', false));
  end if;

  return jsonb_build_object(
    'within', not exists (select 1 from jsonb_array_elements(c) x where (x ->> 'ok') is distinct from 'true'),
    'criteria', c,
    'totals', jsonb_build_object('total', v_total, 'entrada', v_entrada, 'ate_chaves', v_ate_chaves, 'permuta', v_permuta,
                                 'ultimo_vencimento', v_last, 'parcelas', v_parcelas, 'reforcos', v_reforcos)
  );
end $$;

-- Contexto vigente para uma unidade: tabela, preço, política resolvida, previsão de chaves.
create or replace function public.unit_commercial_context(p_unit_id uuid)
returns table (development_id uuid, price_table_id uuid, table_price numeric, sales_policy_id uuid, rules jsonb, keys_date date, typology text, unit_status public.unit_status)
language sql stable security definer set search_path = '' as $$
  select u.development_id, pt.id, pti.price, sp.id,
         public.resolve_policy_rules(sp.rules, u.id, u.typology), s.keys_expected_date, u.typology, u.status
  from public.units u
  left join public.development_commercial_settings s on s.development_id = u.development_id
  left join public.price_tables pt on pt.development_id = u.development_id and pt.status = 'vigente'
  left join public.price_table_items pti on pti.price_table_id = pt.id and pti.unit_id = u.id
  left join public.sales_policies sp on sp.development_id = u.development_id and sp.status = 'vigente'
  where u.id = p_unit_id
$$;
revoke execute on function public.unit_commercial_context(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internos: eventos, reserva, colocação na fila, promoção
-- ---------------------------------------------------------------------------
create or replace function public._proposal_event(p_id uuid, p_from public.proposal_status, p_to public.proposal_status, p_note text, p_visible boolean default true)
returns void language sql security definer set search_path = '' as $$
  insert into public.proposal_events (proposal_id, actor_user_id, from_status, to_status, note, visible_to_broker)
  values (p_id, auth.uid(), p_from, p_to, p_note, p_visible)
$$;
revoke execute on function public._proposal_event(uuid, public.proposal_status, public.proposal_status, text, boolean) from public, anon, authenticated;

create or replace function public._create_reservation(p_proposal_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  v_hours int;
  v_type public.person_type;
  v_res uuid;
  v_unit_code text;
begin
  select * into p from public.proposals where id = p_proposal_id for update;
  select reservation_hours into v_hours from public.development_commercial_settings where development_id = p.development_id;
  v_type := case when p.client_document_type = 'cnpj' then 'pj' else 'pf' end;

  insert into public.reservations (proposal_id, unit_id, development_id, broker_user_id, person_type, starts_at, expires_at)
  values (p.id, p.unit_id, p.development_id, p.broker_user_id, v_type, now(), now() + make_interval(hours => coalesce(v_hours, 48)))
  returning id into v_res;

  -- Checklist: itens do empreendimento, se houver; senão, os globais.
  insert into public.reservation_items (reservation_id, checklist_item_id, label, description, required, sort_order)
  select v_res, ci.id, ci.label, ci.description, ci.required, ci.sort_order
  from public.document_checklist_items ci
  where ci.active and ci.person_type = v_type
    and (ci.development_id = p.development_id
         or (ci.development_id is null and not exists (
               select 1 from public.document_checklist_items x where x.active and x.person_type = v_type and x.development_id = p.development_id)));

  update public.units set status = 'reservada' where id = p.unit_id returning code into v_unit_code;
  update public.proposals set status = 'reservada', queue_entered_at = null, queue_seq = null where id = p.id;
  perform public._proposal_event(p.id, p.status, 'reservada', 'Reserva temporária criada; prazo para documentação iniciado.');

  perform public.notify_user(p.broker_user_id, 'reserva_criada', 'Reserva criada — envie a documentação',
    format('Unidade %s reservada. Envie a documentação até o prazo indicado no portal.', v_unit_code),
    '/corretor/propostas/' || p.id, 'reserva:' || v_res || ':criada');
  perform public.notify_staff('comercial', 'reserva_criada', 'Nova reserva temporária',
    format('Unidade %s reservada aguardando documentação.', v_unit_code), '/admin/reservas/' || v_res, 'reserva:' || v_res || ':criada');
  return v_res;
end $$;
revoke execute on function public._create_reservation(uuid) from public, anon, authenticated;

-- Proposta apta (automática ou aprovada pela OUZ): reserva se a unidade estiver livre e sem fila; senão, entra na fila.
-- Pré-condição: o chamador já travou a unidade (FOR UPDATE).
create or replace function public._place_eligible(p_proposal_id uuid) returns public.proposal_status
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  select * into p from public.proposals where id = p_proposal_id for update;
  if exists (select 1 from public.reservations r where r.unit_id = p.unit_id
               and r.status in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao'))
     or exists (select 1 from public.proposals q where q.unit_id = p.unit_id and q.status = 'na_fila' and q.id <> p.id) then
    update public.proposals
       set status = 'na_fila', queue_entered_at = coalesce(queue_entered_at, now()), queue_seq = coalesce(queue_seq, nextval('public.proposal_queue_seq'))
     where id = p.id;
    perform public._proposal_event(p.id, p.status, 'na_fila', 'Unidade com reserva ativa ou fila: proposta entrou na fila.');
    -- se não há reserva ativa (fila órfã), promove imediatamente
    if not exists (select 1 from public.reservations r where r.unit_id = p.unit_id
                     and r.status in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao')) then
      perform public.promote_next_in_queue(p.unit_id);
    end if;
    return (select status from public.proposals where id = p.id);
  end if;
  perform public._create_reservation(p.id);
  return 'reservada';
end $$;
revoke execute on function public._place_eligible(uuid) from public, anon, authenticated;

-- Promove a próxima proposta elegível da fila, reavaliando-a antes. Executa só no servidor.
create or replace function public.promote_next_in_queue(p_unit_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  q public.proposals;
  ctx record;
  v_eval jsonb;
  v_ok boolean;
  v_reason text;
begin
  perform 1 from public.units where id = p_unit_id for update;
  if exists (select 1 from public.reservations r where r.unit_id = p_unit_id
               and r.status in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao')) then
    return null;
  end if;

  for q in
    select * from public.proposals where unit_id = p_unit_id and status = 'na_fila'
    order by queue_priority desc, queue_entered_at, queue_seq
    for update
  loop
    select * into ctx from public.unit_commercial_context(p_unit_id);
    v_ok := true; v_reason := null;
    if ctx.unit_status in ('vendida', 'bloqueada', 'indisponivel') then
      v_ok := false; v_reason := 'Unidade indisponível';
    elsif not exists (select 1 from public.broker_profiles b where b.user_id = q.broker_user_id and b.status = 'aprovado') then
      v_ok := false; v_reason := 'Corretor sem cadastro ativo';
    elsif q.decided_by is not null then
      -- aprovada manualmente pela OUZ: vale se a tabela não mudou desde a aprovação
      if ctx.price_table_id is distinct from q.price_table_id then
        v_ok := false; v_reason := 'Tabela de preços mudou desde a aprovação';
      end if;
    else
      v_eval := public.evaluate_terms(ctx.rules, ctx.table_price, q.offered_price, q.payments, ctx.keys_date, current_date,
                                      case when q.client_document_type = 'cnpj' then 'pj'::public.person_type else 'pf'::public.person_type end);
      if not (v_eval ->> 'within')::boolean then
        v_ok := false; v_reason := 'Reavaliação na fila: condições fora da política vigente';
      end if;
    end if;

    if v_ok then
      perform public._create_reservation(q.id);
      return q.id;
    end if;

    update public.proposals
       set status = 'em_analise', queue_entered_at = null, queue_seq = null,
           analysis_reasons = array_append(analysis_reasons, 'reavaliacao_fila'),
           evaluation = coalesce(v_eval, evaluation)
     where id = q.id;
    perform public._proposal_event(q.id, 'na_fila', 'em_analise', v_reason);
    perform public.notify_user(q.broker_user_id, 'proposta_reavaliada', 'Proposta encaminhada para análise',
      v_reason || '. A OUZ analisará a proposta.', '/corretor/propostas/' || q.id, 'proposta:' || q.id || ':reavaliada:' || now()::date);
    perform public.notify_staff('comercial', 'proposta_em_analise', 'Proposta da fila precisa de análise', v_reason,
      '/admin/propostas/' || q.id, 'proposta:' || q.id || ':reavaliada:' || now()::date);
  end loop;

  update public.units set status = 'disponivel' where id = p_unit_id and status = 'reservada';
  return null;
end $$;
revoke execute on function public.promote_next_in_queue(uuid) from public, anon, authenticated;

-- Encerra uma reserva ativa e libera a fila.
create or replace function public._end_reservation(p_reservation_id uuid, p_status public.reservation_status, p_reason text,
                                                   p_proposal_status public.proposal_status)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; v_prev public.proposal_status;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  update public.reservations set status = p_status, ended_at = now(), end_reason = p_reason where id = r.id;
  select status into v_prev from public.proposals where id = r.proposal_id;
  update public.proposals set status = p_proposal_status where id = r.proposal_id;
  perform public._proposal_event(r.proposal_id, v_prev, p_proposal_status, p_reason);
  if p_status = 'convertida' then
    update public.units set status = 'vendida' where id = r.unit_id;
  else
    update public.units set status = 'disponivel' where id = r.unit_id and status = 'reservada';
    perform public.promote_next_in_queue(r.unit_id);
  end if;
end $$;
revoke execute on function public._end_reservation(uuid, public.reservation_status, text, public.proposal_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções do corretor
-- ---------------------------------------------------------------------------
create or replace function public.broker_save_proposal_draft(
  p_id uuid, p_unit_id uuid, p_client_name text, p_client_document text, p_offered_price numeric,
  p_payments jsonb, p_observations text, p_prelaunch_registration_id uuid, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_dev uuid; v_doc text; v_type public.document_type;
begin
  if not public.is_approved_broker() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select development_id into v_dev from public.units where id = p_unit_id;
  if v_dev is null or not public.broker_can_see_prices(v_dev) then
    raise exception 'unidade indisponível para propostas' using errcode = '22023';
  end if;
  v_doc := nullif(regexp_replace(upper(coalesce(p_client_document, '')), '[^0-9A-Z]', '', 'g'), '');
  if v_doc is not null then
    if public.is_valid_cpf(v_doc) then v_type := 'cpf';
    elsif public.is_valid_cnpj(v_doc) then v_type := 'cnpj';
    else v_doc := null; -- documento inválido: guardado como ausente; a proposta continua rascunho
    end if;
  end if;
  if p_prelaunch_registration_id is not null and not exists (
       select 1 from public.prelaunch_registrations where id = p_prelaunch_registration_id and broker_user_id = auth.uid()) then
    raise exception 'registro de pré-lançamento inválido' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.proposals (broker_user_id, development_id, unit_id, client_name, client_document_type, client_document,
                                  offered_price, payments, observations, prelaunch_registration_id, idempotency_key)
    values (auth.uid(), v_dev, p_unit_id, nullif(trim(p_client_name), ''), v_type, v_doc, p_offered_price,
            coalesce(p_payments, '[]'::jsonb), nullif(trim(p_observations), ''), p_prelaunch_registration_id, p_idempotency_key)
    on conflict (broker_user_id, idempotency_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.proposals where broker_user_id = auth.uid() and idempotency_key = p_idempotency_key;
    else
      perform public._proposal_event(v_id, null, 'rascunho', 'Rascunho criado');
    end if;
    return v_id;
  end if;

  update public.proposals
     set unit_id = p_unit_id, development_id = v_dev, client_name = nullif(trim(p_client_name), ''), client_document_type = v_type,
         client_document = v_doc, offered_price = p_offered_price, payments = coalesce(p_payments, '[]'::jsonb),
         observations = nullif(trim(p_observations), ''), prelaunch_registration_id = p_prelaunch_registration_id
   where id = p_id and broker_user_id = auth.uid() and status = 'rascunho'
  returning id into v_id;
  if v_id is null then raise exception 'somente rascunhos podem ser editados' using errcode = '22023'; end if;
  return v_id;
end $$;

-- Prévia da avaliação (não grava nada).
create or replace function public.broker_preview_evaluation(p_unit_id uuid, p_offered_price numeric, p_payments jsonb, p_client_document text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ctx record; v_doc text;
begin
  select * into ctx from public.unit_commercial_context(p_unit_id);
  if ctx.development_id is null or not (public.broker_can_see_prices(ctx.development_id) or public.has_staff_permission('comercial')) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  v_doc := regexp_replace(upper(coalesce(p_client_document, '')), '[^0-9A-Z]', '', 'g');
  return public.evaluate_terms(ctx.rules, ctx.table_price, p_offered_price, p_payments, ctx.keys_date, current_date,
                               case when public.is_valid_cnpj(v_doc) then 'pj'::public.person_type else 'pf'::public.person_type end)
         || jsonb_build_object('table_price', ctx.table_price, 'keys_date', ctx.keys_date);
end $$;

create or replace function public.broker_submit_proposal(p_proposal_id uuid, p_request_analysis boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  ctx record;
  s public.development_commercial_settings;
  v_eval jsonb;
  v_reasons text[] := '{}';
  v_status public.proposal_status;
  v_err text;
  v_reg public.prelaunch_registrations;
begin
  if not public.is_approved_broker() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into p from public.proposals where id = p_proposal_id and broker_user_id = auth.uid() for update;
  if p.id is null then raise exception 'proposta não encontrada' using errcode = '22023'; end if;
  if p.status <> 'rascunho' then
    return jsonb_build_object('status', p.status, 'idempotent', true);   -- reenvio não duplica nada
  end if;
  if p.client_name is null or p.client_document is null then
    raise exception 'sem nome e CPF/CNPJ válidos a proposta permanece como rascunho' using errcode = '22023';
  end if;

  -- Trava a unidade: serializa propostas concorrentes da mesma unidade.
  perform 1 from public.units where id = p.unit_id for update;
  select * into ctx from public.unit_commercial_context(p.unit_id);
  select * into s from public.development_commercial_settings where development_id = p.development_id;

  if ctx.unit_status in ('vendida', 'bloqueada', 'indisponivel') then
    raise exception 'unidade indisponível para propostas' using errcode = '22023';
  end if;
  if s.sales_mode = 'fechado' then
    raise exception 'o empreendimento não está recebendo propostas' using errcode = '22023';
  elsif s.sales_mode = 'pre_lancamento' then
    select * into v_reg from public.prelaunch_registrations where id = p.prelaunch_registration_id and broker_user_id = auth.uid();
    if v_reg.id is null or not public.broker_has_open_window(p.development_id) or v_reg.status not in ('convidado', 'proposta_enviada') then
      raise exception 'pré-lançamento: é necessário um registro com janela de proposta aberta' using errcode = '22023';
    end if;
    if v_reg.client_document_hash <> p.client_document_hash then
      raise exception 'pré-lançamento: o cliente da proposta deve ser o mesmo do registro de interesse' using errcode = '22023';
    end if;
  elsif not public.broker_can_access_development(p.development_id) then
    raise exception 'acesso negado ao empreendimento' using errcode = '42501';
  end if;

  v_err := public.validate_payments(p.payments, p.offered_price, current_date);
  if v_err is not null then raise exception '%', v_err using errcode = '22023'; end if;

  if exists (select 1 from public.proposals x where x.broker_user_id = p.broker_user_id and x.unit_id = p.unit_id
               and x.client_document_hash = p.client_document_hash and x.id <> p.id and x.status in ('em_analise', 'na_fila', 'reservada')) then
    raise exception 'já existe proposta ativa sua para este cliente nesta unidade' using errcode = '22023';
  end if;

  v_eval := public.evaluate_terms(ctx.rules, ctx.table_price, p.offered_price, p.payments, ctx.keys_date, current_date,
                                  case when p.client_document_type = 'cnpj' then 'pj'::public.person_type else 'pf'::public.person_type end);

  -- Mesmo cliente com proposta ativa de OUTRO corretor no empreendimento → análise (sem revelar o outro corretor).
  if exists (select 1 from public.proposals x where x.development_id = p.development_id and x.client_document_hash = p.client_document_hash
               and x.broker_user_id <> p.broker_user_id and x.status in ('em_analise', 'na_fila', 'reservada')) then
    v_reasons := array_append(v_reasons, 'duplicidade_cliente');
  end if;
  if not (v_eval ->> 'within')::boolean then
    if not p_request_analysis then
      -- Fora da política e sem pedido de análise: nada muda; o corretor vê os critérios não atendidos.
      return jsonb_build_object('status', 'rascunho', 'within', false, 'evaluation', v_eval);
    end if;
    v_reasons := array_append(v_reasons, 'fora_da_politica');
  end if;

  update public.proposals
     set price_table_id = ctx.price_table_id, table_price = ctx.table_price, sales_policy_id = ctx.sales_policy_id,
         policy_rules = ctx.rules, evaluation = v_eval, within_policy = (v_eval ->> 'within')::boolean,
         analysis_reasons = v_reasons, submitted_at = now()
   where id = p.id;

  if v_reg.id is not null then
    update public.prelaunch_registrations set status = 'proposta_enviada' where id = v_reg.id and status = 'convidado';
  end if;

  if array_length(v_reasons, 1) > 0 then
    update public.proposals set status = 'em_analise' where id = p.id;
    perform public._proposal_event(p.id, 'rascunho', 'em_analise',
      case when 'duplicidade_cliente' = any (v_reasons) then 'Enviada para análise da OUZ (verificação de cadastro).' else 'Enviada para análise da OUZ (fora da política).' end);
    perform public.notify_staff('comercial', 'proposta_em_analise', 'Proposta aguardando análise',
      array_to_string(v_reasons, ', '), '/admin/propostas/' || p.id, 'proposta:' || p.id || ':analise');
    v_status := 'em_analise';
  else
    perform public._proposal_event(p.id, 'rascunho', null, 'Enviada dentro da política: apta à aprovação automática.');
    v_status := public._place_eligible(p.id);
  end if;

  perform public.write_audit('proposta_enviada', 'proposals', p.id::text,
    jsonb_build_object('status', v_status, 'within', (v_eval ->> 'within')::boolean, 'reasons', v_reasons,
                       'price_table_id', ctx.price_table_id, 'sales_policy_id', ctx.sales_policy_id), null, p.development_id);
  return jsonb_build_object('status', v_status, 'within', (v_eval ->> 'within')::boolean, 'evaluation', v_eval,
                            'reservation_id', (select id from public.reservations where proposal_id = p.id));
end $$;

create or replace function public.broker_update_observations(p_proposal_id uuid, p_observations text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.proposals set observations = nullif(trim(p_observations), '')
   where id = p_proposal_id and broker_user_id = auth.uid() and status in ('rascunho', 'em_analise', 'na_fila', 'reservada');
  if not found then raise exception 'proposta não encontrada' using errcode = '22023'; end if;
end $$;

-- Alteração relevante após envio: a proposta atual é substituída e sai da fila; nasce um novo rascunho.
create or replace function public.broker_revise_proposal(p_proposal_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.proposals; v_new uuid;
begin
  select * into p from public.proposals where id = p_proposal_id and broker_user_id = auth.uid() for update;
  if p.id is null or p.status not in ('em_analise', 'na_fila') then
    raise exception 'só é possível alterar propostas em análise ou na fila (reservas: desista e envie nova proposta)' using errcode = '22023';
  end if;
  update public.proposals set status = 'substituida', queue_entered_at = null, queue_seq = null where id = p.id;
  perform public._proposal_event(p.id, p.status, 'substituida', 'Substituída por nova versão (perde a posição na fila).');
  insert into public.proposals (broker_user_id, development_id, unit_id, client_name, client_document_type, client_document,
                                offered_price, payments, observations, prelaunch_registration_id, previous_proposal_id, idempotency_key)
  values (p.broker_user_id, p.development_id, p.unit_id, p.client_name, p.client_document_type, p.client_document,
          p.offered_price, p.payments, p.observations, p.prelaunch_registration_id, p.id, 'revisao:' || p.id)
  returning id into v_new;
  perform public._proposal_event(v_new, null, 'rascunho', 'Nova versão criada a partir de proposta anterior.');
  return v_new;
end $$;

create or replace function public.broker_withdraw_proposal(p_proposal_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.proposals; v_res uuid;
begin
  select * into p from public.proposals where id = p_proposal_id and broker_user_id = auth.uid() for update;
  if p.id is null or p.status not in ('rascunho', 'em_analise', 'na_fila', 'reservada') then
    raise exception 'proposta não pode ser retirada neste status' using errcode = '22023';
  end if;
  if p.status = 'reservada' then
    perform 1 from public.units where id = p.unit_id for update;
    select id into v_res from public.reservations where proposal_id = p.id
      and status in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao');
    perform public._end_reservation(v_res, 'cancelada', 'Desistência do corretor: ' || coalesce(p_reason, ''), 'retirada');
    perform public.notify_staff('comercial', 'reserva_desistencia', 'Desistência de reserva', coalesce(p_reason, ''),
      '/admin/reservas/' || v_res, 'reserva:' || v_res || ':desistencia');
  else
    update public.proposals set status = 'retirada', queue_entered_at = null, queue_seq = null where id = p.id;
    perform public._proposal_event(p.id, p.status, 'retirada', coalesce(p_reason, 'Retirada pelo corretor'));
  end if;
end $$;

-- Posição na fila, somente se a OUZ habilitou a exibição no empreendimento.
create or replace function public.broker_queue_position(p_proposal_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when s.show_queue_position then (
           select count(*)::int + 1 from public.proposals q
           where q.unit_id = p.unit_id and q.status = 'na_fila'
             and (q.queue_priority, -extract(epoch from q.queue_entered_at), -q.queue_seq)
               > (p.queue_priority, -extract(epoch from p.queue_entered_at), -p.queue_seq))
         end
  from public.proposals p
  join public.development_commercial_settings s on s.development_id = p.development_id
  where p.id = p_proposal_id and p.broker_user_id = auth.uid() and p.status = 'na_fila'
$$;

-- Documentos da reserva
create or replace function public._reservation_open_for_upload(r public.reservations) returns boolean
language sql stable set search_path = '' as $$
  select (r.status = 'aguardando_documentos' and now() < r.expires_at)
      or (r.status = 'pendencias_documentacao' and (r.regularization_deadline is null or now() < r.regularization_deadline))
$$;

create or replace function public.broker_add_reservation_file(p_item_id uuid, p_storage_path text, p_mime text, p_size integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; v_item public.reservation_items; v_id uuid;
begin
  select * into v_item from public.reservation_items where id = p_item_id;
  select * into r from public.reservations where id = v_item.reservation_id for update;
  if r.id is null or r.broker_user_id <> auth.uid() then raise exception 'acesso negado' using errcode = '42501'; end if;
  if not public._reservation_open_for_upload(r) then raise exception 'prazo encerrado ou reserva fora da fase de envio' using errcode = '22023'; end if;
  if p_storage_path not like r.id::text || '/%' then raise exception 'caminho de arquivo inválido' using errcode = '22023'; end if;
  insert into public.reservation_files (reservation_item_id, reservation_id, storage_path, mime_type, size_bytes, uploaded_by)
  values (v_item.id, r.id, p_storage_path, p_mime, p_size, auth.uid()) returning id into v_id;
  update public.reservation_items set status = 'enviado', rejection_reason = case when status = 'recusado' then rejection_reason end
   where id = v_item.id and status in ('pendente', 'recusado');
  return v_id;
end $$;

create or replace function public.broker_remove_reservation_file(p_file_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.reservation_files; r public.reservations;
begin
  select * into f from public.reservation_files where id = p_file_id and removed_at is null;
  select * into r from public.reservations where id = f.reservation_id for update;
  if r.id is null or r.broker_user_id <> auth.uid() then raise exception 'acesso negado' using errcode = '42501'; end if;
  if not public._reservation_open_for_upload(r) then raise exception 'prazo encerrado' using errcode = '22023'; end if;
  update public.reservation_files set removed_at = now() where id = f.id;
  update public.reservation_items i set status = 'pendente'
   where i.id = f.reservation_item_id and i.status = 'enviado'
     and not exists (select 1 from public.reservation_files x where x.reservation_item_id = i.id and x.removed_at is null);
end $$;

-- Envio da documentação completa: dentro do prazo, a reserva não expira mais por demora da OUZ.
create or replace function public.broker_submit_reservation_documents(p_reservation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; v_code text;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if r.id is null or r.broker_user_id <> auth.uid() then raise exception 'acesso negado' using errcode = '42501'; end if;
  if not public._reservation_open_for_upload(r) then raise exception 'prazo encerrado ou reserva fora da fase de envio' using errcode = '22023'; end if;
  if exists (select 1 from public.reservation_items where reservation_id = r.id and required and status not in ('enviado', 'aprovado')) then
    raise exception 'há documentos obrigatórios pendentes' using errcode = '22023';
  end if;
  update public.reservations set status = 'documentacao_enviada', docs_submitted_at = now(), regularization_deadline = null where id = r.id;
  select code into v_code from public.units where id = r.unit_id;
  perform public._proposal_event(r.proposal_id, 'reservada', 'reservada', 'Documentação completa enviada dentro do prazo.');
  perform public.notify_staff('documentos', 'reserva_documentos', 'Documentação de reserva para conferência',
    format('Unidade %s: documentação completa enviada.', v_code), '/admin/reservas/' || r.id,
    'reserva:' || r.id || ':docs:' || extract(epoch from now())::bigint);
end $$;

-- ---------------------------------------------------------------------------
-- Funções da OUZ
-- ---------------------------------------------------------------------------
create or replace function public.admin_decide_proposal(p_proposal_id uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.proposals; ctx record; v_status public.proposal_status;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into p from public.proposals where id = p_proposal_id;
  if p.id is null or p.status <> 'em_analise' then raise exception 'somente propostas em análise podem ser decididas' using errcode = '22023'; end if;
  perform 1 from public.units where id = p.unit_id for update;
  select * into p from public.proposals where id = p_proposal_id for update;
  if p.status <> 'em_analise' then raise exception 'a proposta mudou de status; recarregue' using errcode = '22023'; end if;

  if not p_approve then
    if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
    update public.proposals set status = 'reprovada', decided_at = now(), decided_by = auth.uid(), decision_reason = p_reason where id = p.id;
    perform public._proposal_event(p.id, 'em_analise', 'reprovada', p_reason);
    perform public.notify_user(p.broker_user_id, 'proposta_reprovada', 'Proposta não aprovada', p_reason,
      '/corretor/propostas/' || p.id, 'proposta:' || p.id || ':reprovada');
    perform public.write_audit('proposta_reprovada', 'proposals', p.id::text, '{}'::jsonb, p_reason, p.development_id);
    return jsonb_build_object('status', 'reprovada');
  end if;

  select * into ctx from public.unit_commercial_context(p.unit_id);
  if ctx.unit_status in ('vendida', 'bloqueada', 'indisponivel') then raise exception 'unidade indisponível' using errcode = '22023'; end if;
  update public.proposals
     set decided_at = now(), decided_by = auth.uid(), decision_reason = p_reason,
         price_table_id = coalesce(ctx.price_table_id, price_table_id), table_price = coalesce(ctx.table_price, table_price)
   where id = p.id;
  perform public._proposal_event(p.id, 'em_analise', null, 'Aprovada comercialmente pela OUZ' || coalesce(': ' || p_reason, '') || '. Aprovação comercial não é contrato.');
  v_status := public._place_eligible(p.id);
  perform public.notify_user(p.broker_user_id, 'proposta_aprovada', 'Proposta aprovada comercialmente',
    case when v_status = 'reservada' then 'Reserva criada: envie a documentação no prazo.' else 'A proposta entrou na fila da unidade.' end,
    '/corretor/propostas/' || p.id, 'proposta:' || p.id || ':aprovada');
  perform public.write_audit('proposta_aprovada', 'proposals', p.id::text, jsonb_build_object('status', v_status), p_reason, p.development_id);
  return jsonb_build_object('status', v_status);
end $$;

create or replace function public.admin_set_queue_priority(p_proposal_id uuid, p_priority integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'justificativa obrigatória' using errcode = '22023'; end if;
  select * into p from public.proposals where id = p_proposal_id for update;
  if p.status <> 'na_fila' then raise exception 'proposta não está na fila' using errcode = '22023'; end if;
  update public.proposals set queue_priority = p_priority where id = p.id;
  perform public._proposal_event(p.id, 'na_fila', 'na_fila', 'Prioridade na fila alterada pela OUZ.', false);
  perform public.write_audit('fila_prioridade_alterada', 'proposals', p.id::text,
    jsonb_build_object('de', p.queue_priority, 'para', p_priority), p_reason, p.development_id);
end $$;

create or replace function public.admin_start_document_review(p_reservation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_staff_permission('documentos') or public.has_staff_permission('comercial')) then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.reservations set status = 'aguardando_conferencia', review_started_at = now()
   where id = p_reservation_id and status = 'documentacao_enviada';
  if not found then raise exception 'reserva não está aguardando início da conferência' using errcode = '22023'; end if;
end $$;

create or replace function public.admin_review_reservation_item(p_item_id uuid, p_approve boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_res public.reservations;
begin
  if not (public.has_staff_permission('documentos') or public.has_staff_permission('comercial')) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select r.* into v_res from public.reservations r join public.reservation_items i on i.reservation_id = r.id where i.id = p_item_id for update of r;
  if v_res.status = 'documentacao_enviada' then
    update public.reservations set status = 'aguardando_conferencia', review_started_at = now() where id = v_res.id;
  elsif v_res.status <> 'aguardando_conferencia' then
    raise exception 'reserva não está em conferência' using errcode = '22023';
  end if;
  if not p_approve and coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'informe o motivo da recusa' using errcode = '22023'; end if;
  update public.reservation_items
     set status = case when p_approve then 'aprovado'::public.reservation_item_status else 'recusado'::public.reservation_item_status end,
         rejection_reason = case when p_approve then null else p_reason end, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_item_id;
end $$;

create or replace function public.admin_conclude_document_review(p_reservation_id uuid) returns public.reservation_status
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; v_hours int; v_new public.reservation_status;
begin
  if not (public.has_staff_permission('documentos') or public.has_staff_permission('comercial')) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.reservations where id = p_reservation_id for update;
  if r.status <> 'aguardando_conferencia' then raise exception 'reserva não está em conferência' using errcode = '22023'; end if;
  if exists (select 1 from public.reservation_items where reservation_id = r.id and required and status in ('pendente', 'enviado')) then
    raise exception 'revise todos os documentos obrigatórios antes de concluir' using errcode = '22023';
  end if;
  if exists (select 1 from public.reservation_items where reservation_id = r.id and status = 'recusado') then
    select regularization_hours into v_hours from public.development_commercial_settings where development_id = r.development_id;
    update public.reservations set status = 'pendencias_documentacao', regularization_deadline = now() + make_interval(hours => coalesce(v_hours, 24)) where id = r.id;
    v_new := 'pendencias_documentacao';
    perform public.notify_user(r.broker_user_id, 'reserva_pendencias', 'Pendências na documentação da reserva',
      'Há documentos recusados. Regularize dentro do prazo indicado no portal.', '/corretor/propostas/' || r.proposal_id,
      'reserva:' || r.id || ':pendencias:' || extract(epoch from now())::bigint);
  else
    update public.reservations set status = 'documentacao_validada', validated_at = now() where id = r.id;
    v_new := 'documentacao_validada';
    perform public.notify_user(r.broker_user_id, 'reserva_validada', 'Documentação validada',
      'A documentação da reserva foi validada pela OUZ. Próximos passos serão informados pela equipe.', '/corretor/propostas/' || r.proposal_id,
      'reserva:' || r.id || ':validada');
  end if;
  perform public._proposal_event(r.proposal_id, 'reservada', 'reservada',
    case when v_new = 'documentacao_validada' then 'Documentação validada pela OUZ.' else 'Conferência concluída com pendências.' end);
  perform public.write_audit('reserva_conferencia_concluida', 'reservations', r.id::text, jsonb_build_object('status', v_new), null, r.development_id);
  return v_new;
end $$;

create or replace function public.admin_extend_reservation(p_reservation_id uuid, p_hours integer, p_reason text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; v_field text; v_prev timestamptz; v_new timestamptz;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 240 then raise exception 'extensão entre 1 e 240 horas' using errcode = '22023'; end if;
  select * into r from public.reservations where id = p_reservation_id for update;
  if r.status = 'aguardando_documentos' then
    v_field := 'expires_at'; v_prev := r.expires_at;
    v_new := greatest(r.expires_at, now()) + make_interval(hours => p_hours);
    update public.reservations set expires_at = v_new where id = r.id;
  elsif r.status = 'pendencias_documentacao' then
    v_field := 'regularization_deadline'; v_prev := r.regularization_deadline;
    v_new := greatest(coalesce(r.regularization_deadline, now()), now()) + make_interval(hours => p_hours);
    update public.reservations set regularization_deadline = v_new where id = r.id;
  else
    raise exception 'somente reservas com prazo em curso podem ser estendidas' using errcode = '22023';
  end if;
  insert into public.reservation_extensions (reservation_id, deadline_field, previous_deadline, new_deadline, reason, extended_by)
  values (r.id, v_field, v_prev, v_new, p_reason, auth.uid());
  perform public.write_audit('reserva_prazo_estendido', 'reservations', r.id::text,
    jsonb_build_object('campo', v_field, 'de', v_prev, 'para', v_new), p_reason, r.development_id);
  perform public.notify_user(r.broker_user_id, 'reserva_prorrogada', 'Prazo da reserva prorrogado', p_reason,
    '/corretor/propostas/' || r.proposal_id, 'reserva:' || r.id || ':prorrogada:' || extract(epoch from v_new)::bigint);
  return v_new;
end $$;

create or replace function public.admin_cancel_reservation(p_reservation_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservations;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
  select * into r from public.reservations where id = p_reservation_id;
  if r.status not in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao') then
    raise exception 'reserva não está ativa' using errcode = '22023';
  end if;
  perform 1 from public.units where id = r.unit_id for update;
  perform public._end_reservation(r.id, 'cancelada', p_reason, 'reprovada');
  perform public.notify_user(r.broker_user_id, 'reserva_cancelada', 'Reserva cancelada pela OUZ', p_reason,
    '/corretor/propostas/' || r.proposal_id, 'reserva:' || r.id || ':cancelada');
  perform public.write_audit('reserva_cancelada', 'reservations', r.id::text, '{}'::jsonb, p_reason, r.development_id);
end $$;

-- Venda concluída fora do sistema (contrato assinado por outro meio). Encerra a fila da unidade.
create or replace function public.admin_convert_reservation(p_reservation_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservations; q record;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.reservations where id = p_reservation_id;
  if r.status <> 'documentacao_validada' then raise exception 'somente reservas com documentação validada' using errcode = '22023'; end if;
  perform 1 from public.units where id = r.unit_id for update;
  perform public._end_reservation(r.id, 'convertida', coalesce(p_reason, 'Venda concluída'), 'concluida');
  for q in select id, broker_user_id from public.proposals where unit_id = r.unit_id and status in ('na_fila', 'em_analise') for update loop
    update public.proposals set status = 'reprovada', decision_reason = 'Unidade vendida', queue_entered_at = null, queue_seq = null where id = q.id;
    perform public._proposal_event(q.id, null, 'reprovada', 'Unidade vendida.');
    perform public.notify_user(q.broker_user_id, 'proposta_encerrada', 'Unidade vendida', 'A unidade desta proposta foi vendida.',
      '/corretor/propostas/' || q.id, 'proposta:' || q.id || ':unidade_vendida');
  end loop;
  perform public.write_audit('reserva_convertida', 'reservations', r.id::text, '{}'::jsonb, p_reason, r.development_id);
end $$;

-- ---------------------------------------------------------------------------
-- Rotina agendada: expiração de prazos e avanço da fila (idempotente; não depende de usuário conectado)
-- ---------------------------------------------------------------------------
create or replace function public.process_reservation_deadlines() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_expired int := 0; v_windows int := 0;
begin
  for r in
    select res.id, res.unit_id, res.proposal_id, res.broker_user_id, res.status
    from public.reservations res
    left join public.development_commercial_settings s on s.development_id = res.development_id
    where (res.status = 'aguardando_documentos' and res.expires_at <= now())
       or (res.status = 'pendencias_documentacao' and res.regularization_deadline <= now() and coalesce(s.regularization_expires, true))
    order by res.expires_at
    for update of res skip locked
  loop
    perform 1 from public.units where id = r.unit_id for update;
    perform public._end_reservation(r.id, 'expirada',
      case when r.status = 'aguardando_documentos' then 'Prazo de documentação encerrado sem envio completo.'
           else 'Prazo de regularização encerrado.' end, 'expirada');
    perform public.notify_user(r.broker_user_id, 'reserva_expirada', 'Reserva expirada',
      'O prazo da reserva terminou sem a documentação completa.', '/corretor/propostas/' || r.proposal_id, 'reserva:' || r.id || ':expirada');
    perform public.notify_staff('comercial', 'reserva_expirada', 'Reserva expirada', 'Reserva expirada; fila processada.',
      '/admin/reservas/' || r.id, 'reserva:' || r.id || ':expirada');
    v_expired := v_expired + 1;
  end loop;

  with ended as (
    update public.prelaunch_registrations reg set status = 'janela_encerrada'
    from public.prelaunch_waves w
    where w.id = reg.wave_id and reg.status = 'convidado' and w.window_ends_at <= now()
    returning reg.id
  )
  insert into public.prelaunch_registration_events (registration_id, from_status, to_status, note)
  select id, 'convidado', 'janela_encerrada', 'Janela de proposta encerrada.' from ended;
  get diagnostics v_windows = row_count;

  return jsonb_build_object('reservas_expiradas', v_expired, 'janelas_encerradas', v_windows);
end $$;
revoke execute on function public.process_reservation_deadlines() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.prelaunch_campaigns enable row level security;
alter table public.prelaunch_waves enable row level security;
alter table public.prelaunch_registrations enable row level security;
alter table public.prelaunch_registration_events enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_events enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;
alter table public.reservation_files enable row level security;
alter table public.reservation_extensions enable row level security;

create policy proposals_broker on public.proposals for select to authenticated using (broker_user_id = auth.uid());
create policy proposals_staff on public.proposals for select to authenticated using (public.has_staff_permission('comercial'));
create policy proposal_events_broker on public.proposal_events for select to authenticated
  using (visible_to_broker and exists (select 1 from public.proposals p where p.id = proposal_id and p.broker_user_id = auth.uid()));
create policy proposal_events_staff on public.proposal_events for select to authenticated using (public.has_staff_permission('comercial'));

create policy reservations_broker on public.reservations for select to authenticated using (broker_user_id = auth.uid());
create policy reservations_staff on public.reservations for select to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('documentos'));
create policy reservation_items_select on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and r.broker_user_id = auth.uid())
         or public.has_staff_permission('comercial') or public.has_staff_permission('documentos'));
create policy reservation_files_select on public.reservation_files for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and r.broker_user_id = auth.uid())
         or public.has_staff_permission('comercial') or public.has_staff_permission('documentos'));
create policy reservation_extensions_select on public.reservation_extensions for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and r.broker_user_id = auth.uid())
         or public.has_staff_permission('comercial'));

create policy prelaunch_campaigns_broker on public.prelaunch_campaigns for select to authenticated
  using (status <> 'rascunho' and public.broker_can_see_development_card(development_id));
create policy prelaunch_campaigns_staff on public.prelaunch_campaigns for all to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));
create policy prelaunch_waves_broker on public.prelaunch_waves for select to authenticated
  using (exists (select 1 from public.prelaunch_registrations r where r.wave_id = prelaunch_waves.id and r.broker_user_id = auth.uid()));
create policy prelaunch_waves_staff on public.prelaunch_waves for all to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));
create policy prelaunch_reg_broker on public.prelaunch_registrations for select to authenticated using (broker_user_id = auth.uid());
create policy prelaunch_reg_staff on public.prelaunch_registrations for select to authenticated using (public.has_staff_permission('comercial'));
create policy prelaunch_events_broker on public.prelaunch_registration_events for select to authenticated
  using (exists (select 1 from public.prelaunch_registrations r where r.id = registration_id and r.broker_user_id = auth.uid()));
create policy prelaunch_events_staff on public.prelaunch_registration_events for select to authenticated using (public.has_staff_permission('comercial'));

revoke insert, update, delete on public.proposals, public.proposal_events, public.reservations, public.reservation_items,
  public.reservation_files, public.reservation_extensions, public.prelaunch_registrations, public.prelaunch_registration_events from authenticated;
revoke all on public.proposals, public.proposal_events, public.reservations, public.reservation_items, public.reservation_files,
  public.reservation_extensions, public.prelaunch_campaigns, public.prelaunch_waves, public.prelaunch_registrations,
  public.prelaunch_registration_events from anon;
