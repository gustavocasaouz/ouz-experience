-- OUZ Experience — Decisões da OUZ (13/10/2026):
-- 1) A posição na fila não é exibida ao corretor (opção removida).
-- 2) A unidade só aparece como "Reservada" para os corretores depois que o corretor da reserva envia a
--    documentação completa. Antes disso, aparece como "Disponível". A reserva de 48 h e a fila continuam
--    valendo internamente (uma única reserva ativa por unidade); a OUZ vê a situação real.

drop function if exists public.broker_queue_position(uuid);
alter table public.development_commercial_settings drop column if exists show_queue_position;

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

  -- A unidade continua "disponível" para os corretores até o envio da documentação completa (decisão da OUZ).
  select code into v_unit_code from public.units where id = p.unit_id;
  update public.proposals set status = 'reservada', queue_entered_at = null, queue_seq = null where id = p.id;
  perform public._proposal_event(p.id, p.status, 'reservada', 'Reserva temporária criada; prazo para documentação iniciado.');

  perform public.notify_user(p.broker_user_id, 'reserva_criada', 'Reserva criada — envie a documentação',
    format('Unidade %s reservada. Envie a documentação até o prazo indicado no portal.', v_unit_code),
    '/corretor/propostas/' || p.id, 'reserva:' || v_res || ':criada');
  perform public.notify_staff('comercial', 'reserva_criada', 'Nova reserva temporária',
    format('Unidade %s reservada aguardando documentação.', v_unit_code), '/admin/reservas/' || v_res, 'reserva:' || v_res || ':criada');
  return v_res;
end $$;

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
  -- Só agora a unidade passa a aparecer como reservada para os corretores.
  update public.units set status = 'reservada' where id = r.unit_id and status = 'disponivel';
  select code into v_code from public.units where id = r.unit_id;
  perform public._proposal_event(r.proposal_id, 'reservada', 'reservada', 'Documentação completa enviada dentro do prazo.');
  perform public.notify_staff('documentos', 'reserva_documentos', 'Documentação de reserva para conferência',
    format('Unidade %s: documentação completa enviada.', v_code), '/admin/reservas/' || r.id,
    'reserva:' || r.id || ':docs:' || extract(epoch from now())::bigint);
end $$;

-- Ajusta unidades com reserva ainda aguardando documentos.
update public.units u set status = 'disponivel'
where u.status = 'reservada'
  and exists (select 1 from public.reservations r where r.unit_id = u.id and r.status = 'aguardando_documentos')
  and not exists (select 1 from public.reservations r where r.unit_id = u.id
                  and r.status in ('documentacao_enviada', 'aguardando_conferencia', 'documentacao_validada', 'pendencias_documentacao'));

-- Situação real por unidade, para a OUZ.
create or replace function public.admin_units_overview(p_development_id uuid)
returns table (unit_id uuid, queue_count integer, reservation_id uuid, reservation_status public.reservation_status,
               reservation_deadline timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query
    select u.id,
           (select count(*)::int from public.proposals p where p.unit_id = u.id and p.status = 'na_fila'),
           r.id, r.status,
           case r.status when 'aguardando_documentos' then r.expires_at when 'pendencias_documentacao' then r.regularization_deadline end
    from public.units u
    left join public.reservations r on r.unit_id = u.id
      and r.status in ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','documentacao_validada','pendencias_documentacao')
    where u.development_id = p_development_id;
end $$;
