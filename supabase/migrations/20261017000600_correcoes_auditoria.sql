-- OUZ Experience — correções da auditoria de segurança (14/10/2026).

-- ---------------------------------------------------------------------------
-- 1) Janela de pré-lançamento não fura empreendimento oculto nem campanha fechada.
--    (Antes: um registro "convidado" com janela aberta dava acesso a unidades, preços e propostas
--     mesmo com o empreendimento oculto/despublicado ou a campanha encerrada.)
-- ---------------------------------------------------------------------------
create or replace function public.broker_has_open_window(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_approved_broker() and exists (
    select 1
    from public.prelaunch_registrations r
    join public.prelaunch_waves w on w.id = r.wave_id
    join public.prelaunch_campaigns c on c.id = r.campaign_id
    join public.developments d on d.id = c.development_id
    where c.development_id = p_development_id
      and r.broker_user_id = auth.uid()
      and c.status = 'aberta'
      and d.broker_access_mode <> 'oculto'
      and r.status in ('convidado', 'proposta_enviada')
      and w.window_starts_at <= now() and w.window_ends_at > now()
  )
$$;

-- Ondas de pré-lançamento de empreendimento oculto deixam de aparecer para o corretor.
drop policy prelaunch_waves_broker on public.prelaunch_waves;
create policy prelaunch_waves_broker on public.prelaunch_waves for select to authenticated
  using (exists (select 1 from public.prelaunch_registrations r where r.wave_id = prelaunch_waves.id and r.broker_user_id = auth.uid())
         and exists (select 1 from public.prelaunch_campaigns c where c.id = prelaunch_waves.campaign_id
                     and public.broker_can_see_development_card(c.development_id)));

-- Checklist de documentos: corretor só vê o geral e o dos empreendimentos que pode acessar.
drop policy checklist_select on public.document_checklist_items;
create policy checklist_select on public.document_checklist_items for select to authenticated
  using (public.has_staff_permission('comercial') or public.has_staff_permission('documentos')
         or (public.is_approved_broker() and (development_id is null
             or public.broker_can_access_development(development_id) or public.broker_has_open_window(development_id))));

-- ---------------------------------------------------------------------------
-- 2) Portal do cliente liberado por empreendimento. Empreendimento ainda não lançado (ex.: UMAN)
--    fica invisível também para clientes, mesmo com unidade vinculada, até a OUZ liberar.
--    Liberado por padrão (cliente só entra quando a OUZ vincula a unidade); o UMAN começa fechado.
-- ---------------------------------------------------------------------------
alter table public.developments add column client_portal_enabled boolean not null default true;
update public.developments set client_portal_enabled = false where slug = 'uman' and not is_demo;
comment on column public.developments.client_portal_enabled is 'Clientes com unidade neste empreendimento enxergam o portal (unidade, obra, documentos, financeiro).';
grant update (client_portal_enabled) on public.developments to authenticated;  -- RLS: só staff com permissão conteudo

create or replace function public.is_client_of_unit(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    join public.client_units cu on cu.client_id = c.id and cu.active
    join public.units u on u.id = cu.unit_id
    join public.developments d on d.id = u.development_id
    where c.user_id = auth.uid() and cu.unit_id = p_unit_id and d.client_portal_enabled
  )
$$;

create or replace function public.is_client_of_development(p_development_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    join public.client_units cu on cu.client_id = c.id and cu.active
    join public.units u on u.id = cu.unit_id
    join public.developments d on d.id = u.development_id
    where c.user_id = auth.uid() and u.development_id = p_development_id and d.client_portal_enabled
  )
$$;

