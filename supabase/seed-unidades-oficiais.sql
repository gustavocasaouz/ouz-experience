-- Unidades oficiais (informadas pela OUZ em 14/10/2026). Vale para qualquer ambiente.
-- Idempotente: só cria o que não existe; NÃO altera unidades já cadastradas (situação/cliente lançados depois pela OUZ).
-- SOHO: 12 apartamentos (101 à venda) + 4 lojas, todas vendidas.
-- MAUI: 26 apartamentos (101–113, 201–213); à venda 101, 108, 109, 111 e 113; demais vendidas.
-- Clientes e financeiro: planilhas de fluxo (scripts/importar-fluxo-cub.mjs) ou cadastro na administração.
with u (slug, code, typology, floor, status) as (
  values
    ('soho', '101', 'Apartamento', 1, 'disponivel'), ('soho', '102', 'Apartamento', 1, 'vendida'), ('soho', '103', 'Apartamento', 1, 'vendida'),
    ('soho', '201', 'Apartamento', 2, 'vendida'), ('soho', '202', 'Apartamento', 2, 'vendida'),
    ('soho', '301', 'Apartamento', 3, 'vendida'), ('soho', '302', 'Apartamento', 3, 'vendida'), ('soho', '303', 'Apartamento', 3, 'vendida'),
    ('soho', '401', 'Apartamento', 4, 'vendida'), ('soho', '402', 'Apartamento', 4, 'vendida'), ('soho', '403', 'Apartamento', 4, 'vendida'),
    ('soho', '404', 'Apartamento', 4, 'vendida'),
    ('soho', 'Loja 01', 'Loja', null, 'vendida'), ('soho', 'Loja 02', 'Loja', null, 'vendida'),
    ('soho', 'Loja 03', 'Loja', null, 'vendida'), ('soho', 'Loja 04', 'Loja', null, 'vendida')
  union all
  select 'maui', (f * 100 + n)::text, 'Apartamento', f,
         case when f = 1 and n in (1, 8, 9, 11, 13) then 'disponivel' else 'vendida' end
    from generate_series(1, 2) f, generate_series(1, 13) n
)
insert into public.units (development_id, code, typology, floor, status)
select d.id, u.code, u.typology, u.floor, u.status::public.unit_status
  from u join public.developments d on d.slug = u.slug
on conflict (development_id, code) do nothing;

-- Habite-se do SOHO (informado pela OUZ): 24/02/2023. Unidades vendidas do SOHO estão quitadas; sem reajuste.
update public.developments set habite_se_date = '2023-02-24' where slug = 'soho' and habite_se_date is null;
