-- OUZ Experience — abas "Projetos" (por especialidade) e "Memorial descritivo" na unidade (04/11/2026).
--
-- Projetos são documentos da categoria "projeto" com a especialidade (arquitetônico, estrutural, hidrossanitário…);
-- podem ser do empreendimento (valem para todas as unidades) ou da unidade (ex.: planta "as built" do apartamento).
-- O memorial descritivo é um documento da categoria "memorial_descritivo". Com a aba ligada, esses arquivos saem
-- da aba Documentos e ficam na aba própria.

alter table public.documents add column discipline public.project_discipline;
alter table public.documents add constraint documents_discipline_only_projects
  check ((category = 'projeto') = (discipline is not null));
comment on column public.documents.discipline is 'Especialidade do projeto (obrigatória na categoria "projeto"; vazia nas demais).';

alter table public.developments drop constraint developments_client_tabs_check;
alter table public.developments add constraint developments_client_tabs_check check (client_tabs <@ array[
  'acompanhamento', 'documentos', 'projetos', 'memorial', 'financeiro', 'personalizacao', 'entrega', 'manual'
]);

update public.developments set client_tabs = array_append(client_tabs, 'projetos')
  where slug in ('maui', 'uman') and not is_demo and not ('projetos' = any (client_tabs));
update public.developments set client_tabs = array_append(client_tabs, 'memorial')
  where slug = 'uman' and not is_demo and not ('memorial' = any (client_tabs));
