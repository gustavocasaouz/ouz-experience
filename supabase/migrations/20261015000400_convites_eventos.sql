-- OUZ Experience — Etapa 3: convite a eventos por e-mail sem dar à permissão "Eventos" acesso ao cadastro de pessoas.
create or replace function public.admin_invite_to_event(p_event_id uuid, p_emails text[])
returns table (email text, invited boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('eventos') then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.event_invitations (event_id, user_id, invited_by)
  select p_event_id, p.id, auth.uid() from public.profiles p where p.email = any (select lower(trim(e)) from unnest(p_emails) e)
  on conflict do nothing;
  return query
    select lower(trim(e)), exists (select 1 from public.profiles p where p.email = lower(trim(e)))
    from unnest(p_emails) e where trim(e) <> '';
end $$;

-- Convidados atuais (para a OUZ), sem expor demais dados pessoais.
create or replace function public.admin_event_invitations(p_event_id uuid)
returns table (user_id uuid, full_name text, email text, invited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_permission('eventos') then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select i.user_id, p.full_name, p.email, i.invited_at
    from public.event_invitations i join public.profiles p on p.id = i.user_id where i.event_id = p_event_id order by i.invited_at;
end $$;
