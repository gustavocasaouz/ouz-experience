-- OUZ Experience — Etapa 2: funções do pré-lançamento, Storage da documentação de reserva e agendamento das rotinas.

-- ---------------------------------------------------------------------------
-- Pré-lançamento — corretor
-- ---------------------------------------------------------------------------
create or replace function public._registration_event(p_id uuid, p_from public.prelaunch_registration_status, p_to public.prelaunch_registration_status, p_note text)
returns void language sql security definer set search_path = '' as $$
  insert into public.prelaunch_registration_events (registration_id, actor_user_id, from_status, to_status, note)
  values (p_id, auth.uid(), p_from, p_to, p_note)
$$;
revoke execute on function public._registration_event(uuid, public.prelaunch_registration_status, public.prelaunch_registration_status, text) from public, anon, authenticated;

create or replace function public.broker_register_prelaunch(
  p_campaign_id uuid, p_client_name text, p_client_document text, p_preferences text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.prelaunch_campaigns;
  v_doc text := regexp_replace(upper(coalesce(p_client_document, '')), '[^0-9A-Z]', '', 'g');
  v_type public.document_type;
  v_hash text;
  v_id uuid;
  v_status public.prelaunch_registration_status := 'registrado';
begin
  if not public.is_approved_broker() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into c from public.prelaunch_campaigns where id = p_campaign_id for update;
  if c.id is null or c.status <> 'aberta' or not public.broker_can_see_development_card(c.development_id) then
    raise exception 'registro de interesse indisponível' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_client_name)), 0) < 2 then raise exception 'informe o nome do cliente' using errcode = '22023'; end if;
  if public.is_valid_cpf(v_doc) then v_type := 'cpf';
  elsif public.is_valid_cnpj(v_doc) then v_type := 'cnpj';
  else raise exception 'CPF/CNPJ inválido' using errcode = '22023';
  end if;

  select id into v_id from public.prelaunch_registrations where broker_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'idempotent', true);
  end if;

  v_hash := public.document_hash(v_doc);
  -- Mesmo cliente registrado por outro corretor: vai para análise da OUZ (sem revelar o outro corretor).
  -- O limite por cliente vale para os registros deste corretor; duplicidades entre corretores são decididas pela OUZ.
  if exists (select 1 from public.prelaunch_registrations
              where campaign_id = c.id and client_document_hash = v_hash and broker_user_id <> auth.uid() and status <> 'cancelado') then
    v_status := 'em_analise_duplicidade';
  elsif (select count(*) from public.prelaunch_registrations
          where campaign_id = c.id and client_document_hash = v_hash and status <> 'cancelado') >= c.max_registrations_per_client then
    raise exception 'limite de registros para este cliente nesta campanha atingido' using errcode = '22023';
  end if;

  insert into public.prelaunch_registrations (campaign_id, broker_user_id, client_name, client_document_type, client_document,
                                              client_document_hash, preferences, status, idempotency_key)
  values (c.id, auth.uid(), trim(p_client_name), v_type, v_doc, v_hash, nullif(trim(p_preferences), ''), v_status, p_idempotency_key)
  returning id into v_id;
  perform public._registration_event(v_id, null, v_status,
    case when v_status = 'registrado' then 'Interesse registrado.' else 'Registro em análise pela OUZ.' end);
  if v_status = 'em_analise_duplicidade' then
    perform public.notify_staff('comercial', 'prelancamento_duplicidade', 'Pré-lançamento: registro em análise',
      'Cliente já registrado por outro corretor.', '/admin/pre-lancamento/' || c.id, 'prelancamento:' || v_id || ':duplicidade');
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

