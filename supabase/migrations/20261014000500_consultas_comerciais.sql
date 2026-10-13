-- OUZ Experience — Etapa 2: consultas comerciais seguras para as telas.

-- Preços vigentes de um empreendimento, só para quem pode vê-los (corretor autorizado/janela aberta ou staff).
create or replace function public.current_unit_prices(p_development_id uuid)
returns table (unit_id uuid, price numeric, price_table_id uuid, version_number integer)
language sql stable security definer set search_path = '' as $$
  select pti.unit_id, pti.price, pt.id, pt.version_number
  from public.price_tables pt
  join public.price_table_items pti on pti.price_table_id = pt.id
  where pt.development_id = p_development_id and pt.status = 'vigente'
    and (public.broker_can_see_prices(p_development_id) or public.has_staff_permission('comercial') or public.has_staff_permission('politicas'))
$$;

-- Fila de uma unidade para a OUZ (ordem oficial do servidor).
create or replace function public.admin_unit_queue(p_unit_id uuid)
returns table (proposal_id uuid, broker_name text, client_name text, offered_price numeric, queue_entered_at timestamptz,
               queue_priority integer, queue_seq bigint, queue_position integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query
    select p.id, b.full_name, p.client_name, p.offered_price, p.queue_entered_at, p.queue_priority, p.queue_seq,
           (row_number() over (order by p.queue_priority desc, p.queue_entered_at, p.queue_seq))::int
    from public.proposals p join public.broker_profiles b on b.user_id = p.broker_user_id
    where p.unit_id = p_unit_id and p.status = 'na_fila'
    order by p.queue_priority desc, p.queue_entered_at, p.queue_seq;
end $$;

-- Atalho para a OUZ antecipar a rotina de prazos (que já roda a cada minuto via pg_cron).
create or replace function public.admin_run_deadlines() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return public.process_reservation_deadlines();
end $$;
