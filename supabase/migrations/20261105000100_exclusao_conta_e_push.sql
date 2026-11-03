-- OUZ Experience — excluir a própria conta pelo app e avisos no celular (05/11/2026).
--
-- Excluir conta (exigência da App Store): apaga o acesso e os dados pessoais do perfil. Contratos, parcelas,
-- documentos e o histórico de chamados ficam com a OUZ (obrigação legal), sem ligação com o login.
-- O login é anonimizado pelo Supabase Auth (exclusão "soft"), então as referências antigas continuam válidas.
--
-- Avisos no celular: o app iOS registra o token do APNs em push_devices; notify_user passa a enfileirar
-- também um item "push" no outbox, enviado pelo servidor.

-- ---------------------------------------------------------------------------
-- 1) Aparelhos que recebem avisos. Só o servidor (service role) lê e grava.
-- ---------------------------------------------------------------------------
create table public.push_devices (
  token text primary key check (token ~ '^[0-9a-f]{64,200}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);
create trigger push_devices_updated_at before update on public.push_devices
  for each row execute function public.set_updated_at();
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Outbox com canal "push"; o servidor pode processar só um canal (avisos saem na hora, e-mails no lote).
-- ---------------------------------------------------------------------------
alter table public.notification_outbox drop constraint notification_outbox_channel_check;
alter table public.notification_outbox add constraint notification_outbox_channel_check check (channel in ('email', 'push'));

drop function public.claim_outbox_batch(integer);
create function public.claim_outbox_batch(p_limit integer default 20, p_channel text default null)
returns setof public.notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  -- itens presos em "processando" há mais de 10 min voltam para a fila
  update public.notification_outbox set status = 'falhou', last_error = 'timeout de processamento'
  where status = 'processando' and updated_at < now() - interval '10 minutes';

  return query
  update public.notification_outbox o set status = 'processando', attempts = o.attempts + 1
  where o.id in (
    select id from public.notification_outbox
    where status in ('pendente', 'falhou') and next_attempt_at <= now() and attempts < 8
      and (p_channel is null or channel = p_channel)
    order by next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning o.*;
end $$;
revoke execute on function public.claim_outbox_batch(integer, text) from public, anon, authenticated;

create or replace function public.notify_user(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_email boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user_id, p_kind, p_title, p_body, p_link, p_dedupe || ':' || p_user_id)
  on conflict (dedupe_key) do nothing;
  if p_email then
    insert into public.notification_outbox (dedupe_key, template, recipient_user_id, payload)
    values ('email:' || p_dedupe || ':' || p_user_id, 'aviso_generico', p_user_id,
            jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link))
    on conflict (dedupe_key) do nothing;
  end if;
  if exists (select 1 from public.push_devices d where d.user_id = p_user_id) then
    insert into public.notification_outbox (dedupe_key, channel, template, recipient_user_id, payload)
    values ('push:' || p_dedupe || ':' || p_user_id, 'push', 'push', p_user_id,
            jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link))
    on conflict (dedupe_key) do nothing;
  end if;
end $$;
revoke execute on function public.notify_user(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Excluir a própria conta. Chamada só pelo servidor, depois de conferir quem está logado.
--    Devolve os arquivos do cadastro de corretor que o servidor deve apagar do storage.
-- ---------------------------------------------------------------------------
create or replace function public.erase_user_account(p_user_id uuid) returns setof text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'conta não encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_members where user_id = p_user_id) then
    raise exception 'conta da equipe OUZ é removida pela administração' using errcode = '42501';
  end if;

  -- Corretor com histórico comercial: o cadastro fica (comissões, propostas, reservas) e o acesso é revogado.
  -- Sem histórico: o cadastro e os documentos saem.
  if exists (select 1 from public.proposals where broker_user_id = p_user_id)
     or exists (select 1 from public.reservations where broker_user_id = p_user_id)
     or exists (select 1 from public.prelaunch_registrations where broker_user_id = p_user_id) then
    update public.broker_profiles
       set status = 'revogado', status_reason = 'Conta excluída pelo titular', status_changed_at = now(), status_changed_by = null
     where user_id = p_user_id and status <> 'revogado';
  else
    return query select d.storage_path from public.broker_documents d where d.broker_user_id = p_user_id;
    delete from public.broker_profiles where user_id = p_user_id;
  end if;

  -- O cadastro de cliente é da OUZ (contrato): só perde a ligação com o login e pode ser convidado de novo.
  update public.clients set user_id = null where user_id = p_user_id;
  update public.consents set revoked_at = now() where user_id = p_user_id and revoked_at is null;
  delete from public.notifications where user_id = p_user_id;
  delete from public.notification_outbox where recipient_user_id = p_user_id and status in ('pendente', 'falhou');
  delete from public.push_devices where user_id = p_user_id;
  update public.profiles
     set full_name = '', phone = null, email = 'conta-excluida+' || p_user_id || '@ouz.invalid'
   where id = p_user_id;

  perform public.write_audit('conta_excluida_pelo_titular', 'profiles', p_user_id::text);
end $$;
revoke execute on function public.erase_user_account(uuid) from public, anon, authenticated;

-- A exclusão "soft" do Auth troca o e-mail por um valor anônimo; se vier vazio, o perfil mantém o anterior.
create or replace function public.handle_auth_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
