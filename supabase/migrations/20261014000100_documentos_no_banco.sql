-- OUZ Experience — Etapa 2 (pré-requisito): validação de CPF/CNPJ e hash de documento DENTRO do banco.
-- Motivo: o hash usado para detectar duplicidades não pode vir do cliente (poderia ser forjado via API).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
-- Camada extra: além do esquema sem acesso, RLS ligado e sem policies (só o dono/funções security definer leem).
alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated;
insert into private.app_secrets (key, value)
values ('document_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Validadores (mesma regra do src/domain/documentos.ts)
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_cpf(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- CNPJ numérico ou alfanumérico (valor do caractere = código ASCII − 48).
create or replace function public.is_valid_cnpj(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  c text := regexp_replace(upper(coalesce(p, '')), '[^0-9A-Z]', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' or c ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> substr(c, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + (ascii(substr(c, i, 1)) - 48) * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = substr(c, 14, 1)::int;
end $$;

-- Hash com pepper guardado no esquema privado. Não executável por usuários.
create or replace function public.document_hash(p_normalized text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(p_normalized, (select value from private.app_secrets where key = 'document_pepper'), 'sha256'), 'hex')
$$;
revoke execute on function public.document_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: o hash é sempre recalculado pelo banco (valor enviado é ignorado)
-- ---------------------------------------------------------------------------
create or replace function public.set_broker_cpf_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.cpf := regexp_replace(new.cpf, '\D', '', 'g');
  new.cpf_hash := public.document_hash(new.cpf);
  if new.agency_cnpj is not null then new.agency_cnpj := regexp_replace(upper(new.agency_cnpj), '[^0-9A-Z]', '', 'g'); end if;
  return new;
end $$;
create trigger broker_profiles_hash before insert or update of cpf, cpf_hash, agency_cnpj on public.broker_profiles
  for each row execute function public.set_broker_cpf_hash();

create or replace function public.set_client_document_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.document_number := regexp_replace(upper(new.document_number), '[^0-9A-Z]', '', 'g');
  new.document_hash := public.document_hash(new.document_number);
  return new;
end $$;
create trigger client_identities_hash before insert or update of document_number, document_hash on public.client_identities
  for each row execute function public.set_client_document_hash();

-- Recalcula registros existentes com o pepper do banco (UPDATE sem WHERE é intencional: todas as linhas).
update public.broker_profiles set cpf_hash = cpf_hash;
update public.client_identities set document_hash = document_hash;

-- Validação de dígitos também no banco (defesa em profundidade).
alter table public.broker_profiles add constraint broker_profiles_cpf_valido check (public.is_valid_cpf(cpf));
alter table public.broker_profiles add constraint broker_profiles_cnpj_valido check (agency_cnpj is null or public.is_valid_cnpj(agency_cnpj));
alter table public.client_identities add constraint client_identities_documento_valido check (
  (document_type = 'cpf' and public.is_valid_cpf(document_number)) or (document_type = 'cnpj' and public.is_valid_cnpj(document_number))
);
