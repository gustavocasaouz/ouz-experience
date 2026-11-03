-- OUZ Experience — catálogo de personalização por empreendimento (03/11/2026).
--
-- Cada item (ex.: "Piso das áreas sociais") tem o padrão da construtora e os upgrades, com o custo adicional.
-- O cliente marca as escolhas da unidade e as envia à OUZ: o envio vira uma solicitação de personalização
-- comum (customization_requests), que segue o fluxo de análise e orçamento que já existe.
-- Os valores são de referência: o orçamento final é sempre o que a OUZ envia.

create table public.customization_items (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments (id) on delete cascade,
  category text not null check (length(trim(category)) between 2 and 60),
  title text not null check (length(trim(title)) between 2 and 120),
  description text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customization_items_dev on public.customization_items (development_id, sort_order);
create trigger customization_items_updated before update on public.customization_items
  for each row execute function public.set_updated_at();
create trigger customization_items_audit after insert or update or delete on public.customization_items
  for each row execute function public.audit_row_change();

create table public.customization_choices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.customization_items (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_standard boolean not null default false,
  sort_order int not null default 0
);
create index customization_choices_item on public.customization_choices (item_id, sort_order);
create unique index customization_choices_one_standard on public.customization_choices (item_id) where is_standard;
create trigger customization_choices_audit after insert or update or delete on public.customization_choices
  for each row execute function public.audit_row_change();

create table public.customization_selections (
  unit_id uuid not null references public.units (id) on delete cascade,
  item_id uuid not null references public.customization_items (id) on delete cascade,
  choice_id uuid not null references public.customization_choices (id) on delete cascade,
  selected_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (unit_id, item_id)
);

alter table public.customization_items enable row level security;
alter table public.customization_choices enable row level security;
alter table public.customization_selections enable row level security;

create policy customization_items_client on public.customization_items for select to authenticated
  using (is_published and public.is_client_of_development(development_id));
create policy customization_items_staff on public.customization_items for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
create policy customization_items_atendimento on public.customization_items for select to authenticated
  using (public.has_staff_permission('atendimento'));
create policy customization_choices_client on public.customization_choices for select to authenticated
  using (exists (select 1 from public.customization_items i where i.id = item_id and i.is_published and public.is_client_of_development(i.development_id)));
create policy customization_choices_staff on public.customization_choices for all to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
create policy customization_choices_atendimento on public.customization_choices for select to authenticated
  using (public.has_staff_permission('atendimento'));
create policy customization_selections_client on public.customization_selections for select to authenticated
  using (public.is_client_of_unit(unit_id));
create policy customization_selections_staff on public.customization_selections for select to authenticated
  using (public.has_staff_permission('atendimento'));

revoke all on public.customization_items, public.customization_choices, public.customization_selections from anon;
revoke insert, update, delete on public.customization_selections from authenticated;

-- "12.000,00" (independe do locale do banco).
create or replace function public.format_brl(p numeric) returns text
language sql immutable set search_path = '' as $$ select translate(to_char(p, 'FM999,999,990.00'), ',.', '.,') $$;

-- Escolha do cliente para um item (o padrão também é uma escolha registrada).
create or replace function public.client_choose_customization(p_unit_id uuid, p_choice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_item uuid;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select i.id into v_item from public.customization_choices c
  join public.customization_items i on i.id = c.item_id and i.is_published
  join public.units u on u.id = p_unit_id and u.development_id = i.development_id
  join public.developments d on d.id = i.development_id and 'personalizacao' = any (d.client_tabs)
  where c.id = p_choice_id;
  if v_item is null then raise exception 'opção indisponível para esta unidade' using errcode = '22023'; end if;
  insert into public.customization_selections (unit_id, item_id, choice_id, selected_by)
  values (p_unit_id, v_item, p_choice_id, auth.uid())
  on conflict (unit_id, item_id) do update set choice_id = excluded.choice_id, selected_by = excluded.selected_by, updated_at = now();
end $$;

-- Envia as escolhas com upgrade à OUZ como uma solicitação de personalização.
create or replace function public.client_submit_customization_choices(p_unit_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_body text; v_total numeric; v_id uuid;
begin
  if not public.is_client_of_unit(p_unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  select string_agg(i.category || ' · ' || i.title || ': ' || c.title || ' (+ R$ ' || public.format_brl(c.price) || ')', E'\n' order by i.sort_order, i.title),
         sum(c.price)
    into v_body, v_total
  from public.customization_selections s
  join public.customization_items i on i.id = s.item_id and i.is_published
  join public.customization_choices c on c.id = s.choice_id
  where s.unit_id = p_unit_id and not c.is_standard and c.price > 0;
  if v_body is null then raise exception 'escolha ao menos um upgrade antes de enviar' using errcode = '22023'; end if;
  insert into public.customization_requests (unit_id, client_id, title, description)
  values (p_unit_id, public.current_client_id(), 'Escolhas do catálogo de personalização',
          left(v_body, 3800) || E'\n\nTotal de referência: R$ ' || public.format_brl(v_total))
  returning id into v_id;
  perform public.notify_staff('atendimento', 'personalizacao', 'Escolhas de personalização enviadas', 'Total de referência: R$ ' || public.format_brl(v_total),
    '/admin/personalizacoes/' || v_id, 'personalizacao:' || v_id || ':nova');
  return v_id;
end $$;
revoke execute on function public.client_choose_customization(uuid, uuid), public.client_submit_customization_choices(uuid) from public, anon;
