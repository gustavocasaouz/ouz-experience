-- OUZ Experience — anexos do manual (19/10/2026).
--
-- Cada anexo é uma linha numa seção do manual (ex.: 10.2.4 · Projeto estrutural). O arquivo é um
-- documento comum do empreendimento (documents/document_versions, bucket client-documents), ligado pela
-- equipe quando estiver pronto; até lá a linha aparece como "em breve". O cliente baixa o arquivo.

create table public.manual_attachments (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.development_manuals(id) on delete cascade,
  section_num text not null check (section_num ~ '^\d+(\.\d+)*$'),
  title text not null check (length(trim(title)) between 2 and 200),
  document_id uuid references public.documents(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (manual_id, section_num, title)
);
create index manual_attachments_manual on public.manual_attachments (manual_id, section_num, sort_order);
create trigger manual_attachments_audit after insert or update or delete on public.manual_attachments
  for each row execute function public.audit_row_change();

alter table public.manual_attachments enable row level security;
create policy manual_attachments_read on public.manual_attachments for select to authenticated using (public.can_read_manual(manual_id));
create policy manual_attachments_staff_insert on public.manual_attachments for insert to authenticated
  with check (public.has_staff_permission('conteudo'));
create policy manual_attachments_staff_update on public.manual_attachments for update to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
create policy manual_attachments_staff_delete on public.manual_attachments for delete to authenticated
  using (public.has_staff_permission('conteudo'));

revoke all on public.manual_attachments from anon;
revoke insert, update on public.manual_attachments from authenticated;
grant insert (manual_id, section_num, title, document_id, sort_order) on public.manual_attachments to authenticated;
grant update (document_id) on public.manual_attachments to authenticated;

-- O arquivo precisa ser um documento do mesmo empreendimento do manual.
create or replace function public.check_manual_attachment_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.document_id is not null and not exists (
    select 1 from public.documents d join public.development_manuals m on m.development_id = d.development_id
    where d.id = new.document_id and m.id = new.manual_id
  ) then
    raise exception 'o anexo precisa ser um documento do próprio empreendimento' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger manual_attachments_document before insert or update of document_id on public.manual_attachments
  for each row execute function public.check_manual_attachment_document();
