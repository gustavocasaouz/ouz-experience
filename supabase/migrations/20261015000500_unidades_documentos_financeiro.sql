-- OUZ Experience — Etapa 3: equipe de Documentos e Financeiro identifica a unidade (código, empreendimento) para operar.
create policy units_select_docs_fin on public.units for select to authenticated
  using (public.has_staff_permission('documentos') or public.has_staff_permission('financeiro'));
create policy developments_select_docs_fin on public.developments for select to authenticated
  using (public.has_staff_permission('documentos') or public.has_staff_permission('financeiro') or public.has_staff_permission('atendimento') or public.has_staff_permission('eventos'));
