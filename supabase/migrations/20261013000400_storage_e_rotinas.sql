-- OUZ Experience — Etapa 1: buckets e políticas de Storage; rotinas agendadas
-- Regra: o primeiro segmento do caminho é o ID da entidade dona.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media',       'public-media',       true,  15728640, array['image/jpeg','image/png','image/webp','image/avif']),
  ('broker-content',     'broker-content',     false, 52428800, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('broker-documents',   'broker-documents',   false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('client-documents',   'client-documents',   false, 52428800, array['application/pdf','image/jpeg','image/png']),
  ('proposal-documents', 'proposal-documents', false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('ticket-attachments', 'ticket-attachments', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do nothing;

-- public-media: leitura pública (bucket público); escrita só staff de conteúdo.
create policy "public-media: staff escreve" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and public.has_staff_permission('conteudo'));
create policy "public-media: staff altera" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and public.has_staff_permission('conteudo'));
create policy "public-media: staff remove" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and public.has_staff_permission('conteudo'));

-- broker-content/{development_id}/...: corretor autorizado lê (URL assinada gerada com a sessão dele).
create policy "broker-content: leitura autorizada" on storage.objects for select to authenticated
  using (bucket_id = 'broker-content' and (
    public.broker_can_access_development(public.try_uuid((storage.foldername(name))[1]))
    or public.has_staff_permission('conteudo') or public.has_staff_permission('comercial')));
create policy "broker-content: staff escreve" on storage.objects for insert to authenticated
  with check (bucket_id = 'broker-content' and public.has_staff_permission('conteudo'));
create policy "broker-content: staff remove" on storage.objects for delete to authenticated
  using (bucket_id = 'broker-content' and public.has_staff_permission('conteudo'));

-- broker-documents/{user_id}/...: o próprio corretor (enquanto em análise) e staff de corretores.
create policy "broker-documents: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'broker-documents' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.has_staff_permission('corretores')));
create policy "broker-documents: envio pelo corretor" on storage.objects for insert to authenticated
  with check (bucket_id = 'broker-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- client-documents/{unit_id}/...: cliente vinculado à unidade e staff de documentos.
create policy "client-documents: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and (
    public.is_client_of_unit(public.try_uuid((storage.foldername(name))[1]))
    or public.has_staff_permission('documentos')));
create policy "client-documents: staff escreve" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and public.has_staff_permission('documentos'));
-- Sem update/delete: versões novas são novos objetos (histórico preservado).

-- proposal-documents e ticket-attachments: políticas detalhadas nas Etapas 2 e 3.
create policy "proposal-documents: staff comercial" on storage.objects for select to authenticated
  using (bucket_id = 'proposal-documents' and (public.has_staff_permission('comercial') or public.has_staff_permission('documentos')));
create policy "ticket-attachments: staff atendimento" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments' and public.has_staff_permission('atendimento'));

-- ---------------------------------------------------------------------------
-- Rotinas agendadas (pg_cron). Habilite a extensão pg_cron no painel do Supabase antes.
-- Em ambientes sem pg_cron a migração segue sem agendar.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ouz-retencao-diaria', '30 6 * * *', 'select public.apply_retention()');
    -- Etapa 2 adiciona: perform cron.schedule('ouz-prazos-reservas', '* * * * *', 'select public.process_reservation_deadlines()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;
