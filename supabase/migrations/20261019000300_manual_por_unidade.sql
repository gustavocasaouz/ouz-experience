-- OUZ Experience — manual do proprietário por unidade (19/10/2026).
--
-- O manual do proprietário é adaptado para cada apartamento (descrição da unidade, projetos "as built"…).
-- Manual com unit_id vale só para aquela unidade; sem unit_id, para o empreendimento todo (ex.: condomínio).
-- Os arquivos (PDF completo e anexos) de um manual da unidade podem ser documentos da própria unidade.

alter table public.development_manuals add column unit_id uuid references public.units(id) on delete cascade;
alter table public.development_manuals drop constraint development_manuals_development_id_kind_key;
create unique index development_manuals_scope on public.development_manuals
  (development_id, kind, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on column public.development_manuals.unit_id is 'Manual de uma unidade só (ex.: manual do proprietário do apto 201). Nulo: vale para o empreendimento.';

-- A unidade precisa ser do mesmo empreendimento.
create or replace function public.check_manual_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.unit_id is not null and not exists (select 1 from public.units u where u.id = new.unit_id and u.development_id = new.development_id) then
    raise exception 'a unidade não é deste empreendimento' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger development_manuals_unit before insert or update of unit_id, development_id on public.development_manuals
  for each row execute function public.check_manual_unit();

-- Cliente lê: manual do empreendimento (se é cliente dele) ou o da própria unidade.
create or replace function public.can_read_manual(p_manual_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('conteudo') or exists (
    select 1 from public.development_manuals m
    where m.id = p_manual_id and m.is_published
      and case when m.unit_id is null then public.is_client_of_development(m.development_id)
               else public.is_client_of_unit(m.unit_id) end
  )
$$;

-- Documento válido para o manual: do empreendimento ou, no manual de uma unidade, da própria unidade.
create or replace function public.manual_document_ok(p_manual_id uuid, p_document_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d join public.development_manuals m on m.id = p_manual_id
    where d.id = p_document_id and (d.development_id = m.development_id or (m.unit_id is not null and d.unit_id = m.unit_id))
  )
$$;

create or replace function public.check_manual_pdf() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pdf_document_id is not null and not (
    exists (select 1 from public.documents d where d.id = new.pdf_document_id
            and (d.development_id = new.development_id or (new.unit_id is not null and d.unit_id = new.unit_id)))
  ) then
    raise exception 'o PDF precisa ser um documento do próprio empreendimento ou da unidade' using errcode = '22023';
  end if;
  return new;
end $$;

create or replace function public.check_manual_attachment_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.document_id is not null and not public.manual_document_ok(new.manual_id, new.document_id) then
    raise exception 'o anexo precisa ser um documento do próprio empreendimento ou da unidade' using errcode = '22023';
  end if;
  return new;
end $$;
