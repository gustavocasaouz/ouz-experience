-- DADOS DEMONSTRATIVOS DA ETAPA 4 — somente desenvolvimento. Catálogo e prestador fictícios, sem preços reais.
insert into public.concierge_services (development_id, category, name, description, pricing_note, requires_quote, cancellation_policy, sort_order, is_demo)
select d.id, v.c::public.concierge_category, v.n, v.d, 'Sob orçamento', v.q,
       '[Demonstrativo] Cancelamentos até 24 h antes sem custo; depois, conforme condições informadas no orçamento.', v.o, true
from public.developments d
cross join (values
  ('flores', '[Demonstrativo] Flores', 'Arranjos e entregas de flores.', true, 1),
  ('passeio_cachorro', '[Demonstrativo] Passeio com cachorro', 'Passeios agendados com cuidador.', true, 2),
  ('compras_mercado', '[Demonstrativo] Compras de mercado', 'Compras conforme lista enviada.', true, 3),
  ('limpeza', '[Demonstrativo] Limpeza', 'Limpeza residencial.', true, 4),
  ('lavanderia', '[Demonstrativo] Lavanderia', 'Coleta e entrega de roupas.', true, 5),
  ('manutencao', '[Demonstrativo] Pequenos reparos', 'Manutenção não coberta pela garantia (instalações, ajustes).', true, 6),
  ('recebimento_entregas', '[Demonstrativo] Recebimento de entregas', 'Recebimento de encomendas na portaria.', false, 7),
  ('outros', '[Demonstrativo] Outros serviços', 'Descreva o que precisa.', true, 8)
) v(c, n, d, q, o)
where d.is_demo and d.slug = 'soho'
  and not exists (select 1 from public.concierge_services s where s.development_id = d.id and s.name = v.n);

insert into public.concierge_providers (name, contact_name, phone, categories, notes, is_demo)
select '[Demonstrativo] Prestador Exemplo', 'Contato fictício', '+5548900000000', '{limpeza,lavanderia,flores}', 'Prestador fictício para testes.', true
where not exists (select 1 from public.concierge_providers where name = '[Demonstrativo] Prestador Exemplo');
