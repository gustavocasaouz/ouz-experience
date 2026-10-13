-- DADOS DEMONSTRATIVOS DA ETAPA 2 — somente desenvolvimento.
-- Preços, políticas e checklist abaixo são FICTÍCIOS e identificados como tal. Não representam condições reais da OUZ.

-- Modos de venda de exemplo: SOHO e MAUI abertos; UMAN em pré-lançamento.
update public.development_commercial_settings set sales_mode = 'aberto', keys_expected_date = date '2028-06-30'
 where development_id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
update public.development_commercial_settings set sales_mode = 'pre_lancamento', keys_expected_date = null
 where development_id = '00000000-0000-4000-8000-000000000003';

update public.units set status = 'disponivel' where is_demo and status = 'indisponivel';

-- Tabelas v1 (vigentes) para os três empreendimentos — valores fictícios.
insert into public.price_tables (id, development_id, version_number, status, notes, is_demo, published_at)
select gen_random_uuid(), d.id, 1, 'rascunho', '[Demonstrativo] valores fictícios', true, null
from public.developments d
where d.is_demo and not exists (select 1 from public.price_tables pt where pt.development_id = d.id);

insert into public.price_table_items (price_table_id, unit_id, price)
select pt.id, u.id, 1000000 + (substring(u.code from '\d+')::int - 100) * 25000
from public.price_tables pt join public.units u on u.development_id = pt.development_id
where pt.is_demo and pt.status = 'rascunho'
on conflict do nothing;

update public.price_tables set status = 'vigente', published_at = now() where is_demo and status = 'rascunho';

-- Política v1 de exemplo (identificada como demonstrativa).
insert into public.sales_policies (development_id, version_number, status, rules, notes, is_demo, published_at)
select d.id, 1, 'vigente',
  '{"padrao": {"desconto_maximo_percentual": 5, "entrada_minima_percentual": 20, "percentual_minimo_ate_chaves": 40,
                "prazo_maximo_meses": 120, "parcelas_max_quantidade": 100, "reforcos_max_quantidade": 10,
                "permuta_permitida": false, "exigir_analise_pessoa_juridica": true},
    "por_tipologia": {}, "por_unidade": {}}'::jsonb,
  '[Demonstrativo] regras fictícias para testes', true, now()
from public.developments d
where d.is_demo and not exists (select 1 from public.sales_policies sp where sp.development_id = d.id);

-- Checklist global de exemplo.
insert into public.document_checklist_items (development_id, person_type, label, required, sort_order)
select null, t.person_type::public.person_type, t.label, t.required, t.sort_order
from (values
  ('pf', '[Demonstrativo] Documento de identificação com foto', true, 1),
  ('pf', '[Demonstrativo] Comprovante de residência', true, 2),
  ('pf', '[Demonstrativo] Comprovante de estado civil', false, 3),
  ('pj', '[Demonstrativo] Contrato social e alterações', true, 1),
  ('pj', '[Demonstrativo] Documento do representante legal', true, 2)
) as t(person_type, label, required, sort_order)
where not exists (select 1 from public.document_checklist_items where label = t.label);

-- Campanha de pré-lançamento do UMAN (rascunho, para a OUZ abrir quando quiser).
insert into public.prelaunch_campaigns (development_id, name, status, max_registrations_per_client)
select '00000000-0000-4000-8000-000000000003', '[Demonstrativo] UMAN — registro de interesse', 'aberta', 1
where not exists (select 1 from public.prelaunch_campaigns where development_id = '00000000-0000-4000-8000-000000000003');