create or replace function public.broker_cancel_prelaunch_registration(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev public.prelaunch_registration_status;
begin
  select status into v_prev from public.prelaunch_registrations where id = p_id and broker_user_id = auth.uid() for update;
  if v_prev is null or v_prev in ('cancelado', 'proposta_enviada') then raise exception 'registro não pode ser cancelado' using errcode = '22023'; end if;
  update public.prelaunch_registrations set status = 'cancelado' where id = p_id;
  perform public._registration_event(p_id, v_prev, 'cancelado', 'Cancelado pelo corretor.');
end $$;

-- ---------------------------------------------------------------------------
-- Pré-lançamento — OUZ
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_campaign_status(p_campaign_id uuid, p_status public.prelaunch_campaign_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.prelaunch_campaigns
     set status = p_status,
         opened_at = case when p_status = 'aberta' then coalesce(opened_at, now()) else opened_at end,
         closed_at = case when p_status = 'encerrada' then now() else null end
   where id = p_campaign_id;
  if not found then raise exception 'campanha não encontrada' using errcode = '22023'; end if;
  perform public.write_audit('prelancamento_status', 'prelaunch_campaigns', p_campaign_id::text, jsonb_build_object('status', p_status), p_reason);
end $$;

create or replace function public.admin_resolve_prelaunch_registration(p_id uuid, p_accept boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev public.prelaunch_registration_status; v_new public.prelaunch_registration_status;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
  select status into v_prev from public.prelaunch_registrations where id = p_id for update;
  if v_prev is null or v_prev in ('cancelado', 'proposta_enviada') then raise exception 'registro não pode ser alterado' using errcode = '22023'; end if;
  v_new := case when p_accept then (case when v_prev = 'em_analise_duplicidade' then 'registrado' else v_prev end)::public.prelaunch_registration_status
                else 'cancelado' end;
  update public.prelaunch_registrations set status = v_new where id = p_id;
  perform public._registration_event(p_id, v_prev, v_new, p_reason);
  perform public.write_audit('prelancamento_registro_decisao', 'prelaunch_registrations', p_id::text, jsonb_build_object('para', v_new), p_reason);
end $$;

-- Coloca os próximos N registros (ordem: prioridade definida, depois cronológica) numa onda.
create or replace function public.admin_fill_wave(p_wave_id uuid, p_count integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare w public.prelaunch_waves; v_n int;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into w from public.prelaunch_waves where id = p_wave_id for update;
  if w.id is null then raise exception 'onda não encontrada' using errcode = '22023'; end if;
  with nxt as (
    select id from public.prelaunch_registrations
    where campaign_id = w.campaign_id and status = 'registrado'
    order by priority_rank nulls last, registered_at
    limit greatest(p_count, 0)
    for update
  ), upd as (
    update public.prelaunch_registrations r set status = 'em_onda', wave_id = w.id from nxt where r.id = nxt.id returning r.id
  )
  insert into public.prelaunch_registration_events (registration_id, actor_user_id, from_status, to_status, note)
  select id, auth.uid(), 'registrado', 'em_onda', 'Incluído na onda ' || w.name from upd;
  get diagnostics v_n = row_count;
  -- se a janela da onda já está aberta, os novos já são convidados
  if w.window_starts_at is not null and w.window_ends_at > now() then
    perform public.admin_open_wave_window(w.id, w.window_starts_at, w.window_ends_at);
  end if;
  return v_n;
end $$;

-- Libera preços e abre a janela de propostas para os registros da onda.
create or replace function public.admin_open_wave_window(p_wave_id uuid, p_starts_at timestamptz, p_ends_at timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare w public.prelaunch_waves; v_dev uuid; reg record; v_n int := 0;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_ends_at <= p_starts_at or p_ends_at <= now() then raise exception 'janela inválida' using errcode = '22023'; end if;
  select * into w from public.prelaunch_waves where id = p_wave_id for update;
  select development_id into v_dev from public.prelaunch_campaigns where id = w.campaign_id;
  if not exists (select 1 from public.price_tables where development_id = v_dev and status = 'vigente') then
    raise exception 'publique uma tabela de preços antes de abrir a janela' using errcode = '22023';
  end if;
  update public.prelaunch_waves set window_starts_at = p_starts_at, window_ends_at = p_ends_at,
         released_at = coalesce(released_at, now()), released_by = coalesce(released_by, auth.uid())
   where id = w.id;
  for reg in select id, broker_user_id, status from public.prelaunch_registrations where wave_id = w.id and status in ('em_onda', 'janela_encerrada') for update loop
    update public.prelaunch_registrations set status = 'convidado' where id = reg.id;
    perform public._registration_event(reg.id, reg.status, 'convidado', 'Janela de proposta liberada.');
    perform public.notify_user(reg.broker_user_id, 'prelancamento_janela', 'Pré-lançamento: janela de proposta liberada',
      'Os preços foram liberados para o seu registro. Envie a proposta dentro da janela indicada no portal.',
      '/corretor/pre-lancamento', 'prelancamento:' || reg.id || ':janela:' || extract(epoch from p_ends_at)::bigint);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit('prelancamento_janela', 'prelaunch_waves', w.id::text,
    jsonb_build_object('inicio', p_starts_at, 'fim', p_ends_at, 'convidados', v_n), null, v_dev);
  return v_n;
end $$;

create or replace function public.admin_set_registration_priority(p_id uuid, p_rank integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'justificativa obrigatória' using errcode = '22023'; end if;
  update public.prelaunch_registrations set priority_rank = p_rank where id = p_id;
  if not found then raise exception 'registro não encontrado' using errcode = '22023'; end if;
  perform public.write_audit('prelancamento_prioridade', 'prelaunch_registrations', p_id::text, jsonb_build_object('rank', p_rank), p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- Storage: documentação de reserva em proposal-documents/{reservation_id}/...
-- ---------------------------------------------------------------------------
create or replace function public.broker_owns_reservation(p_reservation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reservations r where r.id = p_reservation_id and r.broker_user_id = auth.uid())
$$;

create policy "proposal-documents: corretor lê os seus" on storage.objects for select to authenticated
  using (bucket_id = 'proposal-documents' and public.broker_owns_reservation(public.try_uuid((storage.foldername(name))[1])));
create policy "proposal-documents: corretor envia nos seus" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposal-documents' and public.broker_owns_reservation(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- Agendamento (pg_cron): prazos de reserva e janelas — a cada minuto, no servidor
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ouz-prazos-reservas', '* * * * *', 'select public.process_reservation_deadlines()');
  else
    raise notice 'pg_cron não habilitado: agende public.process_reservation_deadlines() manualmente.';
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;
