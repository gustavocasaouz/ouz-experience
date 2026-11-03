-- OUZ Experience — portal do cliente configurado por empreendimento (03/11/2026).
--
-- 1. Abas da unidade escolhidas por empreendimento (substitui client_delivery_enabled e as regras por fase):
--    SOHO (entregue): Documentos, Financeiro e Manual; nada de obra.
--    MAUI (em entrega): Documentos, Financeiro e Manual; a evolução física fica na visão geral.
--    UMAN (pré-lançamento): Acompanhamento, Documentos, Financeiro e Personalização.
-- 2. Categorias de chamado por empreendimento. A assistência técnica, quando o manual do proprietário
--    tem tabela de garantias, pede o item em garantia; itens com prazo encerrado deixam de ser oferecidos.
-- 3. Lembrete mensal das manutenções do manual (portal + e-mail), a partir do habite-se.

-- ---------------------------------------------------------------------------
-- 1. Abas
-- ---------------------------------------------------------------------------
alter table public.developments add column client_tabs text[] not null
  default '{acompanhamento,documentos,financeiro,personalizacao,entrega,manual}'
  check (client_tabs <@ array['acompanhamento', 'documentos', 'financeiro', 'personalizacao', 'entrega', 'manual']);
comment on column public.developments.client_tabs is 'Abas da unidade no portal do cliente. "manual" ainda depende de manual publicado.';

update public.developments set client_tabs = array_remove(client_tabs, 'entrega') where not client_delivery_enabled;
update public.developments set client_tabs = '{documentos,financeiro,manual}' where slug in ('soho', 'maui') and not is_demo;
update public.developments set client_tabs = '{acompanhamento,documentos,financeiro,personalizacao}' where slug = 'uman' and not is_demo;
alter table public.developments drop column client_delivery_enabled;

-- ---------------------------------------------------------------------------
-- 2. Chamados
-- ---------------------------------------------------------------------------
alter table public.developments add column client_ticket_categories public.ticket_category[] not null
  default '{assistencia_tecnica,duvida_administrativa,solicitacao_unidade,pos_entrega,solicitacao_geral}'
  check (not ('concierge' = any (client_ticket_categories)));
comment on column public.developments.client_ticket_categories is 'Categorias que o cliente pode escolher ao abrir chamado (concierge tem fluxo próprio).';

update public.developments set client_ticket_categories = '{duvida_administrativa,solicitacao_unidade,pos_entrega,solicitacao_geral}'
  where slug = 'soho' and not is_demo;
update public.developments set client_ticket_categories = '{duvida_administrativa,solicitacao_unidade,solicitacao_geral}'
  where slug = 'uman' and not is_demo;

grant update (client_tabs, client_ticket_categories) on public.developments to authenticated;  -- RLS: só staff com permissão conteudo

-- Item de garantia escolhido pelo cliente, gravado como texto: a tabela do manual pode ser reimportada.
alter table public.tickets add column warranty_item text;
comment on column public.tickets.warranty_item is 'Sistema · item · prazo do manual escolhido na abertura (referência; a cobertura continua avaliada pela OUZ).';
grant select (warranty_item) on public.tickets to authenticated;

