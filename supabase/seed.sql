-- DADOS DEMONSTRATIVOS — somente ambiente de desenvolvimento.
-- Tudo marcado com is_demo = true. Nenhum preço, prazo, área ou disponibilidade real.
-- SOHO, MAUI e UMAN são referências editáveis; textos são provisórios.

insert into public.developments (id, slug, name, stage, is_published, broker_access_mode, sort_order, is_demo) values
  ('00000000-0000-4000-8000-000000000001', 'soho', 'SOHO', 'entregue',       true, 'aberto',   1, true),
  ('00000000-0000-4000-8000-000000000002', 'maui', 'MAUI', 'em_entrega',     true, 'aberto',   2, true),
  ('00000000-0000-4000-8000-000000000003', 'uman', 'UMAN', 'pre_lancamento', true, 'restrito', 3, true)
on conflict (id) do nothing;

insert into public.development_public_content (development_id, headline, summary, highlights) values
  ('00000000-0000-4000-8000-000000000001', '[Demonstrativo] SOHO', 'Texto provisório. Substituir pelo conteúdo oficial da OUZ.', '["Diferencial a definir", "Diferencial a definir"]'),
  ('00000000-0000-4000-8000-000000000002', '[Demonstrativo] MAUI', 'Texto provisório. Substituir pelo conteúdo oficial da OUZ.', '["Diferencial a definir"]'),
  ('00000000-0000-4000-8000-000000000003', '[Demonstrativo] UMAN', 'Pré-lançamento. Texto provisório.', '[]')
on conflict (development_id) do nothing;

insert into public.development_teasers (development_id, title, message) values
  ('00000000-0000-4000-8000-000000000003', 'UMAN — em breve', 'Informações comerciais serão liberadas a corretores autorizados.')
on conflict (development_id) do nothing;

insert into public.development_broker_content (development_id, presentation, early_information) values
  ('00000000-0000-4000-8000-000000000001', '[Demonstrativo] Apresentação restrita do SOHO.', null),
  ('00000000-0000-4000-8000-000000000002', '[Demonstrativo] Apresentação restrita do MAUI.', null),
  ('00000000-0000-4000-8000-000000000003', '[Demonstrativo] Conteúdo restrito do UMAN.', '[Demonstrativo] Informação antecipada visível só a autorizados.')
on conflict (development_id) do nothing;

insert into public.units (development_id, code, typology, status, is_demo)
select d.id, 'DEMO-' || n, 'Tipologia demonstrativa', 'indisponivel', true
from public.developments d cross join generate_series(101, 104) n
where d.is_demo
on conflict (development_id, code) do nothing;

insert into public.news_posts (slug, title, excerpt, published_at, is_demo) values
  ('novidade-demonstrativa', '[Demonstrativo] Novidade de exemplo', 'Conteúdo fictício para validar o layout.', now(), true)
on conflict (slug) do nothing;

insert into public.events (title, description, location_text, starts_at, audience, is_published, is_demo) values
  ('[Demonstrativo] Evento aberto', 'Evento fictício para validar o layout.', 'Florianópolis — local a definir', now() + interval '20 days', 'geral', true, true);
