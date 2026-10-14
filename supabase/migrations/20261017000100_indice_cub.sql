-- OUZ Experience — Financeiro corrigido pelo CUB-SC (o app passa a ser a fonte do fluxo de pagamentos).
-- Regra (igual às planilhas da OUZ): parcela em CUBs = valor original ÷ CUB-base do contrato;
-- parcela reajustada = CUBs × CUB do mês do vencimento. Sem CUB do mês, usa o último CUB cadastrado
-- e marca como ESTIMATIVA. Juros e multa informados somam-se ao reajustado. Parcelas pagas ficam congeladas.

create table public.index_values (
  index_name text not null check (index_name in ('CUB-SC')),
  reference_month date not null check (extract(day from reference_month) = 1),
  value numeric(12,2) not null check (value > 0),
  source_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (index_name, reference_month)
);
alter table public.index_values enable row level security;
create policy index_values_staff on public.index_values for select to authenticated using (public.has_staff_permission('financeiro'));
revoke insert, update, delete on public.index_values from authenticated, anon;

alter table public.financial_contracts
  add column index_name text check (index_name in ('CUB-SC')),
  add column base_index_value numeric(12,2) check (base_index_value > 0),
  add constraint financial_contracts_index_ck check ((index_name is null) = (base_index_value is null));

alter table public.installments
  add column indexed boolean not null default false,          -- "S/N" da planilha: reajusta pelo índice?
  add column index_quantity numeric(20,10) check (index_quantity > 0),  -- valor em CUBs
  add column index_month date,                                -- mês do CUB aplicado
  add column index_value numeric(12,2),                       -- CUB aplicado
  add column is_estimate boolean not null default false;      -- CUB do mês ainda não cadastrado

-- Parcela das chaves pode não ter data: vence na entrega (como a linha "FINAL" das planilhas).
alter table public.installments alter column due_date drop not null,
  add constraint installments_due_ck check (due_date is not null or kind = 'chaves');

-- A view usa i.*: recriada para incluir as novas colunas.
drop view public.installments_view;
create view public.installments_view with (security_invoker = true) as
  select i.*,
         case
           when i.status in ('paga', 'cancelada', 'renegociada') then i.status::text
           when i.due_date < (now() at time zone 'America/Sao_Paulo')::date then 'vencida'
           when i.status = 'parcialmente_paga' then 'parcialmente_paga'
           else 'a_vencer'
         end as display_status
  from public.installments i;
revoke all on public.installments_view from anon;
grant select on public.installments_view to authenticated;

