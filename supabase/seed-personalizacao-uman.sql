-- Catálogo de personalização do UMAN — PONTO DE PARTIDA (desenvolvimento). Itens e valores são exemplos para a OUZ
-- revisar em Admin › Empreendimentos › UMAN › Personalização. Idempotente: só inclui itens que ainda não existem.
-- Uso: node --env-file=.env.local scripts/aplicar-seed.mjs supabase/seed-personalizacao-uman.sql

with dev as (select id from public.developments where slug = 'uman'),
catalog (category, title, description, sort_order, choices) as (values
  ('Pisos', 'Piso das áreas sociais', 'Estar, jantar e cozinha.', 10, '[
    {"t":"Porcelanato 90×90 cm acetinado","s":true},
    {"t":"Porcelanato 120×120 cm","d":"Menos juntas, aspecto contínuo.","p":12000},
    {"t":"Porcelanato 120×240 cm","d":"Placas grandes, efeito monolítico.","p":24000},
    {"t":"Madeira engenheirada em régua","d":"Carvalho natural, acabamento fosco.","p":28000}]'::jsonb),
  ('Pisos', 'Piso dos dormitórios', null, 20, '[
    {"t":"Porcelanato 90×90 cm acetinado","s":true},
    {"t":"Vinílico em régua","d":"Conforto acústico e térmico.","p":6500},
    {"t":"Madeira engenheirada em régua","p":14000}]'::jsonb),
  ('Pintura', 'Cores das paredes internas', null, 30, '[
    {"t":"Branco neve fosco","s":true},
    {"t":"Paleta OUZ","d":"Até 3 cores da paleta, aplicadas por ambiente.","p":2800},
    {"t":"Parede de destaque","d":"Textura mineral ou cimento queimado em uma parede da sala.","p":4500}]'::jsonb),
  ('Planta baixa', 'Configuração da planta', 'Alterações aceitas até o fim da estrutura do pavimento.', 40, '[
    {"t":"Planta original (3 dormitórios, 1 suíte)","s":true},
    {"t":"Living ampliado","d":"Terceiro dormitório integrado à sala.","p":0},
    {"t":"Cozinha integrada","d":"Sem parede entre cozinha e estar, com ilha.","p":4200},
    {"t":"Suíte master ampliada","d":"Une a suíte ao dormitório vizinho, com closet.","p":9800}]'::jsonb),
  ('Ar-condicionado', 'Climatização', null, 50, '[
    {"t":"Infraestrutura para split","d":"Pontos de dreno, elétrica e tubulação na sala e nos dormitórios.","s":true},
    {"t":"Sistema dutado","d":"Forro rebaixado e grelhas lineares; uma condensadora.","p":38000},
    {"t":"VRF com evaporadoras embutidas","d":"Controle independente por ambiente.","p":62000}]'::jsonb),
  ('Banheiros', 'Bancada da suíte', null, 60, '[
    {"t":"Granito com cuba de louça","s":true},
    {"t":"Quartzo branco com cuba esculpida","p":7800}]'::jsonb),
  ('Banheiros', 'Metais', null, 70, '[
    {"t":"Cromado","s":true},
    {"t":"Preto fosco","p":4600},
    {"t":"Dourado escovado","p":5200}]'::jsonb),
  ('Banheiros', 'Box e piso aquecido', null, 80, '[
    {"t":"Box de vidro temperado incolor","s":true},
    {"t":"Box até o teto","p":3200},
    {"t":"Box até o teto + piso aquecido na suíte","p":9100}]'::jsonb),
  ('Cozinha', 'Bancada da cozinha', null, 90, '[
    {"t":"Granito","s":true},
    {"t":"Quartzo","p":9500},
    {"t":"Pedra sinterizada","d":"Resistente a calor e manchas.","p":16000}]'::jsonb),
  ('Automação e iluminação', 'Automação', null, 100, '[
    {"t":"Infraestrutura para automação","d":"Tubulação seca e quadro preparado.","s":true},
    {"t":"Iluminação por cenas","d":"Sala e suíte, controle pelo celular.","p":11000},
    {"t":"Iluminação, cortinas e áudio","d":"Pacote completo com cortinas motorizadas.","p":26000}]'::jsonb)
),
items as (
  insert into public.customization_items (development_id, category, title, description, sort_order)
  select dev.id, c.category, c.title, c.description, c.sort_order from catalog c, dev
  where not exists (select 1 from public.customization_items i where i.development_id = dev.id and i.title = c.title)
  returning id, title
)
insert into public.customization_choices (item_id, title, description, price, is_standard, sort_order)
select items.id, ch->>'t', ch->>'d', coalesce((ch->>'p')::numeric, 0), coalesce((ch->>'s')::boolean, false), n
from items join catalog c on c.title = items.title
cross join lateral jsonb_array_elements(c.choices) with ordinality as e(ch, n);
