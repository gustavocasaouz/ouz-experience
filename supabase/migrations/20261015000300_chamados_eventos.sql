-- OUZ Experience — Etapa 3: chamados do cliente e eventos (públicos, presença, capacidade, lista de espera, lembretes).

create type public.ticket_category as enum ('assistencia_tecnica', 'duvida_administrativa', 'solicitacao_unidade', 'pos_entrega', 'concierge');
create type public.ticket_status as enum ('aberto', 'em_analise', 'agendado', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'encerrado', 'cancelado');
create type public.ticket_priority as enum ('baixa', 'media', 'alta', 'urgente');
create type public.coverage_assessment as enum ('nao_avaliado', 'coberto', 'nao_coberto', 'parcial');
create type public.rsvp_status as enum ('confirmado', 'lista_espera', 'cancelado');

-- ---------------------------------------------------------------------------
-- Chamados
-- ---------------------------------------------------------------------------
create sequence public.ticket_number_seq start 1001;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.ticket_number_seq'),
  client_id uuid not null references public.clients (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  category public.ticket_category not null,
  title text not null check (length(title) between 3 and 200),
  description text not null check (length(description) between 3 and 4000),
  status public.ticket_status not null default 'aberto',
  priority public.ticket_priority not null default 'media',
  assigned_to uuid references public.profiles (id),
  scheduled_at timestamptz,                  -- visita/atendimento agendado
  informed_deadline date,                    -- prazo informado ao cliente
  coverage public.coverage_assessment not null default 'nao_avaliado', -- avaliação MANUAL da OUZ (nunca automática)
  coverage_note text,
  rating smallint check (rating between 1 and 5),
  rating_comment text,
  rated_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_status_idx on public.tickets (status, created_at);
create index tickets_client_idx on public.tickets (client_id, created_at desc);
create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();
create trigger tickets_audit after insert or update on public.tickets
  for each row execute function public.audit_row_change();

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid references public.profiles (id),
  from_staff boolean not null default false,
  internal boolean not null default false,  -- nota interna da OUZ: nunca visível ao cliente
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index ticket_messages_idx on public.ticket_messages (ticket_id, created_at);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  message_id uuid references public.ticket_messages (id) on delete set null,
  storage_path text not null,               -- ticket-attachments/{ticket_id}/...
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  check (storage_path like ticket_id::text || '/%')
);

create or replace function public.is_ticket_owner(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tickets t where t.id = p_ticket_id and public.is_client_of_unit(t.unit_id))
$$;

