-- DADOS DEMONSTRATIVOS DA ETAPA 3 — somente desenvolvimento. Tudo identificado como [Demonstrativo]; nada é real.
-- Idempotente: pode ser executado mais de uma vez.

-- Linha do tempo do SOHO
insert into public.development_milestones (development_id, stage, title, forecast_date, completed_on, sort_order, is_published)
select '00000000-0000-4000-8000-000000000001', s::public.milestone_stage, t, f::date, c::date, o, true
from (values
  ('lancamento', '[Demonstrativo] Lançamento', '2024-03-01', '2024-03-01', 1),
  ('obra', '[Demonstrativo] Fundações', '2024-09-30', '2024-10-15', 2),
  ('obra', '[Demonstrativo] Estrutura', '2026-06-30', null, 3),
  ('entrega', '[Demonstrativo] Vistoria e entrega das chaves', '2028-06-30', null, 4)
) v(s, t, f, c, o)
where not exists (select 1 from public.development_milestones where title = v.t);

insert into public.progress_reports (development_id, reference_date, overall_percent, items, notes, published_at)
select '00000000-0000-4000-8000-000000000001', current_date - 5, 42.5,
  '[{"label":"Fundações","percent":100},{"label":"Estrutura","percent":70},{"label":"Alvenaria","percent":25},{"label":"Instalações","percent":10}]'::jsonb,
  '[Demonstrativo] Percentuais fictícios para teste.', now()
where not exists (select 1 from public.progress_reports where notes like '[Demonstrativo]%');

insert into public.development_updates (development_id, title, body, published_at)
select '00000000-0000-4000-8000-000000000001', '[Demonstrativo] Concretagem da laje do 8º pavimento',
  'Texto fictício de atualização da obra, para validar o layout.', now() - interval '2 days'
where not exists (select 1 from public.development_updates where title like '[Demonstrativo]%');

insert into public.announcements (development_id, title, body, published_at)
select '00000000-0000-4000-8000-000000000001', '[Demonstrativo] Visita técnica agendada',
  'Comunicado fictício para teste do portal do cliente.', now() - interval '1 day'
where not exists (select 1 from public.announcements where title like '[Demonstrativo]%');

-- Financeiro fictício da unidade DEMO-101 do SOHO (vinculada ao cliente de teste)
insert into public.financial_contracts (unit_id, contract_value, signed_on, notes)
select u.id, 1025000, current_date - 400, '[Demonstrativo] valores fictícios'
from public.units u
where u.development_id = '00000000-0000-4000-8000-000000000001' and u.code = 'DEMO-101'
on conflict (unit_id) do nothing;

insert into public.installments (contract_id, number, kind, due_date, original_amount, monetary_update, interest, fine, updated_amount, paid_amount, paid_on, status)
select c.id, v.n, v.k::public.installment_kind, current_date + v.d, v.o, v.u, v.j, v.m, v.a, v.p, case when v.p > 0 then current_date + v.d end,
       v.s::public.installment_status
from public.financial_contracts c
join public.units u on u.id = c.unit_id and u.code = 'DEMO-101' and u.development_id = '00000000-0000-4000-8000-000000000001'
cross join (values
  (1, 'entrada', -390, 307500.00, null::numeric, null::numeric, null::numeric, null::numeric, 307500.00, 'paga'),
  (2, 'parcela', -60, 10250.00, null, null, null, null, 10250.00, 'paga'),
  (3, 'parcela', -30, 10250.00, 98.40, 102.50, 205.00, 10655.90, 0, 'aberta'),
  (4, 'parcela', 0, 10250.00, null, null, null, null, 0, 'aberta'),
  (5, 'parcela', 30, 10250.00, null, null, null, null, 0, 'aberta'),
  (6, 'chaves', 620, 512500.00, null, null, null, null, 0, 'aberta')
) v(n, k, d, o, u, j, m, a, p, s)
on conflict (contract_id, number) do nothing;

-- Horários de vistoria no SOHO (próxima semana)
insert into public.appointment_slots (development_id, kind, starts_at, ends_at, location)
select '00000000-0000-4000-8000-000000000001', 'vistoria',
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '7 days' + make_interval(hours => h)) at time zone 'America/Sao_Paulo',
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '7 days' + make_interval(hours => h + 1)) at time zone 'America/Sao_Paulo',
       '[Demonstrativo] Plantão SOHO'
from generate_series(9, 12) h
where not exists (select 1 from public.appointment_slots where location like '[Demonstrativo]%');

-- Evento para clientes com capacidade e lista de espera
insert into public.events (title, description, location_text, starts_at, audience, capacity, is_published, is_demo, rsvp_enabled, reminder_hours)
select '[Demonstrativo] Encontro de proprietários', 'Evento fictício para teste de confirmação de presença.', 'Florianópolis — local a definir',
       now() + interval '15 days', 'clientes', 30, true, true, true, 24
where not exists (select 1 from public.events where title = '[Demonstrativo] Encontro de proprietários');
