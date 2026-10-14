-- OUZ Experience — Fixar a correção monetária (CUB/INPC) a partir de um mês, por contrato ou por empreendimento.
-- Com a correção fixada em M, nenhum índice posterior a M é aplicado: a parcela fica no valor corrigido até M
-- (CUB do mês ≤ M; INPC acumulado só até M). Juros e multa de atraso continuam valendo. Pode ser desfeito.

alter table public.financial_contracts add column index_frozen_month date
  check (index_frozen_month is null or extract(day from index_frozen_month) = 1);

create or replace function public._recalc_indexed_installments(p_contract_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_month date; v_val numeric; v_est boolean; v_principal numeric; v_open numeric;
  v_int numeric; v_fine numeric; v_days int; n int := 0; v_h date; v_ref date; v_factor numeric; v_need int; v_have int;
  v_fz date; v_end date;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in
    select i.id, i.due_date, i.original_amount, i.indexed, i.index_quantity, i.paid_amount, i.interest, i.fine,
           c.index_name, c.late_interest_monthly_pct as li, c.late_fine_pct as lf, c.post_habite_index, d.habite_se_date,
           c.index_frozen_month
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
    v_fz := date_trunc('month', r.index_frozen_month)::date;   -- correção fixada: nenhum índice depois deste mês
    if not r.indexed then
      v_principal := r.original_amount;
    else
      -- CUB do mês do vencimento; após o Habite-se, CUB do mês do Habite-se.
      v_month := case when v_h is not null and v_ref > v_h then v_h else date_trunc('month', r.due_date)::date end;
      if v_fz is not null and (v_month is null or v_month > v_fz) then v_month := v_fz; end if;
      select value into v_val from public.index_values where index_name = r.index_name and reference_month = v_month;
      v_est := v_val is null;
      if v_est then
        select reference_month, value into v_month, v_val from public.index_values
         where index_name = r.index_name order by reference_month desc limit 1;
      end if;
      v_principal := case when v_val is null then null else r.index_quantity * v_val end;
      if v_principal is not null and v_h is not null and v_ref > v_h then
        v_end := (v_ref - interval '1 month')::date;
        if v_fz is not null and v_fz < v_end then v_end := v_fz; end if;
        v_need := greatest((extract(year from age(v_end, v_h)) * 12 + extract(month from age(v_end, v_h)))::int, 0);
        select count(*), coalesce(exp(sum(ln(1 + value / 100))), 1) into v_have, v_factor
          from public.index_values
         where index_name = r.post_habite_index and reference_month > v_h and reference_month <= v_end;
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

create or replace function public.admin_freeze_contract_index(p_contract_id uuid, p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.financial_contracts set index_frozen_month = date_trunc('month', p_month)::date where id = p_contract_id;
  if not found then raise exception 'contrato não encontrado' using errcode = '22023'; end if;
  perform public.write_audit(case when p_month is null then 'correcao_liberada' else 'correcao_fixada' end, 'financial_contracts',
    p_contract_id::text, jsonb_build_object('mes', p_month));
  return public._recalc_indexed_installments(p_contract_id);
end $$;

create or replace function public.admin_freeze_development_index(p_development_id uuid, p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.financial_contracts c set index_frozen_month = date_trunc('month', p_month)::date
    from public.units u where u.id = c.unit_id and u.development_id = p_development_id and c.index_name is not null;
  get diagnostics n = row_count;
  perform public.write_audit(case when p_month is null then 'correcao_liberada' else 'correcao_fixada' end, 'developments',
    p_development_id::text, jsonb_build_object('mes', p_month, 'contratos', n), null, p_development_id);
  perform public._recalc_indexed_installments(null);
  return n;
end $$;
