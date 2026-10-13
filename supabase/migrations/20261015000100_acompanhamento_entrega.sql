-- OUZ Experience — Etapa 3: acompanhamento do empreendimento, personalização, vistoria, pendências e entrega.
-- Informações publicadas pela OUZ; não é um sistema de gestão de obras.

create type public.milestone_stage as enum ('lancamento', 'obra', 'entrega', 'pos_entrega');
create type public.media_kind as enum ('imagem', 'video');
create type public.customization_status as enum ('recebida', 'em_analise', 'orcamento_enviado', 'aprovada', 'recusada', 'concluida', 'cancelada');
create type public.slot_kind as enum ('vistoria', 'entrega_chaves');
create type public.booking_status as enum ('agendada', 'realizada', 'cancelada', 'nao_compareceu');
create type public.punch_status as enum ('aberta', 'em_andamento', 'resolvida', 'aceita_cliente', 'contestada');

-- Quem é o cliente atual (pode haver um cadastro por conta).
create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.clients where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Linha do tempo (marcos) com previsões e histórico de alterações
-- ---------------------------------------------------------------------------
create table public.development_milestones (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  stage public.milestone_stage not null,
  title text not null check (length(title) between 2 and 200),
  description text,
  forecast_date date,                    -- previsão vigente informada pela OUZ
  completed_on date,                     -- quando concluído
  sort_order integer not null default 0,
  is_published boolean not null default false,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger development_milestones_updated_at before update on public.development_milestones
  for each row execute function public.set_updated_at();
create trigger development_milestones_audit after insert or update or delete on public.development_milestones
  for each row execute function public.audit_row_change();

create table public.milestone_forecast_changes (
  id bigint generated always as identity primary key,
  milestone_id uuid not null references public.development_milestones (id) on delete cascade,
  previous_date date,
  new_date date,
  reason text not null,
  visible_to_clients boolean not null default true,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

-- Alteração de previsão sempre deixa histórico (com motivo).
create or replace function public.admin_change_milestone_forecast(p_milestone_id uuid, p_new_date date, p_reason text, p_visible boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev date; v_dev uuid;
begin
  if not public.has_staff_permission('conteudo') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'informe o motivo da alteração' using errcode = '22023'; end if;
  select forecast_date, development_id into v_prev, v_dev from public.development_milestones where id = p_milestone_id for update;
  if v_dev is null then raise exception 'marco não encontrado' using errcode = '22023'; end if;
  update public.development_milestones set forecast_date = p_new_date where id = p_milestone_id;
  insert into public.milestone_forecast_changes (milestone_id, previous_date, new_date, reason, visible_to_clients, changed_by)
  values (p_milestone_id, v_prev, p_new_date, p_reason, p_visible, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Atualizações (texto, fotos, vídeos), evolução física e comunicados
-- ---------------------------------------------------------------------------
create table public.development_updates (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  title text not null,
  body text,
  published_at timestamptz,               -- null = rascunho
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger development_updates_updated_at before update on public.development_updates
  for each row execute function public.set_updated_at();
create trigger development_updates_audit after insert or update or delete on public.development_updates
  for each row execute function public.audit_row_change();

create table public.development_update_media (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.development_updates (id) on delete cascade,
  kind public.media_kind not null,
  storage_path text,                      -- bucket client-media (privado), prefixo empreendimento/{development_id}/
  external_url text,                      -- vídeo hospedado (ex.: YouTube não listado, Vimeo)
  caption text,
  sort_order integer not null default 0,
  check (num_nonnulls(storage_path, external_url) = 1),
  check (external_url is null or external_url ~ '^https://')
);

create table public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  reference_date date not null,
  overall_percent numeric(5,2) not null check (overall_percent between 0 and 100),
  items jsonb not null default '[]'::jsonb,   -- [{"label": "Estrutura", "percent": 80}]
  notes text,
  published_at timestamptz,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(items) = 'array')
);
create trigger progress_reports_audit after insert or update or delete on public.progress_reports
  for each row execute function public.audit_row_change();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  unit_id uuid references public.units (id) on delete cascade,   -- nulo = todos os clientes do empreendimento
  title text not null,
  body text not null,
  published_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();

-- Publicar comunicado avisa os clientes (in-app + e-mail), sem duplicar.
create or replace function public.admin_publish_announcement(p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.announcements; c record; v_n int := 0;
begin
  if not public.has_staff_permission('conteudo') then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.announcements set published_at = coalesce(published_at, now()) where id = p_id returning * into a;
  if a.id is null then raise exception 'comunicado não encontrado' using errcode = '22023'; end if;
  for c in
    select distinct cl.user_id from public.clients cl
    join public.client_units cu on cu.client_id = cl.id and cu.active
    join public.units u on u.id = cu.unit_id
    where cl.user_id is not null and u.development_id = a.development_id and (a.unit_id is null or u.id = a.unit_id)
  loop
    perform public.notify_user(c.user_id, 'comunicado', a.title, left(a.body, 300), '/cliente', 'comunicado:' || a.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Solicitações de personalização (operadas pela OUZ)
-- ---------------------------------------------------------------------------
create table public.customization_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (length(title) between 3 and 200),
  description text not null check (length(description) between 3 and 4000),
  status public.customization_status not null default 'recebida',
  ouz_response text,
  quote_amount numeric(14,2) check (quote_amount is null or quote_amount >= 0),
  quote_valid_until date,
  client_decision_at timestamptz,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customization_requests_updated_at before update on public.customization_requests
  for each row execute function public.set_updated_at();
create trigger customization_requests_audit after insert or update on public.customization_requests
  for each row execute function public.audit_row_change();

create or replace function public.client_create_customization(p_unit_id uuid, p_title text, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.customization_requests (unit_id, client_id, title, description)
  values (p_unit_id, public.current_client_id(), trim(p_title), trim(p_description)) returning id into v_id;
  perform public.notify_staff('atendimento', 'personalizacao', 'Nova solicitação de personalização', trim(p_title),
    '/admin/personalizacoes/' || v_id, 'personalizacao:' || v_id || ':nova');
  return v_id;
end $$;

create or replace function public.client_decide_customization(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.customization_requests;
begin
  select * into r from public.customization_requests where id = p_id for update;
  if r.id is null or not public.is_client_of_unit(r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'orcamento_enviado' then raise exception 'não há orçamento aguardando decisão' using errcode = '22023'; end if;
  if r.quote_valid_until is not null and r.quote_valid_until < current_date then raise exception 'orçamento vencido; solicite atualização' using errcode = '22023'; end if;
  update public.customization_requests
     set status = case when p_approve then 'aprovada'::public.customization_status else 'recusada'::public.customization_status end,
         client_decision_at = now()
   where id = p_id;
  perform public.notify_staff('atendimento', 'personalizacao', 'Cliente respondeu ao orçamento de personalização',
    case when p_approve then 'Aprovado pelo cliente' else 'Recusado pelo cliente' end, '/admin/personalizacoes/' || p_id,
    'personalizacao:' || p_id || ':decisao');
end $$;

create or replace function public.admin_update_customization(
  p_id uuid, p_status public.customization_status, p_response text, p_quote numeric, p_valid_until date
) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.customization_requests; v_user uuid;
begin
  if not public.has_staff_permission('atendimento') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_status = 'aprovada' then raise exception 'a aprovação de orçamento é do cliente' using errcode = '22023'; end if;
  if p_status = 'orcamento_enviado' and p_quote is null then raise exception 'informe o valor do orçamento' using errcode = '22023'; end if;
  update public.customization_requests
     set status = p_status, ouz_response = coalesce(nullif(trim(p_response), ''), ouz_response),
         quote_amount = coalesce(p_quote, quote_amount), quote_valid_until = coalesce(p_valid_until, quote_valid_until),
         handled_by = auth.uid()
   where id = p_id returning * into r;
  if r.id is null then raise exception 'solicitação não encontrada' using errcode = '22023'; end if;
  select user_id into v_user from public.clients where id = r.client_id;
  if v_user is not null then
    perform public.notify_user(v_user, 'personalizacao', 'Atualização da sua solicitação de personalização', r.title,
      '/cliente/unidades/' || r.unit_id || '/personalizacao', 'personalizacao:' || r.id || ':' || p_status || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Agenda de vistoria / entrega de chaves (horários publicados pela OUZ)
-- ---------------------------------------------------------------------------
create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  kind public.slot_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  is_open boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointment_slots_dev_idx on public.appointment_slots (development_id, kind, starts_at);

create table public.appointment_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.appointment_slots (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete cascade,
  kind public.slot_kind not null,
  status public.booking_status not null default 'agendada',
  booked_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Um horário atende uma unidade; uma unidade tem no máximo um agendamento ativo por tipo.
create unique index appointment_bookings_slot_active on public.appointment_bookings (slot_id) where status = 'agendada';
create unique index appointment_bookings_unit_active on public.appointment_bookings (unit_id, kind) where status = 'agendada';
create trigger appointment_bookings_updated_at before update on public.appointment_bookings
  for each row execute function public.set_updated_at();
create trigger appointment_bookings_audit after insert or update on public.appointment_bookings
  for each row execute function public.audit_row_change();

create or replace function public.client_book_slot(p_slot_id uuid, p_unit_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.appointment_slots; v_id uuid; v_dev uuid;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into s from public.appointment_slots where id = p_slot_id for update;
  select development_id into v_dev from public.units where id = p_unit_id;
  if s.id is null or not s.is_open or s.starts_at <= now() or s.development_id <> v_dev then
    raise exception 'horário indisponível' using errcode = '22023';
  end if;
  -- reagendamento: cancela o anterior do mesmo tipo
  update public.appointment_bookings set status = 'cancelada', notes = coalesce(notes, '') || ' [reagendado pelo cliente]'
   where unit_id = p_unit_id and kind = s.kind and status = 'agendada';
  insert into public.appointment_bookings (slot_id, unit_id, kind, booked_by) values (s.id, p_unit_id, s.kind, auth.uid())
  returning id into v_id;
  perform public.notify_staff('atendimento', 'agendamento', 'Novo agendamento de ' || case s.kind when 'vistoria' then 'vistoria' else 'entrega de chaves' end,
    to_char(s.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '/admin/entregas', 'agendamento:' || v_id);
  return v_id;
exception when unique_violation then
  raise exception 'horário acabou de ser ocupado; escolha outro' using errcode = '22023';
end $$;

create or replace function public.client_cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.appointment_bookings;
begin
  select * into b from public.appointment_bookings where id = p_booking_id for update;
  if b.id is null or not public.is_client_of_unit(b.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if b.status <> 'agendada' then raise exception 'agendamento não está ativo' using errcode = '22023'; end if;
  update public.appointment_bookings set status = 'cancelada' where id = b.id;
end $$;

-- Horários abertos sem expor quem reservou os demais.
create or replace function public.available_slots(p_unit_id uuid, p_kind public.slot_kind)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, location text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.ends_at, s.location
  from public.appointment_slots s
  join public.units u on u.development_id = s.development_id and u.id = p_unit_id
  where public.is_client_of_unit(p_unit_id) and s.kind = p_kind and s.is_open and s.starts_at > now()
    and not exists (select 1 from public.appointment_bookings b where b.slot_id = s.id and b.status = 'agendada')
  order by s.starts_at
$$;

-- ---------------------------------------------------------------------------
-- Pendências (checklist da vistoria) e entrega de chaves
-- ---------------------------------------------------------------------------
create table public.punch_list_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  location text,
  description text not null check (length(description) between 3 and 2000),
  status public.punch_status not null default 'aberta',
  ouz_note text,
  client_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger punch_list_items_updated_at before update on public.punch_list_items
  for each row execute function public.set_updated_at();
create trigger punch_list_items_audit after insert or update on public.punch_list_items
  for each row execute function public.audit_row_change();

-- O cliente só aceita ou contesta pendências marcadas como resolvidas.
create or replace function public.client_respond_punch_item(p_id uuid, p_accept boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.punch_list_items;
begin
  select * into i from public.punch_list_items where id = p_id for update;
  if i.id is null or not public.is_client_of_unit(i.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if i.status <> 'resolvida' then raise exception 'item ainda não foi marcado como resolvido' using errcode = '22023'; end if;
  if not p_accept and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'descreva o motivo da contestação' using errcode = '22023'; end if;
  update public.punch_list_items
     set status = case when p_accept then 'aceita_cliente'::public.punch_status else 'contestada'::public.punch_status end,
         client_note = nullif(trim(p_note), '')
   where id = p_id;
  if not p_accept then
    perform public.notify_staff('atendimento', 'pendencia_contestada', 'Cliente contestou pendência', left(i.description, 200),
      '/admin/entregas/' || i.unit_id, 'pendencia:' || i.id || ':contestada:' || extract(epoch from now())::bigint);
  end if;
end $$;

create table public.unit_deliveries (
  unit_id uuid primary key references public.units (id) on delete cascade,
  inspection_done_at timestamptz,
  keys_delivered_at timestamptz,
  received_by text,
  notes text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger unit_deliveries_updated_at before update on public.unit_deliveries
  for each row execute function public.set_updated_at();
create trigger unit_deliveries_audit after insert or update on public.unit_deliveries
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.development_milestones enable row level security;
alter table public.milestone_forecast_changes enable row level security;
alter table public.development_updates enable row level security;
alter table public.development_update_media enable row level security;
alter table public.progress_reports enable row level security;
alter table public.announcements enable row level security;
alter table public.customization_requests enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointment_bookings enable row level security;
alter table public.punch_list_items enable row level security;
alter table public.unit_deliveries enable row level security;

create policy milestones_client on public.development_milestones for select to authenticated
  using (is_published and public.is_client_of_development(development_id));
create policy milestones_staff on public.development_milestones for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
revoke update on public.development_milestones from authenticated;
grant update (stage, title, description, completed_on, sort_order, is_published) on public.development_milestones to authenticated;

create policy forecast_changes_client on public.milestone_forecast_changes for select to authenticated
  using (visible_to_clients and exists (select 1 from public.development_milestones m
           where m.id = milestone_id and m.is_published and public.is_client_of_development(m.development_id)));
create policy forecast_changes_staff on public.milestone_forecast_changes for select to authenticated
  using (public.has_staff_permission('conteudo'));

create policy updates_client on public.development_updates for select to authenticated
  using (published_at is not null and published_at <= now() and public.is_client_of_development(development_id));
create policy updates_staff on public.development_updates for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
create policy update_media_client on public.development_update_media for select to authenticated
  using (exists (select 1 from public.development_updates d where d.id = update_id and d.published_at is not null
                 and d.published_at <= now() and public.is_client_of_development(d.development_id)));
create policy update_media_staff on public.development_update_media for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy progress_client on public.progress_reports for select to authenticated
  using (published_at is not null and public.is_client_of_development(development_id));
create policy progress_staff on public.progress_reports for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy announcements_client on public.announcements for select to authenticated
  using (published_at is not null and public.is_client_of_development(development_id)
         and (unit_id is null or public.is_client_of_unit(unit_id)));
create policy announcements_staff on public.announcements for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));

create policy customization_client on public.customization_requests for select to authenticated
  using (public.is_client_of_unit(unit_id));
create policy customization_staff on public.customization_requests for select to authenticated
  using (public.has_staff_permission('atendimento'));

create policy slots_staff on public.appointment_slots for all to authenticated
  using (public.has_staff_permission('atendimento')) with check (public.has_staff_permission('atendimento'));
create policy bookings_client on public.appointment_bookings for select to authenticated using (public.is_client_of_unit(unit_id));
create policy bookings_staff on public.appointment_bookings for all to authenticated
  using (public.has_staff_permission('atendimento')) with check (public.has_staff_permission('atendimento'));

create policy punch_client on public.punch_list_items for select to authenticated using (public.is_client_of_unit(unit_id));
create policy punch_staff on public.punch_list_items for all to authenticated
  using (public.has_staff_permission('atendimento')) with check (public.has_staff_permission('atendimento'));

create policy deliveries_client on public.unit_deliveries for select to authenticated using (public.is_client_of_unit(unit_id));
create policy deliveries_staff on public.unit_deliveries for all to authenticated
  using (public.has_staff_permission('atendimento')) with check (public.has_staff_permission('atendimento'));

revoke insert, update, delete on public.customization_requests, public.milestone_forecast_changes from authenticated;
revoke all on public.development_milestones, public.milestone_forecast_changes, public.development_updates,
  public.development_update_media, public.progress_reports, public.announcements, public.customization_requests,
  public.appointment_slots, public.appointment_bookings, public.punch_list_items, public.unit_deliveries from anon;

-- Mídia de acompanhamento: bucket privado, servido por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-media', 'client-media', false, 52428800, array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do nothing;

create policy "client-media: cliente do empreendimento lê" on storage.objects for select to authenticated
  using (bucket_id = 'client-media' and (storage.foldername(name))[1] = 'empreendimento'
         and (public.is_client_of_development(public.try_uuid((storage.foldername(name))[2])) or public.has_staff_permission('conteudo')));
create policy "client-media: staff conteúdo envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-media' and public.has_staff_permission('conteudo'));
