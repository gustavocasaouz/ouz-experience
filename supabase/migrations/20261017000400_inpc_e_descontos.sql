-- OUZ Experience — (1) INPC após o Habite-se e (2) regras de desconto em reais e desconto condicionado.
--
-- (1) Contratos com "índice após o Habite-se" = INPC: até o mês do Habite-se a parcela segue o CUB do mês do
--     vencimento; depois, fica em CUBs × CUB do mês do Habite-se, corrigida pelo INPC acumulado dos meses
--     seguintes ao Habite-se até o mês anterior ao vencimento (variações mensais publicadas pelo IBGE).
--     Faltando INPC de algum mês, o valor é ESTIMATIVA (com os meses já publicados). Parcela das chaves sem data
--     usa o mês corrente. Parcelas pagas ficam congeladas.

alter table public.index_values drop constraint index_values_index_name_check;
alter table public.index_values drop constraint index_values_value_check;
alter table public.index_values alter column value type numeric(12,4);
alter table public.index_values
  add constraint index_values_index_name_check check (index_name in ('CUB-SC', 'INPC')),
  add constraint index_values_value_check check (
    (index_name = 'CUB-SC' and value > 0) or (index_name = 'INPC' and value between -50 and 50));
comment on column public.index_values.value is 'CUB-SC: valor em R$/m². INPC: variação mensal em %.';

alter table public.developments add column habite_se_date date;
alter table public.financial_contracts add column post_habite_index text check (post_habite_index in ('INPC'));
alter table public.installments add column inpc_factor numeric(16,10);

