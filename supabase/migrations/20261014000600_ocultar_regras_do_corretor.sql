-- OUZ Experience — Decisão da OUZ (13/10/2026): o corretor NÃO vê as regras da política comercial.
-- Ele sabe apenas se a proposta está dentro ou fora da política. Limites, valores e critérios ficam restritos à OUZ.

-- 1) Colunas com o snapshot das regras e a avaliação detalhada deixam de ser legíveis via API.
--    (privilégio por coluna: vale para todo usuário autenticado; a OUZ lê pela função abaixo)
revoke select on public.proposals from authenticated;
grant select (
  id, broker_user_id, development_id, unit_id, status, client_name, client_document_type, client_document,
  offered_price, payments, observations, price_table_id, table_price, sales_policy_id, within_policy,
  analysis_reasons, prelaunch_registration_id, previous_proposal_id, idempotency_key, submitted_at,
  queue_entered_at, queue_seq, queue_priority, decided_at, decided_by, decision_reason, created_at, updated_at
) on public.proposals to authenticated;

create or replace function public.admin_proposal_evaluation(p_proposal_id uuid)
returns table (policy_rules jsonb, evaluation jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_staff_permission('comercial') or public.has_staff_permission('politicas')) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query select p.policy_rules, p.evaluation from public.proposals p where p.id = p_proposal_id;
end $$;

-- 2) Prévia detalhada só para a OUZ.
create or replace function public.broker_preview_evaluation(p_unit_id uuid, p_offered_price numeric, p_payments jsonb, p_client_document text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ctx record; v_doc text;
begin
  if not (public.has_staff_permission('comercial') or public.has_staff_permission('politicas')) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select * into ctx from public.unit_commercial_context(p_unit_id);
  v_doc := regexp_replace(upper(coalesce(p_client_document, '')), '[^0-9A-Z]', '', 'g');
  return public.evaluate_terms(ctx.rules, ctx.table_price, p_offered_price, p_payments, ctx.keys_date, current_date,
                               case when public.is_valid_cnpj(v_doc) then 'pj'::public.person_type else 'pf'::public.person_type end)
         || jsonb_build_object('table_price', ctx.table_price, 'keys_date', ctx.keys_date);
end $$;

-- 3) O envio devolve ao corretor apenas o resultado (sem critérios nem limites).
--    A função original passa a ser interna; a pública filtra a resposta.
alter function public.broker_submit_proposal(uuid, boolean) rename to _broker_submit_proposal_full;
revoke execute on function public._broker_submit_proposal_full(uuid, boolean) from public, anon, authenticated;

create or replace function public.broker_submit_proposal(p_proposal_id uuid, p_request_analysis boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public._broker_submit_proposal_full(p_proposal_id, p_request_analysis);
  return r - 'evaluation';
end $$;
