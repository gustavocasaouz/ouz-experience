-- CONTEÚDO OFICIAL da área pública (textos de ouzgroup.com.br, outubro/2026). Pode ser aplicado em qualquer ambiente.
-- Preços, unidades e condições continuam fora daqui. Fotos oficiais servidas de /brand (versionadas no app).

update public.site_sections set eyebrow = 'OUZ · Florianópolis', title = 'Criamos empreendimentos com significado',
  body = 'Vamos além do metro quadrado. Unimos design e tecnologia para criar empreendimentos exclusivos.',
  image_path = '/brand/fachada-soho.jpg', is_placeholder = false where key = 'hero';

update public.site_sections set eyebrow = 'A OUZ', title = 'Design é a nossa paixão',
  body = 'Somos uma incorporadora que desenvolve projetos inovadores com objetivo de impactar positivamente a vida das pessoas. O design é nossa paixão: exploramos constantemente novas ideias para espaços excepcionais. Buscamos ir além da construção, sendo a expressão da personalidade de cada morador, proporcionando experiências e agregando valor às vidas, sempre em busca de aprimoramento contínuo.

Cada empreendimento é uma expressão do nosso estilo de vida. Buscamos inspiração na cultura, natureza e história para narrar um novo capítulo a cada projeto. Projetamos espaços que provocam emoções, onde as pessoas se identificam, desejam estar e apreciam. Mais do que inspirar a vida, fortalecemos laços e eternizamos momentos.',
  is_placeholder = false where key = 'sobre';

update public.site_sections set eyebrow = 'Manifesto', title = 'Os detalhes transformam o comum em extraordinário',
  body = 'Espírito jovem e alma inovadora. Reinventamos espaços para construir o futuro. Transformamos simples traços na projeção de nossos sonhos. Onde cada espaço é uma ousada celebração da vida.',
  items = '[{"title":"Missão","text":"Construir espaços que inspiram as pessoas e eternizam momentos."},{"title":"Visão","text":"Destacar-se nacionalmente em incorporação com design, tecnologia e sustentabilidade."},{"title":"Valores","text":"Fazer o certo sempre. Ousar e inovar. Proporcionar experiências."}]'::jsonb,
  is_placeholder = false where key = 'atuacao';

update public.site_sections set eyebrow = 'Valores', title = 'O que nos move',
  body = null,
  items = '[{"title":"Fazer o certo sempre","text":"Transparência e responsabilidade em cada etapa."},{"title":"Ousar e inovar","text":"Design e tecnologia a serviço de espaços excepcionais."},{"title":"Proporcionar experiências","text":"Ir além da construção, agregando valor à vida de cada morador."}]'::jsonb,
  is_placeholder = false where key = 'diferenciais';

-- Empreendimentos (dados públicos do site oficial)
update public.developments set is_demo = false where slug in ('soho', 'maui', 'uman');

update public.development_public_content set
  headline = 'Inspirado no Soho de Nova Iorque, no coração de Jurerê',
  summary = 'Jurerê / Florianópolis · Entregue em 2023 · 12 unidades',
  neighborhood = 'Jurerê',
  body = 'Buscamos inspiração no bairro que deu origem ao nome do empreendimento, o SOHO, que fica localizado em Nova Iorque. Traçando um paralelo entre os dois bairros conhecidos mundialmente, Soho e Jurerê, incorporamos elementos preciosos da arquitetura e do design, tais como a madeira, o concreto e o aço, deixando-os em evidência tanto no sentido construtivo quanto estético. Inspirados no estilo de vida, criamos o Rooftop 360º, atributo predominante nos prédios de Nova Iorque, que agora faz parte do cotidiano de Jurerê.

Rua dos Polvos, 74 — Jurerê, Florianópolis.',
  highlights = '["Rooftop 360º","Madeira, concreto e aço aparentes","12 unidades","Entregue em 2023"]'::jsonb,
  cover_image_path = '/brand/ouz-soho.jpg',
  gallery = '[{"path":"/brand/fachada-soho.jpg","alt":"Fachada do SOHO"},{"path":"/brand/rooftop-soho.jpg","alt":"Rooftop do SOHO"},{"path":"/brand/rooftop-soho-piscina.jpg","alt":"Piscina no rooftop do SOHO"}]'::jsonb
where development_id = (select id from public.developments where slug = 'soho');

update public.development_public_content set
  headline = 'Equilíbrio entre corpo, mente e alma, de frente para a Praia Mole',
  summary = 'Praia Mole / Florianópolis · 26 unidades',
  neighborhood = 'Praia Mole',
  body = 'Nos inspiramos no equilíbrio entre corpo, mente e alma para criar um espaço que permita aos moradores expressar sua individualidade e desfrutar de um estilo de vida leve e exclusivo. Imagine acordar ao som das ondas e sentir a brisa do mar, enquanto aprecia as belezas naturais ao seu redor. Essa experiência única traz uma sensação de paz, conexão e harmonia diária. Um verdadeiro estímulo aos sentidos, que permite relaxar, meditar e desfrutar do momento presente. Ao mesmo tempo, uma localização ideal para aproveitar a vida urbana e prática.

Rod. Jornalista Manoel de Menezes, 1353 — Praia Mole, Florianópolis.',
  highlights = '["Vista para o mar da Praia Mole","Rooftop com piscina","26 unidades"]'::jsonb,
  cover_image_path = '/brand/ouz-maui.jpg',
  gallery = '[{"path":"/brand/ouz-maui-fachada.jpg","alt":"Fachada do MAUI"},{"path":"/brand/ouz-maui-lateral.jpg","alt":"Vista lateral do MAUI"},{"path":"/brand/ouz-maui-rooftop.jpg","alt":"Rooftop do MAUI"}]'::jsonb
where development_id = (select id from public.developments where slug = 'maui');

update public.development_public_content set
  headline = 'Em breve',
  summary = 'Pré-lançamento. Informações serão divulgadas em breve.',
  body = null, highlights = '[]'::jsonb
where development_id = (select id from public.developments where slug = 'uman');
