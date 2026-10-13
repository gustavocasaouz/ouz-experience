-- OUZ Experience — Correção do pedido (13/10/2026): a quantidade de propostas por unidade é informação
-- EXCLUSIVA da OUZ. O corretor não pode saber quantas propostas existem na fila.

create or replace function public.unit_queue_counts(p_development_id uuid)
returns table (unit_id uuid, queue_count integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select u.id, (select count(*)::int from public.proposals p where p.unit_id = u.id and p.status = 'na_fila')
    from public.units u where u.development_id = p_development_id;
end $$;

alter table public.development_commercial_settings drop column if exists show_queue_count;
