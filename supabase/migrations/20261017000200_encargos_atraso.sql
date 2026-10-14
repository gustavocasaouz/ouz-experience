-- OUZ Experience — Encargos de atraso automáticos (juros pro rata die + multa moratória), atualizados todo dia.
-- Configurados por contrato (ex.: MAUI: juros de 1% ao mês pro rata die e multa de 2% sobre o débito).
-- Juros simples: saldo da parcela (já corrigido pelo CUB) × juros% ÷ 30 × dias de atraso.
-- Multa: (saldo + juros) × multa%. Parcela paga deixa de acumular (fica congelada).
-- Contratos sem encargos configurados mantêm juros/multa informados manualmente pela OUZ.

alter table public.financial_contracts
  add column late_interest_monthly_pct numeric(6,3) check (late_interest_monthly_pct >= 0),
  add column late_fine_pct numeric(6,3) check (late_fine_pct >= 0),
  add constraint financial_contracts_late_ck check ((late_interest_monthly_pct is null) = (late_fine_pct is null));

alter table public.installments add column late_days integer;  -- dias de atraso considerados no último cálculo

create or replace function public._recalc_indexed_installments(p_contract_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_month date; v_val numeric; v_est boolean; v_principal numeric; v_open numeric;
  v_int numeric; v_fine numeric; v_days int; n int := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in
    select i.id, i.due_date, i.original_amount, i.indexed, i.index_quantity, i.paid_amount, i.interest, i.fine,
           c.index_name, c.late_interest_monthly_pct as li, c.late_fine_pct as lf
      from public.installments i join public.financial_contracts c on c.id = i.contract_id
     where c.index_name is not null and i.index_quantity is not null
       and i.status in ('aberta', 'parcialmente_paga')
       and (p_contract_id is null or c.id = p_contract_id)
  loop
    v_month := null; v_val := null; v_est := false;
    if not r.indexed then
      v_principal := r.original_amount;
    else
      v_month := date_trunc('month', r.due_date)::date;
      select value into v_val from public.index_values where index_name = r.index_name and reference_month = v_month;
      v_est := v_val is null;
      if v_est then
        select reference_month, value into v_month, v_val from public.index_values
         where index_name = r.index_name order by reference_month desc limit 1;
      end if;
      v_principal := case when v_val is null then null else round(r.index_quantity * v_val, 2) end;
    end if;

    if r.li is not null then
      v_days := case when r.due_date is not null and r.due_date < v_today then v_today - r.due_date else 0 end;
      if v_days > 0 and v_principal is not null then
        v_open := greatest(v_principal - r.paid_amount, 0);
        v_int := round(v_open * r.li / 100 * v_days / 30.0, 2);
        v_fine := round((v_open + v_int) * r.lf / 100, 2);
      else
        v_int := null; v_fine := null;
      end if;
    else
      v_days := null; v_int := r.interest; v_fine := r.fine;   -- informados manualmente
    end if;

    update public.installments
       set updated_amount = case when v_principal is null then null else v_principal + coalesce(v_int, 0) + coalesce(v_fine, 0) end,
           monetary_update = case when r.indexed and v_principal is not null then v_principal - r.original_amount end,
           index_month = case when r.indexed then v_month end,
           index_value = case when r.indexed then v_val end,
           is_estimate = r.indexed and v_est,
           interest = nullif(v_int, 0), fine = nullif(v_fine, 0), late_days = nullif(v_days, 0)
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._recalc_indexed_installments(uuid) from public, anon, authenticated;

create or replace function public.admin_set_contract_charges(p_contract_id uuid, p_interest_pct numeric, p_fine_pct numeric) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if (p_interest_pct is null) <> (p_fine_pct is null) or p_interest_pct < 0 or p_fine_pct < 0 then
    raise exception 'informe juros e multa (ou deixe ambos vazios)' using errcode = '22023';
  end if;
  if p_interest_pct is not null and not exists (select 1 from public.financial_contracts where id = p_contract_id and index_name is not null) then
    raise exception 'encargos automáticos exigem contrato com correção pelo CUB configurada' using errcode = '22023';
  end if;
  update public.financial_contracts set late_interest_monthly_pct = p_interest_pct, late_fine_pct = p_fine_pct where id = p_contract_id;
  if not found then raise exception 'contrato não encontrado' using errcode = '22023'; end if;
  perform public.write_audit('encargos_atraso', 'financial_contracts', p_contract_id::text,
    jsonb_build_object('juros_mes', p_interest_pct, 'multa', p_fine_pct));
  return public._recalc_indexed_installments(p_contract_id);
end $$;

-- Importação: encargos do contrato vêm em payload.late_charges = {interest_monthly_pct, fine_pct}.
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

    insert into public.financial_contracts (unit_id, contract_value, notes, data_source, external_ref, index_name, base_index_value,
                                            late_interest_monthly_pct, late_fine_pct)
    values (v_unit, (c ->> 'contract_value')::numeric, nullif(c ->> 'note', ''), 'importacao', c ->> 'ref', 'CUB-SC', (c ->> 'base_index')::numeric,
            (p #>> '{late_charges,interest_monthly_pct}')::numeric, (p #>> '{late_charges,fine_pct}')::numeric)
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

-- Atualização diária dos encargos (00:05 em Brasília).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ouz-encargos-diarios', '5 3 * * *', 'select public._recalc_indexed_installments(null)');
  else
    raise notice 'pg_cron não habilitado: agende public._recalc_indexed_installments(null) diariamente.';
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;
