-- OUZ Experience — Etapa 3: lista mínima da equipe (nome) para atribuir responsáveis, sem expor permissões ou e-mails.
create or replace function public.staff_directory()
returns table (user_id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'acesso negado' using errcode = '42501'; end if;
  return query select s.user_id, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1))
    from public.staff_members s join public.profiles p on p.id = s.user_id where s.active order by 2;
end $$;
