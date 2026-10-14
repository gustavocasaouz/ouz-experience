-- OUZ Experience — Correções da revisão de segurança (14/10/2026).

-- ---------------------------------------------------------------------------
-- 1) Anti-bloqueio de unidades por um corretor (+ limite de tentativas, que também dificulta descobrir regras)
-- ---------------------------------------------------------------------------
alter table public.development_commercial_settings
  add column max_active_proposals_per_broker integer not null default 3 check (max_active_proposals_per_broker between 1 and 50),
  add column reservation_cooldown_days integer not null default 7 check (reservation_cooldown_days between 0 and 90);

create or replace function public._broker_submit_proposal_full(p_proposal_id uuid, p_request_analysis boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  ctx record;
  s public.development_commercial_settings;
  v_eval jsonb;
  v_reasons text[] := '{}';
  v_status public.proposal_status;
  v_err text;
  v_reg public.prelaunch_registrations;
begin
  if not public.is_approved_broker() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into p from public.proposals where id = p_proposal_id and broker_user_id = auth.uid() for update;
  if p.id is null then raise exception 'proposta não encontrada' using errcode = '22023'; end if;
  if p.status <> 'rascunho' then
    return jsonb_build_object('status', p.status, 'idempotent', true);   -- reenvio não duplica nada
  end if;
  if p.client_name is null or p.client_document is null then
    raise exception 'sem nome e CPF/CNPJ válidos a proposta permanece como rascunho' using errcode = '22023';
  end if;

  -- Trava a unidade: serializa propostas concorrentes da mesma unidade.
  perform 1 from public.units where id = p.unit_id for update;
  select * into ctx from public.unit_commercial_context(p.unit_id);
  select * into s from public.development_commercial_settings where development_id = p.development_id;

  -- Anti-bloqueio (revisão de segurança): limite de propostas ativas por corretor e carência após reserva perdida.
  if (select count(*) from public.proposals x where x.broker_user_id = p.broker_user_id and x.development_id = p.development_id
        and x.id <> p.id and x.status in ('em_analise', 'na_fila', 'reservada')) >= coalesce(s.max_active_proposals_per_broker, 3) then
    raise exception 'limite de propostas ativas neste empreendimento atingido; fale com a OUZ' using errcode = '22023';
  end if;
  if exists (select 1 from public.reservations r where r.broker_user_id = p.broker_user_id and r.unit_id = p.unit_id
               and r.status in ('expirada', 'cancelada')
               and r.ended_at > now() - make_interval(days => coalesce(s.reservation_cooldown_days, 7))) then
    raise exception 'esta unidade teve reserva sua encerrada recentemente; aguarde ou fale com a OUZ' using errcode = '22023';
  end if;

  if ctx.unit_status in ('vendida', 'bloqueada', 'indisponivel') then
    raise exception 'unidade indisponível para propostas' using errcode = '22023';
  end if;
  if s.sales_mode = 'fechado' then
    raise exception 'o empreendimento não está recebendo propostas' using errcode = '22023';
  elsif s.sales_mode = 'pre_lancamento' then
    select * into v_reg from public.prelaunch_registrations where id = p.prelaunch_registration_id and broker_user_id = auth.uid();
    if v_reg.id is null or not public.broker_has_open_window(p.development_id) or v_reg.status not in ('convidado', 'proposta_enviada') then
      raise exception 'pré-lançamento: é necessário um registro com janela de proposta aberta' using errcode = '22023';
    end if;
    if v_reg.client_document_hash <> p.client_document_hash then
      raise exception 'pré-lançamento: o cliente da proposta deve ser o mesmo do registro de interesse' using errcode = '22023';
    end if;
  elsif not public.broker_can_access_development(p.development_id) then
    raise exception 'acesso negado ao empreendimento' using errcode = '42501';
  end if;

  v_err := public.validate_payments(p.payments, p.offered_price, current_date);
  if v_err is not null then raise exception '%', v_err using errcode = '22023'; end if;

  if exists (select 1 from public.proposals x where x.broker_user_id = p.broker_user_id and x.unit_id = p.unit_id
               and x.client_document_hash = p.client_document_hash and x.id <> p.id and x.status in ('em_analise', 'na_fila', 'reservada')) then
    raise exception 'já existe proposta ativa sua para este cliente nesta unidade' using errcode = '22023';
  end if;

  v_eval := public.evaluate_terms(ctx.rules, ctx.table_price, p.offered_price, p.payments, ctx.keys_date, current_date,
                                  case when p.client_document_type = 'cnpj' then 'pj'::public.person_type else 'pf'::public.person_type end);

  -- Mesmo cliente com proposta ativa de OUTRO corretor no empreendimento → análise (sem revelar o outro corretor).
  if exists (select 1 from public.proposals x where x.development_id = p.development_id and x.client_document_hash = p.client_document_hash
               and x.broker_user_id <> p.broker_user_id and x.status in ('em_analise', 'na_fila', 'reservada')) then
    v_reasons := array_append(v_reasons, 'duplicidade_cliente');
  end if;
  if not (v_eval ->> 'within')::boolean then
    if not p_request_analysis then
      -- Fora da política e sem pedido de análise: nada muda; o corretor vê os critérios não atendidos.
      return jsonb_build_object('status', 'rascunho', 'within', false, 'evaluation', v_eval);
    end if;
    v_reasons := array_append(v_reasons, 'fora_da_politica');
  end if;

  update public.proposals
     set price_table_id = ctx.price_table_id, table_price = ctx.table_price, sales_policy_id = ctx.sales_policy_id,
         policy_rules = ctx.rules, evaluation = v_eval, within_policy = (v_eval ->> 'within')::boolean,
         analysis_reasons = v_reasons, submitted_at = now()
   where id = p.id;

  if v_reg.id is not null then
    update public.prelaunch_registrations set status = 'proposta_enviada' where id = v_reg.id and status = 'convidado';
  end if;

  if array_length(v_reasons, 1) > 0 then
    update public.proposals set status = 'em_analise' where id = p.id;
    perform public._proposal_event(p.id, 'rascunho', 'em_analise',
      'Enviada para análise da OUZ.');
    perform public.notify_staff('comercial', 'proposta_em_analise', 'Proposta aguardando análise',
      array_to_string(v_reasons, ', '), '/admin/propostas/' || p.id, 'proposta:' || p.id || ':analise');
    v_status := 'em_analise';
  else
    perform public._proposal_event(p.id, 'rascunho', null, 'Enviada dentro da política: apta à aprovação automática.');
    v_status := public._place_eligible(p.id);
  end if;

  perform public.write_audit('proposta_enviada', 'proposals', p.id::text,
    jsonb_build_object('status', v_status, 'within', (v_eval ->> 'within')::boolean, 'reasons', v_reasons,
                       'price_table_id', ctx.price_table_id, 'sales_policy_id', ctx.sales_policy_id), null, p.development_id);
  return jsonb_build_object('status', v_status, 'within', (v_eval ->> 'within')::boolean, 'evaluation', v_eval,
                            'reservation_id', (select id from public.reservations where proposal_id = p.id));
end $$;
revoke execute on function public._broker_submit_proposal_full(uuid, boolean) from public, anon, authenticated;

create or replace function public._rpc_rate_limit(p_scope text, p_max integer, p_window_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.check_rate_limit(p_scope || ':' || auth.uid(), p_max, p_window_seconds) then
    raise exception 'muitas tentativas; aguarde alguns minutos' using errcode = '22023';
  end if;
end $$;
revoke execute on function public._rpc_rate_limit(text, integer, integer) from public, anon, authenticated;

create or replace function public.broker_submit_proposal(p_proposal_id uuid, p_request_analysis boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public._rpc_rate_limit('rpc_proposta', 20, 3600);
  r := public._broker_submit_proposal_full(p_proposal_id, p_request_analysis);
  return r - 'evaluation';
end $$;

-- Limites também quando as funções são chamadas direto pela API (não só pelas telas).
create or replace function public.limit_inserts_per_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') or auth.uid() is not null then
    perform public._rpc_rate_limit('ins_' || tg_table_name, tg_argv[0]::int, tg_argv[1]::int);
  end if;
  return new;
end $$;
create trigger tickets_rate before insert on public.tickets for each row execute function public.limit_inserts_per_user('10', '3600');
create trigger concierge_rate before insert on public.concierge_requests for each row execute function public.limit_inserts_per_user('15', '3600');
create trigger customization_rate before insert on public.customization_requests for each row execute function public.limit_inserts_per_user('10', '3600');
create trigger inquiries_rate before insert on public.financial_inquiries for each row execute function public.limit_inserts_per_user('10', '3600');
create trigger receipts_rate before insert on public.payment_receipts for each row execute function public.limit_inserts_per_user('20', '3600');
create trigger prelaunch_rate before insert on public.prelaunch_registrations for each row execute function public.limit_inserts_per_user('30', '3600');
create trigger proposals_rate before insert on public.proposals for each row execute function public.limit_inserts_per_user('60', '3600');

-- ---------------------------------------------------------------------------
-- 3) Storage: leitura arquivo a arquivo para materiais de corretor e mídia de clientes
-- ---------------------------------------------------------------------------
create or replace function public.can_read_broker_material(p_development_id uuid, p_kind public.broker_material_kind) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.broker_can_access_development(p_development_id)
     and (p_kind not in ('tabela', 'planta') or public.broker_can_see_prices(p_development_id))
$$;

drop policy if exists materials_select on public.broker_materials;
create policy materials_select on public.broker_materials for select to authenticated
  using ((is_published and public.can_read_broker_material(development_id, kind))
         or public.has_staff_permission('conteudo') or public.has_staff_permission('comercial'));

create or replace function public.can_read_broker_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('conteudo') or public.has_staff_permission('comercial')
      or exists (select 1 from public.broker_materials m where m.storage_path = p_name and m.is_published
                 and public.can_read_broker_material(m.development_id, m.kind))
$$;
drop policy if exists "broker-content: leitura autorizada" on storage.objects;
create policy "broker-content: leitura por material" on storage.objects for select to authenticated
  using (bucket_id = 'broker-content' and public.can_read_broker_file(name));

create or replace function public.can_read_client_media(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('conteudo') or exists (
    select 1 from public.development_update_media m join public.development_updates u on u.id = m.update_id
    where m.storage_path = p_name and u.published_at is not null and u.published_at <= now()
      and public.is_client_of_development(u.development_id))
$$;
drop policy if exists "client-media: cliente do empreendimento lê" on storage.objects;
create policy "client-media: leitura por mídia publicada" on storage.objects for select to authenticated
  using (bucket_id = 'client-media' and public.can_read_client_media(name));

-- Uploads só nas fases permitidas (espelha as regras das funções).
drop policy if exists "broker-documents: envio pelo corretor" on storage.objects;
create policy "broker-documents: envio pelo corretor" on storage.objects for insert to authenticated
  with check (bucket_id = 'broker-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.broker_profiles b where b.user_id = auth.uid() and b.status in ('pendente', 'ajustes_solicitados')));

create or replace function public.can_upload_reservation_file(p_reservation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reservations r where r.id = p_reservation_id and r.broker_user_id = auth.uid()
                 and public._reservation_open_for_upload(r))
$$;
drop policy if exists "proposal-documents: corretor envia nos seus" on storage.objects;
create policy "proposal-documents: corretor envia nos seus" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposal-documents' and public.can_upload_reservation_file(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- 4) Dados pessoais isolados por CLIENTE (não só por unidade). Contrato, parcelas e documentos da unidade
--    continuam compartilhados entre titulares/cotitulares ATIVOS da unidade.
-- ---------------------------------------------------------------------------
create or replace function public.is_ticket_owner(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tickets t where t.id = p_ticket_id and t.client_id = public.current_client_id()
                 and public.is_client_of_unit(t.unit_id))
$$;
drop policy if exists tickets_client on public.tickets;
create policy tickets_client on public.tickets for select to authenticated
  using (client_id = public.current_client_id() and public.is_client_of_unit(unit_id));
drop policy if exists cr_client on public.concierge_requests;
create policy cr_client on public.concierge_requests for select to authenticated
  using (client_id = public.current_client_id() and public.is_client_of_unit(unit_id));
drop policy if exists ce_client on public.concierge_events;
create policy ce_client on public.concierge_events for select to authenticated
  using (visible_to_client and exists (select 1 from public.concierge_requests r where r.id = request_id
         and r.client_id = public.current_client_id() and public.is_client_of_unit(r.unit_id)));
drop policy if exists co_client on public.concierge_occurrences;
create policy co_client on public.concierge_occurrences for select to authenticated
  using (visible_to_client and exists (select 1 from public.concierge_requests r where r.id = request_id
         and r.client_id = public.current_client_id() and public.is_client_of_unit(r.unit_id)));
drop policy if exists customization_client on public.customization_requests;
create policy customization_client on public.customization_requests for select to authenticated
  using (client_id = public.current_client_id() and public.is_client_of_unit(unit_id));
drop policy if exists receipts_client on public.payment_receipts;
create policy receipts_client on public.payment_receipts for select to authenticated
  using (uploaded_by = auth.uid() and public.is_client_of_contract(contract_id));
drop policy if exists inquiries_client on public.financial_inquiries;
create policy inquiries_client on public.financial_inquiries for select to authenticated
  using (created_by = auth.uid() and public.is_client_of_contract(contract_id));

-- As funções do cliente também passam a exigir que a solicitação seja dele.
create or replace function public.client_owns_request(p_client_id uuid, p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_client_id = public.current_client_id() and public.is_client_of_unit(p_unit_id)
$$;

create or replace function public.can_read_client_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('documentos')
      or exists (select 1 from public.document_versions v where v.storage_path = p_name and public.can_read_document(v.document_id))
      or exists (select 1 from public.payment_receipts r where r.storage_path = p_name and r.uploaded_by = auth.uid())
$$;

create or replace function public.client_create_inquiry(p_contract_id uuid, p_installment_id uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_client_of_contract(p_contract_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_installment_id is not null and not exists (select 1 from public.installments where id = p_installment_id and contract_id = p_contract_id) then
    raise exception 'parcela inválida' using errcode = '22023';
  end if;
  insert into public.financial_inquiries (contract_id, installment_id, message, created_by)
  values (p_contract_id, p_installment_id, trim(p_message), auth.uid()) returning id into v_id;
  perform public.notify_staff('financeiro', 'esclarecimento', 'Pedido de esclarecimento financeiro', left(trim(p_message), 200),
    '/admin/financeiro', 'esclarecimento:' || v_id);
  return v_id;
end $$;

-- Ações do cliente sobre solicitações: só o próprio cliente.
create or replace function public.post_ticket_message(p_ticket_id uuid, p_body text, p_internal boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_staff boolean := public.has_staff_permission('atendimento'); v_id uuid; v_user uuid;
begin
  select * into t from public.tickets where id = p_ticket_id for update;
  if t.id is null or not (v_staff or public.client_owns_request(t.client_id, t.unit_id)) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if t.status in ('encerrado', 'cancelado') then raise exception 'chamado encerrado' using errcode = '22023'; end if;
  if p_internal and not v_staff then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.ticket_messages (ticket_id, author_id, from_staff, internal, body)
  values (t.id, auth.uid(), v_staff, p_internal, trim(p_body)) returning id into v_id;
  if v_staff and not p_internal then
    select user_id into v_user from public.clients where id = t.client_id;
    if v_user is not null then
      perform public.notify_user(v_user, 'chamado', 'Nova mensagem no chamado #' || t.number, left(trim(p_body), 200),
        '/cliente/chamados/' || t.id, 'chamado:' || t.id || ':msg:' || v_id);
    end if;
  elsif not v_staff then
    if t.status = 'aguardando_cliente' then update public.tickets set status = 'em_analise' where id = t.id; end if;
    perform public.notify_staff('atendimento', 'chamado', 'Cliente respondeu ao chamado #' || t.number, left(trim(p_body), 200),
      '/admin/chamados/' || t.id, 'chamado:' || t.id || ':msg:' || v_id);
  end if;
  return v_id;
end $$;

create or replace function public.client_rate_ticket(p_ticket_id uuid, p_rating integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket_id for update;
  if t.id is null or not public.client_owns_request(t.client_id, t.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if t.status not in ('resolvido', 'encerrado') then raise exception 'avaliação disponível após a resolução' using errcode = '22023'; end if;
  if t.rated_at is not null then raise exception 'chamado já avaliado' using errcode = '22023'; end if;
  if p_rating not between 1 and 5 then raise exception 'nota de 1 a 5' using errcode = '22023'; end if;
  update public.tickets set rating = p_rating, rating_comment = nullif(trim(p_comment), ''), rated_at = now(),
         status = 'encerrado', closed_at = coalesce(closed_at, now())
   where id = t.id;
end $$;

create or replace function public.client_decide_customization(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.customization_requests;
begin
  select * into r from public.customization_requests where id = p_id for update;
  if r.id is null or not public.client_owns_request(r.client_id, r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'orcamento_enviado' then raise exception 'não há orçamento aguardando decisão' using errcode = '22023'; end if;
  if r.quote_valid_until is not null and r.quote_valid_until < current_date then raise exception 'orçamento vencido; solicite atualização' using errcode = '22023'; end if;
  update public.customization_requests
     set status = case when p_approve then 'aprovada'::public.customization_status else 'recusada'::public.customization_status end,
         client_decision_at = now()
   where id = p_id;
  perform public.notify_staff('atendimento', 'personalizacao', 'Cliente respondeu ao orçamento de personalização',
    case when p_approve then 'Aprovado pelo cliente' else 'Recusado pelo cliente' end, '/admin/personalizacoes/' || p_id,
    'personalizacao:' || p_id || ':decisao');
end $$;

create or replace function public.client_decide_concierge_quote(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.client_owns_request(r.client_id, r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'orcamento_enviado' then raise exception 'não há orçamento aguardando sua decisão' using errcode = '22023'; end if;
  if r.quote_valid_until is not null and r.quote_valid_until < current_date then raise exception 'orçamento vencido; peça uma atualização à OUZ' using errcode = '22023'; end if;
  update public.concierge_requests set status = case when p_approve then 'aprovada_cliente'::public.concierge_status else 'recusada_cliente'::public.concierge_status end
   where id = r.id;
  perform public._concierge_event(r.id, 'orcamento_enviado', case when p_approve then 'aprovada_cliente'::public.concierge_status else 'recusada_cliente'::public.concierge_status end,
    case when p_approve then 'Orçamento aprovado pelo cliente.' else 'Orçamento recusado pelo cliente.' end);
  perform public.notify_staff('concierge', 'concierge', 'Concierge #' || r.number || ': ' || case when p_approve then 'orçamento aprovado' else 'orçamento recusado' end,
    'Responda no painel.', '/admin/concierge/' || r.id, 'concierge:' || r.id || ':decisao:' || extract(epoch from now())::bigint);
end $$;

create or replace function public.client_cancel_concierge(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.client_owns_request(r.client_id, r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status not in ('solicitada', 'em_analise', 'orcamento_enviado', 'aprovada_cliente', 'agendada') then
    raise exception 'esta solicitação não pode mais ser cancelada pelo portal; fale com a OUZ' using errcode = '22023';
  end if;
  update public.concierge_requests set status = 'cancelada', cancel_reason = nullif(trim(p_reason), ''), cancelled_by_client = true where id = r.id;
  perform public._concierge_event(r.id, r.status, 'cancelada', 'Cancelada pelo cliente' || coalesce(': ' || nullif(trim(p_reason), ''), '.'));
  perform public.notify_staff('concierge', 'concierge', 'Concierge #' || r.number || ' cancelado pelo cliente',
    case when r.status = 'agendada' then 'Estava agendado — avise o prestador.' else coalesce(nullif(trim(p_reason), ''), '') end,
    '/admin/concierge/' || r.id, 'concierge:' || r.id || ':cancelada');
end $$;

create or replace function public.client_rate_concierge(p_id uuid, p_rating integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.concierge_requests;
begin
  select * into r from public.concierge_requests where id = p_id for update;
  if r.id is null or not public.client_owns_request(r.client_id, r.unit_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if r.status <> 'concluida' then raise exception 'avaliação disponível após a conclusão' using errcode = '22023'; end if;
  if r.rating is not null then raise exception 'serviço já avaliado' using errcode = '22023'; end if;
  if p_rating not between 1 and 5 then raise exception 'nota de 1 a 5' using errcode = '22023'; end if;
  update public.concierge_requests set rating = p_rating, rating_comment = nullif(trim(p_comment), '') where id = r.id;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Permissão "Clientes" não pode virar acesso a dados de unidades
-- ---------------------------------------------------------------------------
create or replace function public.accept_client_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.client_invitations;
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  if v_user.email_confirmed_at is null then raise exception 'e-mail não verificado' using errcode = '42501'; end if;
  -- Contas da equipe não podem virar clientes por convite (evita que a permissão "Clientes" dê acesso a dados de unidades).
  if exists (select 1 from public.staff_members where user_id = v_user.id) then
    raise exception 'contas da equipe OUZ não podem aceitar convite de cliente; use uma conta pessoal separada e fale com um administrador' using errcode = '42501';
  end if;

  select * into v_inv from public.client_invitations where token_hash = public.hash_token(p_token) for update;
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'convite inválido ou expirado' using errcode = '22023';
  end if;
  if lower(v_user.email) <> v_inv.email then
    raise exception 'convite emitido para outro e-mail' using errcode = '42501';
  end if;
  if exists (select 1 from public.clients where user_id = v_user.id and id <> v_inv.client_id) then
    raise exception 'esta conta já está vinculada a outro cadastro de cliente; contate a OUZ' using errcode = '22023';
  end if;

  update public.clients set user_id = v_user.id where id = v_inv.client_id and (user_id is null or user_id = v_user.id);
  if not found then raise exception 'cadastro já vinculado a outra conta' using errcode = '22023'; end if;

  update public.client_invitations set accepted_at = now(), accepted_by = v_user.id where id = v_inv.id;
  perform public.write_audit('convite_cliente_aceito', 'client_invitations', v_inv.id::text, jsonb_build_object('client_id', v_inv.client_id));
  return v_inv.client_id;
end $$;

-- Novo vínculo em unidade que já tem cliente ativo: avisa os administradores (auditoria já registra).
create or replace function public.alert_extra_unit_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active and exists (select 1 from public.client_units x where x.unit_id = new.unit_id and x.active and x.id <> new.id) then
    perform public.notify_staff('administracao', 'vinculo_adicional', 'Novo vínculo em unidade que já tem cliente',
      'Confira se o vínculo foi autorizado.', '/admin/unidades/' || new.unit_id, 'vinculo:' || new.id);
  end if;
  return new;
end $$;
create trigger client_units_alert after insert or update of active on public.client_units
  for each row execute function public.alert_extra_unit_link();

-- ---------------------------------------------------------------------------
-- 6) Sem oráculo de CPF: corretor não descobre que outro corretor tem o mesmo cliente
-- ---------------------------------------------------------------------------
revoke select on public.proposals from authenticated;
grant select (
  id, broker_user_id, development_id, unit_id, status, client_name, client_document_type, client_document,
  offered_price, payments, observations, price_table_id, table_price, sales_policy_id, within_policy,
  prelaunch_registration_id, previous_proposal_id, idempotency_key, submitted_at,
  queue_entered_at, queue_seq, queue_priority, decided_at, decided_by, decision_reason, created_at, updated_at
) on public.proposals to authenticated;

create or replace function public.admin_proposal_reasons(p_proposal_id uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return (select analysis_reasons from public.proposals where id = p_proposal_id);
end $$;

update public.proposal_events set note = 'Enviada para análise da OUZ.' where note like 'Enviada para análise da OUZ (%';

alter table public.prelaunch_registrations add column review_required boolean not null default false;
revoke select on public.prelaunch_registrations from authenticated;
grant select (id, campaign_id, broker_user_id, client_name, client_document_type, client_document, client_document_hash,
              preferences, status, wave_id, priority_rank, registered_at, idempotency_key, updated_at) on public.prelaunch_registrations to authenticated;
update public.prelaunch_registrations set status = 'registrado', review_required = true where status = 'em_analise_duplicidade';

create or replace function public.admin_prelaunch_review_flags(p_campaign_id uuid) returns table (registration_id uuid, review_required boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select id, r.review_required from public.prelaunch_registrations r where r.campaign_id = p_campaign_id;
end $$;

create or replace function public.broker_register_prelaunch(
  p_campaign_id uuid, p_client_name text, p_client_document text, p_preferences text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.prelaunch_campaigns;
  v_doc text := regexp_replace(upper(coalesce(p_client_document, '')), '[^0-9A-Z]', '', 'g');
  v_type public.document_type;
  v_hash text;
  v_id uuid;
  v_status public.prelaunch_registration_status := 'registrado';
  v_review boolean := false;
begin
  if not public.is_approved_broker() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into c from public.prelaunch_campaigns where id = p_campaign_id for update;
  if c.id is null or c.status <> 'aberta' or not public.broker_can_see_development_card(c.development_id) then
    raise exception 'registro de interesse indisponível' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_client_name)), 0) < 2 then raise exception 'informe o nome do cliente' using errcode = '22023'; end if;
  if public.is_valid_cpf(v_doc) then v_type := 'cpf';
  elsif public.is_valid_cnpj(v_doc) then v_type := 'cnpj';
  else raise exception 'CPF/CNPJ inválido' using errcode = '22023';
  end if;

  select id into v_id from public.prelaunch_registrations where broker_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'idempotent', true);
  end if;

  v_hash := public.document_hash(v_doc);
  -- Mesmo cliente registrado por outro corretor: vai para análise da OUZ (sem revelar o outro corretor).
  -- O limite por cliente vale para os registros deste corretor; duplicidades entre corretores são decididas pela OUZ.
  if exists (select 1 from public.prelaunch_registrations
              where campaign_id = c.id and client_document_hash = v_hash and broker_user_id <> auth.uid() and status <> 'cancelado') then
    v_review := true;
  elsif (select count(*) from public.prelaunch_registrations
          where campaign_id = c.id and client_document_hash = v_hash and status <> 'cancelado') >= c.max_registrations_per_client then
    raise exception 'limite de registros para este cliente nesta campanha atingido' using errcode = '22023';
  end if;

  insert into public.prelaunch_registrations (campaign_id, broker_user_id, client_name, client_document_type, client_document,
                                              client_document_hash, preferences, status, review_required, idempotency_key)
  values (c.id, auth.uid(), trim(p_client_name), v_type, v_doc, v_hash, nullif(trim(p_preferences), ''), v_status, v_review, p_idempotency_key)
  returning id into v_id;
  perform public._registration_event(v_id, null, v_status, 'Interesse registrado.');
  if v_review then
    perform public.notify_staff('comercial', 'prelancamento_duplicidade', 'Pré-lançamento: registro em análise',
      'Cliente já registrado por outro corretor.', '/admin/pre-lancamento/' || c.id, 'prelancamento:' || v_id || ':duplicidade');
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);  -- nunca revela duplicidade ao corretor
end $$;

create or replace function public.admin_fill_wave(p_wave_id uuid, p_count integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare w public.prelaunch_waves; v_n int;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into w from public.prelaunch_waves where id = p_wave_id for update;
  if w.id is null then raise exception 'onda não encontrada' using errcode = '22023'; end if;
  with nxt as (
    select id from public.prelaunch_registrations
    where campaign_id = w.campaign_id and status = 'registrado' and not review_required
    order by priority_rank nulls last, registered_at
    limit greatest(p_count, 0)
    for update
  ), upd as (
    update public.prelaunch_registrations r set status = 'em_onda', wave_id = w.id from nxt where r.id = nxt.id returning r.id
  )
  insert into public.prelaunch_registration_events (registration_id, actor_user_id, from_status, to_status, note)
  select id, auth.uid(), 'registrado', 'em_onda', 'Incluído na onda ' || w.name from upd;
  get diagnostics v_n = row_count;
  -- se a janela da onda já está aberta, os novos já são convidados
  if w.window_starts_at is not null and w.window_ends_at > now() then
    perform public.admin_open_wave_window(w.id, w.window_starts_at, w.window_ends_at);
  end if;
  return v_n;
end $$;

create or replace function public.admin_resolve_prelaunch_registration(p_id uuid, p_accept boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev public.prelaunch_registration_status;
begin
  if not public.has_staff_permission('comercial') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
  select status into v_prev from public.prelaunch_registrations where id = p_id for update;
  if v_prev is null or v_prev in ('cancelado', 'proposta_enviada') then raise exception 'registro não pode ser alterado' using errcode = '22023'; end if;
  if p_accept then
    update public.prelaunch_registrations set review_required = false where id = p_id;
  else
    update public.prelaunch_registrations set status = 'cancelado', review_required = false where id = p_id;
    perform public._registration_event(p_id, v_prev, 'cancelado', p_reason);
  end if;
  perform public.write_audit('prelancamento_registro_decisao', 'prelaunch_registrations', p_id::text,
    jsonb_build_object('aceito', p_accept), p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- 7) Policies "for all" separadas: apagar exige a mesma permissão de gravar
-- ---------------------------------------------------------------------------
drop policy if exists broker_groups_staff on public.broker_groups;
create policy broker_groups_read on public.broker_groups for select to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('corretores'));
create policy broker_groups_write on public.broker_groups for insert to authenticated with check (public.has_staff_permission('comercial'));
create policy broker_groups_update on public.broker_groups for update to authenticated
  using (public.has_staff_permission('comercial')) with check (public.has_staff_permission('comercial'));
create policy broker_groups_delete on public.broker_groups for delete to authenticated using (public.has_staff_permission('comercial'));

drop policy if exists broker_group_members_staff on public.broker_group_members;
create policy broker_group_members_read on public.broker_group_members for select to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('corretores'));
create policy broker_group_members_write on public.broker_group_members for insert to authenticated with check (public.has_staff_permission('comercial'));
create policy broker_group_members_delete on public.broker_group_members for delete to authenticated using (public.has_staff_permission('comercial'));

drop policy if exists price_items_staff on public.price_table_items;
create policy price_items_read on public.price_table_items for select to authenticated
  using (public.has_staff_permission('politicas') or public.has_staff_permission('comercial'));
create policy price_items_write on public.price_table_items for insert to authenticated with check (public.has_staff_permission('politicas'));
create policy price_items_update on public.price_table_items for update to authenticated
  using (public.has_staff_permission('politicas')) with check (public.has_staff_permission('politicas'));
create policy price_items_delete on public.price_table_items for delete to authenticated using (public.has_staff_permission('politicas'));

-- ---------------------------------------------------------------------------
-- 8, 10) Ocupação de evento e configuração comercial só para quem pode ver
-- ---------------------------------------------------------------------------
create or replace function public.event_seats_taken(p_event_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when public.can_view_event(p_event_id) then
    (select coalesce(sum(1 + guests), 0)::int from public.event_rsvps where event_id = p_event_id and status = 'confirmado') end
$$;
revoke execute on function public.event_seats_taken(uuid) from public, anon;
grant execute on function public.event_seats_taken(uuid) to authenticated;

drop policy if exists dcs_select on public.development_commercial_settings;
create policy dcs_select on public.development_commercial_settings for select to authenticated
  using (public.broker_can_access_development(development_id) or public.broker_has_open_window(development_id)
         or public.has_staff_permission('comercial') or public.has_staff_permission('politicas'));

-- Observações de menor confiança
alter table public.events add constraint events_online_url_https check (online_url is null or online_url ~ '^https://');
