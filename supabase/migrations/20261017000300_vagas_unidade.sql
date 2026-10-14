-- OUZ Experience — vagas de garagem descritas por unidade (ex.: "7/7A no subsolo + 4C no térreo").
alter table public.units add column parking text check (parking is null or length(parking) between 1 and 160);
