-- OUZ Experience — Etapa 1: auditoria do cadastro de corretores e listagem básica para o comercial

create trigger broker_profiles_audit after insert or update or delete on public.broker_profiles
  for each row execute function public.audit_row_change();
create trigger broker_documents_audit after insert or delete on public.broker_documents
  for each row execute function public.audit_row_change();

-- Comercial precisa escolher corretores para autorizar empreendimentos, mas não precisa de CPF/endereço.
create or replace function public.staff_list_brokers_basic(p_status public.broker_status default null)
returns table (user_id uuid, full_name text, email text, creci text, agency_name text, status public.broker_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_staff_permission('comercial') or public.has_staff_permission('corretores')) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select b.user_id, b.full_name, b.email, b.creci_number || '/' || b.creci_uf, b.agency_name, b.status
    from public.broker_profiles b
    where p_status is null or b.status = p_status
    order by b.full_name;
end $$;

-- Remoção de membro de grupo e de documento do próprio corretor também auditadas pelo trigger genérico.
