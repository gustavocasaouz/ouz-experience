-- OUZ Experience — Etapa 1: seções institucionais editáveis da área pública

create table public.site_sections (
  key text primary key check (key in ('hero', 'sobre', 'atuacao', 'diferenciais')),
  eyebrow text,
  title text not null,
  body text,
  items jsonb not null default '[]'::jsonb,   -- [{title, text}]
  image_path text,                            -- bucket public-media
  is_placeholder boolean not null default true,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger site_sections_updated_at before update on public.site_sections
  for each row execute function public.set_updated_at();
create trigger site_sections_audit after insert or update or delete on public.site_sections
  for each row execute function public.audit_row_change();

alter table public.site_sections enable row level security;
create policy site_sections_select on public.site_sections for select to anon, authenticated using (true);
create policy site_sections_write on public.site_sections for update to authenticated
  using (public.has_staff_permission('conteudo')) with check (public.has_staff_permission('conteudo'));
revoke insert, delete on public.site_sections from authenticated;
revoke insert, update, delete on public.site_sections from anon;

-- Textos provisórios (is_placeholder = true) — a OUZ substitui pela administração.
insert into public.site_sections (key, eyebrow, title, body, items) values
  ('hero', 'Florianópolis', 'Empreendimentos de alto padrão', 'Texto de apresentação provisório. Substitua pelo conteúdo oficial na administração.', '[]'),
  ('sobre', 'A OUZ', 'Construtora e incorporadora', 'Texto institucional provisório sobre a OUZ, sua história e seus valores.', '[]'),
  ('atuacao', 'Atuação', 'Do projeto à entrega', 'Texto provisório sobre a atuação da OUZ.', '[{"title":"Incorporação","text":"Descrição a definir."},{"title":"Construção","text":"Descrição a definir."},{"title":"Relacionamento","text":"Descrição a definir."}]'),
  ('diferenciais', 'Diferenciais', 'O que nos move', null, '[{"title":"Diferencial","text":"Descrição a definir."},{"title":"Diferencial","text":"Descrição a definir."},{"title":"Diferencial","text":"Descrição a definir."}]')
on conflict (key) do nothing;