create or replace function public._recalc_indexed_installments(p_contract_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_month date; v_val numeric; v_est boolean; v_principal numeric; v_open numeric;
  v_int numeric; v_fine numeric; v_days int; n int := 0; v_h date; v_ref date; v_factor numeric; v_need int; v_have int;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in
    select i.id, i.due_date, i.original_amount, i.indexed, i.index_quantity, i.paid_amount, i.interest, i.fine,
           c.index_name, c.late_interest_monthly_pct as li, c.late_fine_pct as lf, c.post_habite_index, d.habite_se_date
      from public.installments i
      join public.financial_contracts c on c.id = i.contract_id
      join public.units u on u.id = c.unit_id
      join public.developments d on d.id = u.development_id
     where c.index_name is not null and i.index_quantity is not null
       and i.status in ('aberta', 'parcialmente_paga')
       and (p_contract_id is null or c.id = p_contract_id)
  loop
    v_month := null; v_val := null; v_est := false; v_factor := null;
    v_h := case when r.post_habite_index is not null and r.habite_se_date is not null then date_trunc('month', r.habite_se_date)::date end;
    v_ref := date_trunc('month', coalesce(r.due_date, v_today))::date;
    if not r.indexed then
      v_principal := r.original_amount;
    else
      -- CUB do mês do vencimento; após o Habite-se, CUB do mês do Habite-se.
      v_month := case when v_h is not null and v_ref > v_h then v_h else date_trunc('month', r.due_date)::date end;
      select value into v_val from public.index_values where index_name = r.index_name and reference_month = v_month;
      v_est := v_val is null;
      if v_est then
        select reference_month, value into v_month, v_val from public.index_values
         where index_name = r.index_name order by reference_month desc limit 1;
      end if;
      v_principal := case when v_val is null then null else r.index_quantity * v_val end;
      if v_principal is not null and v_h is not null and v_ref > v_h then
        v_need := (extract(year from age(v_ref, v_h)) * 12 + extract(month from age(v_ref, v_h)))::int - 1;
        select count(*), coalesce(exp(sum(ln(1 + value / 100))), 1) into v_have, v_factor
          from public.index_values
         where index_name = r.post_habite_index and reference_month > v_h and reference_month < v_ref;
        v_est := v_est or v_have < v_need;
        v_principal := v_principal * v_factor;
      end if;
      v_principal := round(v_principal, 2);
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
      v_days := null; v_int := r.interest; v_fine := r.fine;
    end if;

    update public.installments
       set updated_amount = case when v_principal is null then null else v_principal + coalesce(v_int, 0) + coalesce(v_fine, 0) end,
           monetary_update = case when r.indexed and v_principal is not null then v_principal - r.original_amount end,
           index_month = case when r.indexed then v_month end,
           index_value = case when r.indexed then v_val end,
           inpc_factor = case when r.indexed then v_factor end,
           is_estimate = r.indexed and v_est,
           interest = nullif(v_int, 0), fine = nullif(v_fine, 0), late_days = nullif(v_days, 0)
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._recalc_indexed_installments(uuid) from public, anon, authenticated;

create or replace function public.admin_set_index_value(p_index text, p_month date, p_value numeric, p_note text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month', p_month)::date; v_prev numeric; n int;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_index is null or p_index not in ('CUB-SC', 'INPC') then raise exception 'índice não suportado' using errcode = '22023'; end if;
  if p_value is null or (p_index = 'CUB-SC' and p_value <= 0) or (p_index = 'INPC' and p_value not between -50 and 50) then
    raise exception 'informe o valor do índice (INPC: variação mensal em %%)' using errcode = '22023';
  end if;
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

-- Data do Habite-se do empreendimento (financeiro): a partir dela, contratos com INPC passam a ser corrigidos pelo INPC.
create or replace function public.admin_set_habite_se(p_development_id uuid, p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.developments set habite_se_date = p_date where id = p_development_id;
  if not found then raise exception 'empreendimento não encontrado' using errcode = '22023'; end if;
  perform public.write_audit('habite_se', 'developments', p_development_id::text, jsonb_build_object('data', p_date), null, p_development_id);
  return public._recalc_indexed_installments(null);
end $$;

create or replace function public.admin_set_contract_post_index(p_contract_id uuid, p_index text) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_index is not null and p_index <> 'INPC' then raise exception 'índice não suportado' using errcode = '22023'; end if;
  update public.financial_contracts set post_habite_index = p_index where id = p_contract_id;
  if not found then raise exception 'contrato não encontrado' using errcode = '22023'; end if;
  return public._recalc_indexed_installments(p_contract_id);
end $$;

-- Encargos: ao desligar os automáticos, zera juros/multa calculados das parcelas em aberto (não ficam como "informados").
create or replace function public.admin_set_contract_charges(p_contract_id uuid, p_interest_pct numeric, p_fine_pct numeric) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_was numeric;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if (p_interest_pct is null) <> (p_fine_pct is null) or p_interest_pct < 0 or p_fine_pct < 0 then
    raise exception 'informe juros e multa (ou deixe ambos vazios)' using errcode = '22023';
  end if;
  if p_interest_pct is not null and not exists (select 1 from public.financial_contracts where id = p_contract_id and index_name is not null) then
    raise exception 'encargos automáticos exigem contrato com correção pelo CUB configurada' using errcode = '22023';
  end if;
  select late_interest_monthly_pct into v_was from public.financial_contracts where id = p_contract_id;
  update public.financial_contracts set late_interest_monthly_pct = p_interest_pct, late_fine_pct = p_fine_pct where id = p_contract_id;
  if not found then raise exception 'contrato não encontrado' using errcode = '22023'; end if;
  if p_interest_pct is null and v_was is not null then
    update public.installments set interest = null, fine = null, late_days = null
     where contract_id = p_contract_id and status in ('aberta', 'parcialmente_paga');
  end if;
  perform public.write_audit('encargos_atraso', 'financial_contracts', p_contract_id::text,
    jsonb_build_object('juros_mes', p_interest_pct, 'multa', p_fine_pct));
  return public._recalc_indexed_installments(p_contract_id);
end $$;

-- Importação: payload.post_habite_index = 'INPC' (opcional).
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
                                            late_interest_monthly_pct, late_fine_pct, post_habite_index)
    values (v_unit, (c ->> 'contract_value')::numeric, nullif(c ->> 'note', ''), 'importacao', c ->> 'ref', 'CUB-SC', (c ->> 'base_index')::numeric,
            (p #>> '{late_charges,interest_monthly_pct}')::numeric, (p #>> '{late_charges,fine_pct}')::numeric, p ->> 'post_habite_index')
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

-- (2) Regras de desconto: desconto_maximo_valor (R$) e desconto condicionado
--     (desconto_condicional_valor, desconto_condicional_entrada_minima, desconto_condicional_somente_entrada_e_chaves).
create or replace function public.evaluate_terms(
  p_rules jsonb, p_table_price numeric, p_offered numeric, p_payments jsonb,
  p_keys_date date, p_ref_date date, p_person_type public.person_type
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  r jsonb := coalesce(p_rules, '{}'::jsonb);
  c jsonb := '[]'::jsonb;
  v_total numeric; v_entrada numeric; v_ate_chaves numeric; v_permuta numeric;
  v_last date; v_parcelas int; v_reforcos int; v_struct text;
  v_lim numeric;
begin
  v_struct := public.validate_payments(p_payments, p_offered, p_ref_date);
  c := c || jsonb_build_array(jsonb_build_object('code', 'estrutura', 'label', 'Condições consistentes com o valor ofertado',
         'ok', v_struct is null, 'detail', v_struct));
  if v_struct is not null then
    return jsonb_build_object('within', false, 'criteria', c, 'requires_analysis', false);
  end if;

  with sched as (
    select p ->> 'kind' as kind,
           ((p ->> 'first_due')::date + make_interval(months => g * coalesce((p ->> 'interval_months')::int, 1)))::date as due,
           (p ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_payments) p, generate_series(0, coalesce((p ->> 'quantity')::int, 1) - 1) g
  )
  select sum(amount),
         coalesce(sum(amount) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount) filter (where kind not in ('chaves', 'permuta') and p_keys_date is not null and due < p_keys_date), 0),
         coalesce(sum(amount) filter (where kind = 'permuta'), 0),
         max(due)
    into v_total, v_entrada, v_ate_chaves, v_permuta, v_last
  from sched;
  select coalesce(sum(coalesce((p ->> 'quantity')::int, 1)) filter (where p ->> 'kind' = 'parcela'), 0),
         coalesce(sum(coalesce((p ->> 'quantity')::int, 1)) filter (where p ->> 'kind' = 'reforco'), 0)
    into v_parcelas, v_reforcos
  from jsonb_array_elements(p_payments) p;

  -- preço de tabela
  c := c || jsonb_build_array(jsonb_build_object('code', 'tabela', 'label', 'Unidade com preço na tabela vigente',
         'ok', case when p_table_price is null then null else true end,
         'detail', case when p_table_price is null then 'Sem preço vigente: exige análise da OUZ.' else null end));

  if r ? 'preco_minimo' then
    v_lim := (r ->> 'preco_minimo')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'preco_minimo', 'label', 'Preço mínimo',
           'ok', p_offered >= v_lim, 'limit', v_lim, 'value', p_offered));
  end if;
  if r ? 'desconto_maximo_percentual' then
    v_lim := (r ->> 'desconto_maximo_percentual')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'desconto_maximo', 'label', 'Desconto máximo sobre a tabela (%)',
           'ok', case when p_table_price is null then null else p_offered >= round(p_table_price * (1 - v_lim / 100), 2) end,
           'limit', v_lim,
           'value', case when p_table_price is null then null else round((1 - p_offered / p_table_price) * 100, 2) end));
  end if;
  if r ? 'desconto_maximo_valor' then
    v_lim := (r ->> 'desconto_maximo_valor')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'desconto_maximo_valor', 'label', 'Desconto máximo sobre a tabela (R$)',
           'ok', case when p_table_price is null then null else p_offered >= p_table_price - v_lim end,
           'limit', v_lim, 'value', case when p_table_price is null then null else greatest(p_table_price - p_offered, 0) end));
  end if;
  -- Desconto condicionado: sem desconto, sempre ok; com desconto, só até o valor e se as condições forem atendidas
  -- (ex.: MAUI — até R$ 150 mil com entrada de 30% ou mais e saldo nas chaves).
  if r ? 'desconto_condicional_valor' then
    v_lim := (r ->> 'desconto_condicional_valor')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'desconto_condicional',
           'label', 'Desconto condicionado à entrada' || case when coalesce((r ->> 'desconto_condicional_somente_entrada_e_chaves')::boolean, false) then ' e saldo nas chaves' else '' end,
           'ok', case when p_table_price is null then null
                      when p_offered >= p_table_price then true
                      else p_table_price - p_offered <= v_lim
                           and round(v_entrada / p_offered * 100, 2) >= coalesce((r ->> 'desconto_condicional_entrada_minima')::numeric, 0)
                           and (not coalesce((r ->> 'desconto_condicional_somente_entrada_e_chaves')::boolean, false)
                                or not exists (select 1 from jsonb_array_elements(p_payments) x where x ->> 'kind' not in ('entrada', 'chaves')))
                 end,
           'limit', v_lim, 'value', case when p_table_price is null then null else greatest(p_table_price - p_offered, 0) end));
  end if;
  if r ? 'entrada_minima_percentual' then
    v_lim := (r ->> 'entrada_minima_percentual')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'entrada_minima', 'label', 'Entrada mínima (%)',
           'ok', round(v_entrada / p_offered * 100, 2) >= v_lim, 'limit', v_lim, 'value', round(v_entrada / p_offered * 100, 2)));
  end if;
  if r ? 'percentual_minimo_ate_chaves' then
    v_lim := (r ->> 'percentual_minimo_ate_chaves')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'ate_chaves', 'label', 'Percentual pago até as chaves (%)',
           'ok', case when p_keys_date is null then null else round(v_ate_chaves / p_offered * 100, 2) >= v_lim end,
           'limit', v_lim,
           'value', case when p_keys_date is null then null else round(v_ate_chaves / p_offered * 100, 2) end,
           'detail', case when p_keys_date is null then 'Previsão de chaves não informada pela OUZ.' else null end));
  end if;
  if r ? 'prazo_maximo_meses' then
    v_lim := (r ->> 'prazo_maximo_meses')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'prazo_maximo', 'label', 'Prazo máximo (meses)',
           'ok', v_last <= (p_ref_date + make_interval(months => v_lim::int))::date, 'limit', v_lim,
           'value', (extract(year from age(v_last, p_ref_date)) * 12 + extract(month from age(v_last, p_ref_date)))::int));
  end if;
  if r ? 'parcelas_max_quantidade' then
    v_lim := (r ->> 'parcelas_max_quantidade')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'parcelas_max', 'label', 'Quantidade máxima de parcelas',
           'ok', v_parcelas <= v_lim, 'limit', v_lim, 'value', v_parcelas));
  end if;
  if r ? 'reforcos_max_quantidade' then
    v_lim := (r ->> 'reforcos_max_quantidade')::numeric;
    c := c || jsonb_build_array(jsonb_build_object('code', 'reforcos_max', 'label', 'Quantidade máxima de reforços',
           'ok', v_reforcos <= v_lim, 'limit', v_lim, 'value', v_reforcos));
  end if;
  if v_permuta > 0 then
    c := c || jsonb_build_array(jsonb_build_object('code', 'permuta', 'label', 'Permuta permitida',
           'ok', coalesce((r ->> 'permuta_permitida')::boolean, false)));
    if r ? 'permuta_max_percentual' then
      v_lim := (r ->> 'permuta_max_percentual')::numeric;
      c := c || jsonb_build_array(jsonb_build_object('code', 'permuta_max', 'label', 'Permuta máxima (%)',
             'ok', round(v_permuta / p_offered * 100, 2) <= v_lim, 'limit', v_lim, 'value', round(v_permuta / p_offered * 100, 2)));
    end if;
  end if;
  if coalesce((r ->> 'sempre_exigir_analise')::boolean, false)
     or (v_permuta > 0 and coalesce((r ->> 'exigir_analise_com_permuta')::boolean, false))
     or (p_person_type = 'pj' and coalesce((r ->> 'exigir_analise_pessoa_juridica')::boolean, false)) then
    c := c || jsonb_build_array(jsonb_build_object('code', 'analise_obrigatoria', 'label', 'Condição que exige análise da OUZ', 'ok', false));
  end if;

  return jsonb_build_object(
    'within', not exists (select 1 from jsonb_array_elements(c) x where (x ->> 'ok') is distinct from 'true'),
    'criteria', c,
    'totals', jsonb_build_object('total', v_total, 'entrada', v_entrada, 'ate_chaves', v_ate_chaves, 'permuta', v_permuta,
                                 'ultimo_vencimento', v_last, 'parcelas', v_parcelas, 'reforcos', v_reforcos)
  );
end $$;

