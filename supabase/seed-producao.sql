-- PRODUÇÃO — dados iniciais mínimos (sem nada demonstrativo). Idempotente.
-- Empreendimentos de referência; unidades, tabelas, políticas e checklist são cadastrados pela OUZ na administração.
insert into public.developments (slug, name, stage, is_published, broker_access_mode, sort_order, is_demo) values
  ('soho', 'SOHO', 'entregue', true, 'aberto', 1, false),
  ('maui', 'MAUI', 'em_entrega', true, 'aberto', 2, false),
  ('uman', 'UMAN', 'pre_lancamento', true, 'restrito', 3, false)
on conflict (slug) do nothing;

insert into public.development_public_content (development_id)
select id from public.developments where slug in ('soho', 'maui', 'uman')
on conflict (development_id) do nothing;

insert into public.development_teasers (development_id, title, message)
select id, 'UMAN — em breve', 'Informações comerciais serão liberadas a corretores autorizados.'
from public.developments where slug = 'uman'
on conflict (development_id) do nothing;

-- Vendas fechadas até a OUZ cadastrar unidades, tabela e política e abrir na administração.
update public.development_commercial_settings set sales_mode = 'fechado';