-- ---------------------------------------------------------------------------
-- 3) Operador com permissão "administracao" não pode se autopromover por convite.
-- ---------------------------------------------------------------------------
create or replace function public.create_staff_invitation(
  p_email text, p_role public.staff_role, p_permissions public.staff_permission[]
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if not public.has_staff_permission('administracao') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_role = 'administrador' and not public.is_staff_admin() then
    raise exception 'somente administradores convidam administradores' using errcode = '42501';
  end if;
  if not public.is_staff_admin() and 'administracao' = any(coalesce(p_permissions, '{}')) then
    raise exception 'somente administradores concedem a permissão de administração' using errcode = '42501';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;
  -- Ninguém convida o próprio e-mail; mudar acesso de quem já é da equipe é pela tela de equipe (só administradores).
  if lower(p_email) = lower((select email from auth.users where id = auth.uid())) then
    raise exception 'não é possível convidar o próprio e-mail' using errcode = '42501';
  end if;
  if not public.is_staff_admin() and exists (
    select 1 from public.staff_members s join auth.users u on u.id = s.user_id where lower(u.email) = lower(p_email)
  ) then
    raise exception 'esta pessoa já faz parte da equipe: ajuste o acesso em Equipe' using errcode = '42501';
  end if;

  update public.staff_invitations set revoked_at = now()
  where email = lower(p_email) and accepted_at is null and revoked_at is null;

  insert into public.staff_invitations (email, role, permissions, token_hash, expires_at, created_by)
  values (lower(p_email), p_role, coalesce(p_permissions, '{}'), public.hash_token(v_token), now() + interval '72 hours', auth.uid())
  returning id into v_id;

  perform public.write_audit('convite_staff_criado', 'staff_invitations', v_id::text,
    jsonb_build_object('role', p_role, 'permissions', p_permissions));
  return v_token;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Limites de envio em mais tabelas (evita avalanche de notificações para a equipe).
-- ---------------------------------------------------------------------------
create trigger ticket_messages_rate before insert on public.ticket_messages for each row execute function public.limit_inserts_per_user('60', '3600');
create trigger ticket_attachments_rate before insert on public.ticket_attachments for each row execute function public.limit_inserts_per_user('40', '3600');
create trigger appointment_bookings_rate before insert on public.appointment_bookings for each row execute function public.limit_inserts_per_user('10', '3600');
create trigger reservation_files_rate before insert on public.reservation_files for each row execute function public.limit_inserts_per_user('60', '3600');
create trigger broker_documents_rate before insert on public.broker_documents for each row execute function public.limit_inserts_per_user('30', '3600');
create trigger event_rsvps_rate before insert on public.event_rsvps for each row execute function public.limit_inserts_per_user('30', '3600');

-- ---------------------------------------------------------------------------
-- 5) Consentimento revogado não pode ser "desrevogado" nem ter a data reescrita.
-- ---------------------------------------------------------------------------
create or replace function public.consents_guard_revoke() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (old.revoked_at is not null or new.revoked_at is null) then
    raise exception 'consentimento já revogado não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger consents_guard_revoke before update on public.consents for each row execute function public.consents_guard_revoke();

-- ---------------------------------------------------------------------------
-- 6) installments_view com as colunas novas (dias de atraso, fator INPC): a view usa i.* e
--    o Postgres fixa as colunas na criação.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7) Equipe só com "Políticas" enxerga os empreendimentos (as telas de Comercial já a admitem).
-- ---------------------------------------------------------------------------
create policy developments_select_politicas on public.developments for select to authenticated
  using (public.has_staff_permission('politicas'));

-- ---------------------------------------------------------------------------
-- 8) Sem área pública no app: ninguém lê empreendimento só por estar "publicado".
--    Capa/apresentação: clientes do empreendimento (portal liberado), corretores que veem o cartão e a equipe.
-- ---------------------------------------------------------------------------
drop policy developments_select_public on public.developments;
drop policy dpc_select on public.development_public_content;
create policy dpc_select on public.development_public_content for select to authenticated
  using (public.is_client_of_development(development_id) or public.broker_can_see_development_card(development_id)
         or public.has_staff_permission('conteudo'));