-- Manual do proprietário publicado que vale para a unidade (o da própria unidade prevalece).
create or replace function public.unit_owner_manual(p_unit_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.development_manuals m
  join public.units u on u.id = p_unit_id and u.development_id = m.development_id
  where m.kind = 'proprietario' and m.is_published and (m.unit_id is null or m.unit_id = p_unit_id)
  order by m.unit_id is null
  limit 1
$$;
revoke execute on function public.unit_owner_manual(uuid) from public, anon;

-- Mesma regra de src/lib/warranty.ts: vigente até a véspera de habite-se + prazo.
create or replace function public.warranty_in_force(p_habite date, p_months int) returns boolean
language sql stable set search_path = '' as $$
  select p_habite is null or (now() at time zone 'America/Sao_Paulo')::date < (p_habite + make_interval(months => p_months))::date
$$;

drop function public.client_open_ticket(uuid, public.ticket_category, text, text);
create or replace function public.client_open_ticket(
  p_unit_id uuid, p_category public.ticket_category, p_title text, p_description text, p_warranty_item_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_number bigint; d public.developments; v_manual uuid; v_item text;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select dv.* into d from public.developments dv join public.units u on u.development_id = dv.id where u.id = p_unit_id;
  if not (p_category = any (d.client_ticket_categories)) then
    raise exception 'categoria indisponível para esta unidade' using errcode = '22023';
  end if;
  if p_category = 'assistencia_tecnica' then
    v_manual := public.unit_owner_manual(p_unit_id);
    if exists (select 1 from public.manual_warranty_items w where w.manual_id = v_manual) then
      select w.system || ' · ' || w.aspect || ' · ' || w.months || ' meses' into v_item
      from public.manual_warranty_items w
      where w.id = p_warranty_item_id and w.manual_id = v_manual and public.warranty_in_force(d.habite_se_date, w.months);
      if v_item is null then raise exception 'escolha um item ainda em garantia' using errcode = '22023'; end if;
    end if;
  end if;
  insert into public.tickets (client_id, unit_id, category, title, description, warranty_item, created_by)
  values (public.current_client_id(), p_unit_id, p_category, trim(p_title), trim(p_description), v_item, auth.uid())
  returning id, number into v_id, v_number;
  perform public.notify_staff('atendimento', 'chamado', 'Novo chamado #' || v_number, trim(p_title), '/admin/chamados/' || v_id, 'chamado:' || v_id || ':novo');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lembrete mensal de manutenção
-- ---------------------------------------------------------------------------
-- Uma notificação (e um e-mail) por unidade e mês, com as atividades do plano de manutenção que vencem no mês,
-- contadas a partir do mês do habite-se. Atividades diárias a quinzenais, plurianuais e "conforme" ficam no
-- manual. Chamado todo dia pelo cron; a chave de deduplicação garante um envio por mês.
create or replace function public.queue_maintenance_reminders(p_today date default null) returns integer  -- avisos novos
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date);
  v_month text := to_char(v_today, 'YYYY-MM');
  v_label text := (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from v_today)::int];
  r record; v_n int := 0;
begin
  for r in
    with units as (
      select cu.unit_id, cl.user_id, un.code, d.habite_se_date as habite, public.unit_owner_manual(cu.unit_id) as manual_id,
             (extract(year from v_today) * 12 + extract(month from v_today))
               - (extract(year from d.habite_se_date) * 12 + extract(month from d.habite_se_date)) as elapsed
      from public.client_units cu
      join public.clients cl on cl.id = cu.client_id and cl.user_id is not null
      join public.units un on un.id = cu.unit_id
      join public.developments d on d.id = un.development_id
      where cu.active and d.client_portal_enabled and 'manual' = any (d.client_tabs) and d.habite_se_date is not null
    )
    select x.unit_id, x.user_id, x.code, count(*) as n,
           string_agg(distinct t.system, ', ' order by t.system) as systems
    from units x
    join public.manual_maintenance_tasks t on t.manual_id = x.manual_id
    where x.elapsed > 0 and x.elapsed % case t.frequency
            when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 end = 0
    group by 1, 2, 3
  loop
    continue when exists (select 1 from public.notifications n where n.dedupe_key = 'manutencao:' || r.unit_id || ':' || v_month || ':' || r.user_id);
    perform public.notify_user(
      r.user_id, 'manutencao',
      'Manutenções de ' || v_label || ' · unidade ' || r.code,
      r.n || case when r.n = 1 then ' atividade' else ' atividades' end || ' do plano de manutenção neste mês: ' || left(r.systems, 220)
        || '. Manter as manutenções em dia é condição para a garantia.',
      '/cliente/unidades/' || r.unit_id || '/manual/proprietario/manutencao',
      'manutencao:' || r.unit_id || ':' || v_month);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.queue_maintenance_reminders(date) from public, anon, authenticated;
