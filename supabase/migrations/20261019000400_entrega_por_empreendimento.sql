-- OUZ Experience — aba "Entrega e garantia" liberada por empreendimento (19/10/2026).
--
-- O portal do SOHO fica enxuto para os proprietários (sem "Entrega e garantia" e sem "Manual");
-- o MAUI usa a área completa na entrega de janeiro/2027. A aba "Manual" já depende de manual publicado.

alter table public.developments add column client_delivery_enabled boolean not null default true;
update public.developments set client_delivery_enabled = false where slug = 'soho' and not is_demo;
comment on column public.developments.client_delivery_enabled is 'Clientes veem a aba de vistoria/entrega e garantia da unidade.';
grant update (client_delivery_enabled) on public.developments to authenticated;  -- RLS: só staff com permissão conteudo
