-- OUZ Experience — Pedido da OUZ (13/10/2026): o corretor vê QUANTAS propostas estão na fila de cada unidade,
-- sem valores, clientes ou corretores. Configurável por empreendimento.

alter table public.development_commercial_settings
  add column show_queue_count boolean not null default true;

-- Retorna apenas números. Corretor: só se pode ver preços do empreendimento e a exibição estiver ligada. OUZ: sempre.
create or replace function public.unit_queue_counts(p_development_id uuid)
returns table (unit_id uuid, queue_count integer)
language sql stable security definer set search_path = '' as $$
  select u.id, (select count(*)::int from public.proposals p where p.unit_id = u.id and p.status = 'na_fila')
  from public.units u
  join public.development_commercial_settings s on s.development_id = u.development_id
  where u.development_id = p_development_id
    and (
      public.has_staff_permission('comercial')
      or (s.show_queue_count and public.broker_can_see_prices(p_development_id))
    )
$$;