-- Recalcula parcelas em aberto de contratos indexados (todos, ou só um contrato).
create or replace function public._recalc_indexed_installments(p_contract_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_month date; v_val numeric; v_est boolean; v_upd numeric; n int := 0;
begin
  for r in
    select i.id, i.due_date, i.original_amount, i.indexed, i.index_quantity, c.index_name,
           coalesce(i.interest, 0) + coalesce(i.fine, 0) as extras
      from public.installments i join public.financial_contracts c on c.id = i.contract_id
     where c.index_name is not null and i.index_quantity is not null
       and i.status in ('aberta', 'parcialmente_paga')
       and (p_contract_id is null or c.id = p_contract_id)
  loop
    if not r.indexed then
      update public.installments set updated_amount = original_amount + r.extras, monetary_update = null,
             index_month = null, index_value = null, is_estimate = false where id = r.id;
    else
      v_month := date_trunc('month', r.due_date)::date;
      select value into v_val from public.index_values where index_name = r.index_name and reference_month = v_month;
      v_est := v_val is null;
      if v_est then
        select reference_month, value into v_month, v_val from public.index_values
         where index_name = r.index_name order by reference_month desc limit 1;
      end if;
      if v_val is null then
        update public.installments set updated_amount = null, monetary_update = null, index_month = null,
               index_value = null, is_estimate = true where id = r.id;
      else
        v_upd := round(r.index_quantity * v_val, 2);
        update public.installments set updated_amount = v_upd + r.extras, monetary_update = v_upd - r.original_amount,
               index_month = v_month, index_value = v_val, is_estimate = v_est where id = r.id;
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._recalc_indexed_installments(uuid) from public, anon, authenticated;

-- Financeiro cadastra o CUB do mês; parcelas em aberto são recalculadas na hora.
create or replace function public.admin_set_index_value(p_index text, p_month date, p_value numeric, p_note text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month', p_month)::date; v_prev numeric; n int;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_index is distinct from 'CUB-SC' then raise exception 'índice não suportado' using errcode = '22023'; end if;
  if p_value is null or p_value <= 0 then raise exception 'informe o valor do índice' using errcode = '22023'; end if;
  if v_month > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'não é possível cadastrar índice de mês futuro' using errcode = '22023';
  end if;
  select value into v_prev from public.index_values where index_name = p_index and reference_month = v_month;
  insert into public.index_values (index_name, reference_month, value, source_note, created_by)
  values (p_index, v_month, p_value, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (index_name, reference_month) do update set value = excluded.value, source_note = excluded.source_note,
    created_by = excluded.created_by, created_at = now();
  n := public._recalc_indexed_installments(null);
  perform public.write_audit('indice_cadastrado', 'index_values', p_index || ':' || v_month,
    jsonb_build_object('valor', p_value, 'anterior', v_prev, 'parcelas_recalculadas', n), p_note);
  return n;
end $$;

-- Configura (ou remove) a correção pelo índice num contrato existente.
create or replace function public.admin_set_contract_index(p_contract_id uuid, p_index text, p_base numeric) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_index is not null and (p_index <> 'CUB-SC' or p_base is null or p_base <= 0) then
    raise exception 'informe o índice e o CUB-base do contrato' using errcode = '22023';
  end if;
  update public.financial_contracts set index_name = p_index, base_index_value = case when p_index is null then null else p_base end
   where id = p_contract_id;
  if not found then raise exception 'contrato não encontrado' using errcode = '22023'; end if;
  return public._recalc_indexed_installments(p_contract_id);
end $$;

-- Lança parcela indexada: CUBs calculados a partir do CUB-base do contrato.
create or replace function public.admin_add_indexed_installment(p_contract_id uuid, p_number int, p_kind public.installment_kind,
                                                                p_due date, p_original numeric, p_indexed boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.financial_contracts; v_id uuid;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into c from public.financial_contracts where id = p_contract_id;
  if c.id is null or c.index_name is null then raise exception 'contrato sem índice configurado' using errcode = '22023'; end if;
  if p_original is null or p_original <= 0 or p_number is null or (p_due is null and p_kind is distinct from 'chaves') then raise exception 'dados da parcela incompletos' using errcode = '22023'; end if;
  insert into public.installments (contract_id, number, kind, due_date, original_amount, indexed, index_quantity)
  values (p_contract_id, p_number, coalesce(p_kind, 'parcela'), p_due, p_original, coalesce(p_indexed, true), p_original / c.base_index_value)
  returning id into v_id;
  perform public._recalc_indexed_installments(p_contract_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Importação única do fluxo de pagamentos (planilha "Fluxo de Pagamentos" por empreendimento).
-- Executada SOMENTE pelo script do servidor (scripts/importar-fluxo-cub.mjs), nunca pelo navegador.
-- Tudo ou nada. Não guarda CPF/CNPJ nem endereço (minimização — LGPD).
-- payload = { development_id, file_name,
--   index_values: [{month, value}],
--   clients: [{ ref, unit_code, parking, full_name, email, phone, contract_value, base_index, note,
--               installments: [{number, kind, due_date|null, original_amount, indexed, index_quantity, paid, paid_amount}] }] }
-- index_quantity vem da planilha (já descontadas antecipações, quando houver).
-- ---------------------------------------------------------------------------
create or replace function public.import_indexed_flow(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev uuid := (p ->> 'development_id')::uuid; c jsonb; i jsonb; iv jsonb;
  v_unit uuid; v_client uuid; v_contract uuid; v_email text;
  n_units int := 0; n_clients int := 0; n_inst int := 0; n_idx int := 0;
begin
  if not exists (select 1 from public.developments where id = v_dev) then raise exception 'empreendimento não encontrado' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'clients') <> 'array' or jsonb_array_length(p -> 'clients') = 0 then raise exception 'nenhum cliente no arquivo' using errcode = '22023'; end if;

  for iv in select * from jsonb_array_elements(coalesce(p -> 'index_values', '[]')) loop
    insert into public.index_values (index_name, reference_month, value, source_note)
    values ('CUB-SC', (iv ->> 'month')::date, (iv ->> 'value')::numeric, 'importado de ' || coalesce(p ->> 'file_name', 'planilha'))
    on conflict (index_name, reference_month) do update set value = excluded.value, source_note = excluded.source_note;
    n_idx := n_idx + 1;
  end loop;

  for c in select * from jsonb_array_elements(p -> 'clients') loop
    v_email := lower(trim(c ->> 'email'));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'e-mail inválido (%)', c ->> 'ref' using errcode = '22023'; end if;

    select id into v_unit from public.units where development_id = v_dev and code = c ->> 'unit_code';
    if v_unit is null then
      insert into public.units (development_id, code, status, data_source, external_ref)
      values (v_dev, c ->> 'unit_code', 'vendida', 'importacao', c ->> 'ref') returning id into v_unit;
      n_units := n_units + 1;
    else
      update public.units set status = 'vendida' where id = v_unit;
    end if;
    if exists (select 1 from public.financial_contracts where unit_id = v_unit) then
      raise exception 'unidade % já tem financeiro cadastrado: nada foi importado', c ->> 'unit_code' using errcode = '22023';
    end if;

    select id into v_client from public.clients where email = v_email and not is_demo limit 1;
    if v_client is null then
      insert into public.clients (full_name, email, phone, data_source, external_ref)
      values (trim(c ->> 'full_name'), v_email, nullif(trim(coalesce(c ->> 'phone', '')), ''), 'importacao', c ->> 'ref')
      returning id into v_client;
      n_clients := n_clients + 1;
    end if;
    insert into public.client_units (client_id, unit_id, relation) values (v_client, v_unit, 'titular')
    on conflict (client_id, unit_id) do update set active = true, unlinked_at = null;

    insert into public.financial_contracts (unit_id, contract_value, notes, data_source, external_ref, index_name, base_index_value)
    values (v_unit, (c ->> 'contract_value')::numeric, nullif(c ->> 'note', ''), 'importacao', c ->> 'ref', 'CUB-SC', (c ->> 'base_index')::numeric)
    returning id into v_contract;

    for i in select * from jsonb_array_elements(c -> 'installments') loop
      insert into public.installments (contract_id, number, kind, due_date, original_amount, indexed, index_quantity,
                                       updated_amount, monetary_update, paid_amount, status, data_source)
      values (v_contract, (i ->> 'number')::int, (i ->> 'kind')::public.installment_kind, (i ->> 'due_date')::date,
              (i ->> 'original_amount')::numeric, (i ->> 'indexed')::boolean, (i ->> 'index_quantity')::numeric,
              case when (i ->> 'paid')::boolean then (i ->> 'paid_amount')::numeric end,
              case when (i ->> 'paid')::boolean then nullif((i ->> 'paid_amount')::numeric - (i ->> 'original_amount')::numeric, 0) end,
              case when (i ->> 'paid')::boolean then (i ->> 'paid_amount')::numeric else 0 end,
              case when (i ->> 'paid')::boolean then 'paga'::public.installment_status else 'aberta'::public.installment_status end,
              'importacao');
      n_inst := n_inst + 1;
    end loop;
  end loop;

  perform public._recalc_indexed_installments(null);
  insert into public.financial_imports (file_name, rows_count, summary)
  values (p ->> 'file_name', n_inst, jsonb_build_object('tipo', 'fluxo_cub', 'unidades_criadas', n_units, 'clientes_criados', n_clients,
                                                         'parcelas', n_inst, 'indices', n_idx));
  return jsonb_build_object('unidades_criadas', n_units, 'clientes_criados', n_clients, 'parcelas', n_inst, 'indices', n_idx);
end $$;
revoke all on function public.import_indexed_flow(jsonb) from public, anon, authenticated;