create or replace function public.client_open_ticket(p_unit_id uuid, p_category public.ticket_category, p_title text, p_description text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_number bigint;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.tickets (client_id, unit_id, category, title, description, created_by)
  values (public.current_client_id(), p_unit_id, p_category, trim(p_title), trim(p_description), auth.uid())
  returning id, number into v_id, v_number;
  perform public.notify_staff('atendimento', 'chamado', 'Novo chamado #' || v_number, trim(p_title), '/admin/chamados/' || v_id, 'chamado:' || v_id || ':novo');
  return v_id;
end $$;

create or replace function public.post_ticket_message(p_ticket_id uuid, p_body text, p_internal boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_staff boolean := public.has_staff_permission('atendimento'); v_id uuid; v_user uuid;
begin
  select * into t from public.tickets where id = p_ticket_id for update;
  if t.id is null or not (v_staff or public.is_client_of_unit(t.unit_id)) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if t.status in ('encerrado', 'cancelado') then raise exception 'chamado encerrado' using errcode = '22023'; end if;
  if p_internal and not v_staff then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.ticket_messages (ticket_id, author_id, from_staff, internal, body)
  values (t.id, auth.uid(), v_staff, p_internal, trim(p_body)) returning id into v_id;
  if v_staff and not p_internal then
    select user_id into v_user from public.clients where id = t.client_id;
    if v_user is not null then
      perform public.notify_user(v_user, 'chamado', 'Nova mensagem no chamado #' || t.number, left(trim(p_body), 200),
        '/cliente/chamados/' || t.id, 'chamado:' || t.id || ':msg:' || v_id);
    end if;
  elsif not v_staff then
    if t.status = 'aguardando_cliente' then update public.tickets set status = 'em_analise' where id = t.id; end if;
    perform public.notify_staff('atendimento', 'chamado', 'Cliente respondeu ao chamado #' || t.number, left(trim(p_body), 200),
      '/admin/chamados/' || t.id, 'chamado:' || t.id || ':msg:' || v_id);
  end if;
  return v_id;
end $$;

create or replace function public.add_ticket_attachment(p_ticket_id uuid, p_storage_path text, p_mime text, p_size integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (public.has_staff_permission('atendimento') or public.is_ticket_owner(p_ticket_id)) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_storage_path not like p_ticket_id::text || '/%' then raise exception 'caminho de arquivo inválido' using errcode = '22023'; end if;
  insert into public.ticket_attachments (ticket_id, storage_path, mime_type, size_bytes, uploaded_by)
  values (p_ticket_id, p_storage_path, p_mime, p_size, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_update_ticket(
  p_ticket_id uuid, p_status public.ticket_status, p_priority public.ticket_priority, p_assigned_to uuid,
  p_scheduled_at timestamptz, p_informed_deadline date, p_coverage public.coverage_assessment, p_coverage_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_user uuid;
begin
  if not public.has_staff_permission('atendimento') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.staff_members where user_id = p_assigned_to and active) then
    raise exception 'responsável inválido' using errcode = '22023';
  end if;
  select * into t from public.tickets where id = p_ticket_id for update;
  if t.id is null then raise exception 'chamado não encontrado' using errcode = '22023'; end if;
  update public.tickets
     set status = p_status, priority = p_priority, assigned_to = p_assigned_to, scheduled_at = p_scheduled_at,
         informed_deadline = p_informed_deadline, coverage = p_coverage, coverage_note = nullif(trim(p_coverage_note), ''),
         closed_at = case when p_status in ('encerrado', 'cancelado', 'resolvido') then coalesce(closed_at, now()) else null end
   where id = t.id;
  if p_status is distinct from t.status or p_scheduled_at is distinct from t.scheduled_at or p_informed_deadline is distinct from t.informed_deadline then
    select user_id into v_user from public.clients where id = t.client_id;
    if v_user is not null then
      perform public.notify_user(v_user, 'chamado', 'Atualização no chamado #' || t.number, 'Consulte o andamento no portal.',
        '/cliente/chamados/' || t.id, 'chamado:' || t.id || ':upd:' || extract(epoch from now())::bigint);
    end if;
  end if;
end $$;

create or replace function public.client_rate_ticket(p_ticket_id uuid, p_rating integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket_id for update;
  if t.id is null or not public.is_client_of_unit(t.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if t.status not in ('resolvido', 'encerrado') then raise exception 'avaliação disponível após a resolução' using errcode = '22023'; end if;
  if t.rated_at is not null then raise exception 'chamado já avaliado' using errcode = '22023'; end if;
  if p_rating not between 1 and 5 then raise exception 'nota de 1 a 5' using errcode = '22023'; end if;
  update public.tickets set rating = p_rating, rating_comment = nullif(trim(p_comment), ''), rated_at = now(),
         status = 'encerrado', closed_at = coalesce(closed_at, now())
   where id = t.id;
end $$;

alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_attachments enable row level security;

create policy tickets_client on public.tickets for select to authenticated using (public.is_client_of_unit(unit_id));
create policy tickets_staff on public.tickets for select to authenticated using (public.has_staff_permission('atendimento'));
-- O cliente não lê a avaliação interna de garantia enquanto a OUZ não a comunicar: colunas de cobertura só via staff.
revoke select on public.tickets from authenticated;
grant select (id, number, client_id, unit_id, category, title, description, status, priority, scheduled_at, informed_deadline,
              rating, rating_comment, rated_at, closed_at, created_at, updated_at) on public.tickets to authenticated;

create or replace function public.admin_ticket_internal(p_ticket_id uuid)
returns table (assigned_to uuid, coverage public.coverage_assessment, coverage_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('atendimento') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select t.assigned_to, t.coverage, t.coverage_note from public.tickets t where t.id = p_ticket_id;
end $$;

create policy ticket_messages_client on public.ticket_messages for select to authenticated
  using (not internal and public.is_ticket_owner(ticket_id));
create policy ticket_messages_staff on public.ticket_messages for select to authenticated using (public.has_staff_permission('atendimento'));
create policy ticket_attachments_read on public.ticket_attachments for select to authenticated
  using (public.is_ticket_owner(ticket_id) or public.has_staff_permission('atendimento'));

revoke insert, update, delete on public.tickets, public.ticket_messages, public.ticket_attachments from authenticated;
revoke all on public.tickets, public.ticket_messages, public.ticket_attachments from anon;

create policy "ticket-attachments: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments' and public.is_ticket_owner(public.try_uuid((storage.foldername(name))[1])));
create policy "ticket-attachments: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-attachments' and public.is_ticket_owner(public.try_uuid((storage.foldername(name))[1])));
create policy "ticket-attachments: atendimento envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-attachments' and public.has_staff_permission('atendimento'));

-- ---------------------------------------------------------------------------
-- Eventos: convidados específicos, grupos de corretores, presença, capacidade, lista de espera, lembretes
-- ---------------------------------------------------------------------------
alter table public.events add column broker_group_id uuid references public.broker_groups (id) on delete set null;
alter table public.events add column rsvp_enabled boolean not null default true;
alter table public.events add column reminder_hours integer not null default 24 check (reminder_hours between 0 and 336);

create table public.event_invitations (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id),
  invited_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  guests smallint not null default 0 check (guests between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_rsvps_waitlist_idx on public.event_rsvps (event_id, created_at) where status = 'lista_espera';
create trigger event_rsvps_updated_at before update on public.event_rsvps
  for each row execute function public.set_updated_at();

-- Quem pode ver o evento (mesma regra para leitura, confirmação e notificações).
create or replace function public.can_view_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and (
      public.has_staff_permission('eventos')
      or (e.is_published and (
           e.audience = 'geral'
        or (e.audience = 'clientes' and public.is_client())
        or (e.audience = 'corretores_aprovados' and public.is_approved_broker()
            and (e.broker_group_id is null or exists (select 1 from public.broker_group_members m
                                                      where m.group_id = e.broker_group_id and m.broker_user_id = auth.uid())))
        or (e.audience = 'empreendimento' and e.development_id is not null
            and (public.is_client_of_development(e.development_id) or public.broker_can_access_development(e.development_id)))
        or (e.audience = 'convidados' and exists (select 1 from public.event_invitations i where i.event_id = e.id and i.user_id = auth.uid()))
      ))
    )
  )
$$;

drop policy if exists events_select_clients on public.events;
drop policy if exists events_select_brokers on public.events;
drop policy if exists events_select_development on public.events;
create policy events_select_audience on public.events for select to authenticated using (public.can_view_event(id));

-- Lugares ocupados (confirmados + acompanhantes). Não revela quem.
create or replace function public.event_seats_taken(p_event_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(1 + guests), 0)::int from public.event_rsvps where event_id = p_event_id and status = 'confirmado'
$$;

create or replace function public.event_rsvp(p_event_id uuid, p_attend boolean, p_guests integer default 0) returns public.rsvp_status
language plpgsql security definer set search_path = '' as $$
declare e public.events; v_status public.rsvp_status; v_prev public.rsvp_status;
begin
  if auth.uid() is null or not public.can_view_event(p_event_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event_id for update;   -- serializa confirmações do mesmo evento
  if not e.rsvp_enabled or e.starts_at <= now() then raise exception 'confirmação encerrada para este evento' using errcode = '22023'; end if;
  select status into v_prev from public.event_rsvps where event_id = e.id and user_id = auth.uid();

  if not p_attend then
    update public.event_rsvps set status = 'cancelado' where event_id = e.id and user_id = auth.uid();
    if v_prev = 'confirmado' then perform public.promote_event_waitlist(e.id); end if;
    return 'cancelado';
  end if;

  if v_prev = 'confirmado' then
    -- alteração de acompanhantes respeita a capacidade
    if e.capacity is not null and public.event_seats_taken(e.id) - (select 1 + guests from public.event_rsvps where event_id = e.id and user_id = auth.uid())
       + 1 + coalesce(p_guests, 0) > e.capacity then
      raise exception 'não há lugares para esse número de acompanhantes' using errcode = '22023';
    end if;
    update public.event_rsvps set guests = coalesce(p_guests, 0) where event_id = e.id and user_id = auth.uid();
    return 'confirmado';
  end if;

  v_status := case when e.capacity is null or public.event_seats_taken(e.id) + 1 + coalesce(p_guests, 0) <= e.capacity
                   then 'confirmado'::public.rsvp_status else 'lista_espera'::public.rsvp_status end;
  insert into public.event_rsvps (event_id, user_id, status, guests) values (e.id, auth.uid(), v_status, coalesce(p_guests, 0))
  on conflict (event_id, user_id) do update set status = excluded.status, guests = excluded.guests, created_at = now();
  return v_status;
end $$;

create or replace function public.promote_event_waitlist(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; w record; v_n int := 0;
begin
  select * into e from public.events where id = p_event_id;
  for w in select * from public.event_rsvps where event_id = p_event_id and status = 'lista_espera' order by created_at for update loop
    exit when e.capacity is not null and public.event_seats_taken(p_event_id) + 1 + w.guests > e.capacity;
    update public.event_rsvps set status = 'confirmado' where id = w.id;
    perform public.notify_user(w.user_id, 'evento', 'Sua presença foi confirmada', e.title, '/agenda', 'evento:' || e.id || ':promovido:' || w.user_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.promote_event_waitlist(uuid) from public, anon, authenticated;

-- Lembretes (pg_cron): uma vez por evento e pessoa confirmada.
create or replace function public.send_event_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select e.id, e.title, e.starts_at, v.user_id from public.events e
    join public.event_rsvps v on v.event_id = e.id and v.status = 'confirmado'
    where e.is_published and e.reminder_hours > 0 and e.starts_at > now()
      and e.starts_at <= now() + make_interval(hours => e.reminder_hours)
  loop
    perform public.notify_user(r.user_id, 'evento_lembrete', 'Lembrete: ' || r.title,
      'Começa em ' || to_char(r.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || '.',
      '/agenda', 'evento:' || r.id || ':lembrete');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.send_event_reminders() from public, anon, authenticated;

create or replace function public.admin_event_attendance(p_event_id uuid)
returns table (user_id uuid, full_name text, email text, status public.rsvp_status, guests smallint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('eventos') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select v.user_id, p.full_name, p.email, v.status, v.guests, v.created_at
    from public.event_rsvps v join public.profiles p on p.id = v.user_id
    where v.event_id = p_event_id order by v.status, v.created_at;
end $$;

alter table public.event_invitations enable row level security;
alter table public.event_rsvps enable row level security;
create policy invitations_staff on public.event_invitations for all to authenticated
  using (public.has_staff_permission('eventos')) with check (public.has_staff_permission('eventos'));
create policy invitations_own on public.event_invitations for select to authenticated using (user_id = auth.uid());
-- Participantes não são divulgados: cada um vê só a própria confirmação.
create policy rsvps_own on public.event_rsvps for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.event_rsvps from authenticated;
revoke all on public.event_invitations, public.event_rsvps from anon;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ouz-lembretes-eventos', '*/15 * * * *', 'select public.send_event_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;
