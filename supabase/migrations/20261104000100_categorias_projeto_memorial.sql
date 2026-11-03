-- OUZ Experience — categorias de documento "Projetos" e "Memorial descritivo" (04/11/2026).
-- Em arquivo próprio: valores novos de enum só podem ser usados depois que esta transação termina.

alter type public.document_category add value if not exists 'projeto' before 'outro';
alter type public.document_category add value if not exists 'memorial_descritivo' before 'outro';

create type public.project_discipline as enum (
  'arquitetonico', 'estrutural', 'fundacoes', 'hidrossanitario', 'eletrico', 'gas', 'preventivo_incendio',
  'climatizacao', 'luminotecnico', 'telecomunicacoes', 'impermeabilizacao', 'paisagismo', 'interiores', 'outros'
);
