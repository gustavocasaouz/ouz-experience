-- OUZ Experience — Etapa 3: documentos privados com versões e informações financeiras do cliente.
-- Não é ERP: a OUZ alimenta (manual ou importação validada). Comprovante enviado NÃO baixa parcela.

create type public.document_category as enum ('contrato', 'aditivo', 'comprovante', 'documento_unidade', 'vistoria_entrega', 'manual', 'outro');
create type public.installment_kind as enum ('entrada', 'parcela', 'reforco', 'chaves', 'outro');
create type public.installment_status as enum ('aberta', 'paga', 'parcialmente_paga', 'renegociada', 'cancelada');
create type public.receipt_status as enum ('enviado', 'validado', 'recusado');
create type public.inquiry_status as enum ('aberta', 'respondida', 'encerrada');

-- ---------------------------------------------------------------------------
-- Documentos (unidade ou empreendimento), versões imutáveis
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units (id) on delete cascade,
  development_id uuid references public.developments (id) on delete cascade,
  category public.document_category not null,
  title text not null check (length(title) between 2 and 200),
  description text,
  visible_to_client boolean not null default true,
  data_source public.data_source not null default 'experience',
  external_ref text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(unit_id, development_id) = 1)
);
create index documents_unit_idx on public.documents (unit_id);
create index documents_dev_idx on public.documents (development_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function public.audit_row_change();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_number integer not null,
  storage_path text not null,               -- client-documents/{unit_id}/... ou client-documents/empreendimento/{development_id}/...
  mime_type text,
  size_bytes integer,
  notes text,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  unique (document_id, version_number)
);
create trigger document_versions_audit after insert on public.document_versions
  for each row execute function public.audit_row_change();
create or replace function public.block_version_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'versões de documento são imutáveis'; end $$;
create trigger document_versions_immutable before update on public.document_versions
  for each row execute function public.block_version_mutation();

-- Registra nova versão (número sequencial calculado no banco) e avisa o cliente.
create or replace function public.admin_add_document_version(p_document_id uuid, p_storage_path text, p_mime text, p_size integer, p_notes text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare d public.documents; v_n int; c record;
begin
  if not public.has_staff_permission('documentos') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into d from public.documents where id = p_document_id for update;
  if d.id is null then raise exception 'documento não encontrado' using errcode = '22023'; end if;
  if (d.unit_id is not null and p_storage_path not like d.unit_id::text || '/%')
     or (d.development_id is not null and p_storage_path not like 'empreendimento/' || d.development_id::text || '/%') then
    raise exception 'caminho de arquivo inválido' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_n from public.document_versions where document_id = d.id;
  insert into public.document_versions (document_id, version_number, storage_path, mime_type, size_bytes, notes, uploaded_by)
  values (d.id, v_n, p_storage_path, p_mime, p_size, nullif(trim(p_notes), ''), auth.uid());
  update public.documents set updated_at = now() where id = d.id;
  if d.visible_to_client then
    for c in
      select distinct cl.user_id from public.clients cl
      join public.client_units cu on cu.client_id = cl.id and cu.active
      join public.units u on u.id = cu.unit_id
      where cl.user_id is not null and (u.id = d.unit_id or u.development_id = d.development_id)
    loop
      perform public.notify_user(c.user_id, 'documento', 'Novo documento disponível', d.title, '/cliente', 'documento:' || d.id || ':v' || v_n);
    end loop;
  end if;
  return v_n;
end $$;

create or replace function public.can_read_document(p_document_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and (
      public.has_staff_permission('documentos')
      or (d.visible_to_client and (
            (d.unit_id is not null and public.is_client_of_unit(d.unit_id))
         or (d.development_id is not null and public.is_client_of_development(d.development_id))))
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Financeiro do cliente (por unidade/contrato)
-- ---------------------------------------------------------------------------
create table public.financial_contracts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references public.units (id) on delete cascade,
  contract_value numeric(14,2) not null check (contract_value > 0),
  signed_on date,
  notes text,
  data_source public.data_source not null default 'experience',
  external_ref text,
  last_updated_at timestamptz not null default now(),   -- exibida ao cliente
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create trigger financial_contracts_audit after insert or update or delete on public.financial_contracts
  for each row execute function public.audit_row_change();

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.financial_contracts (id) on delete cascade,
  number integer not null check (number > 0),
  kind public.installment_kind not null default 'parcela',
  due_date date not null,
  original_amount numeric(14,2) not null check (original_amount >= 0),
  monetary_update numeric(14,2),            -- atualização (índice) — informada, nunca calculada aqui
  interest numeric(14,2),                   -- juros — informados
  fine numeric(14,2),                       -- multa — informada
  updated_amount numeric(14,2),             -- valor atualizado — informado
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  paid_on date,
  status public.installment_status not null default 'aberta',
  data_source public.data_source not null default 'experience',
  external_ref text,
  updated_at timestamptz not null default now(),
  unique (contract_id, number)
);
create index installments_contract_idx on public.installments (contract_id, due_date);
create trigger installments_updated_at before update on public.installments
  for each row execute function public.set_updated_at();
create trigger installments_audit after insert or update or delete on public.installments
  for each row execute function public.audit_row_change();

create or replace function public.touch_financial_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.financial_contracts set last_updated_at = now() where id = coalesce(new.contract_id, old.contract_id);
  return coalesce(new, old);
end $$;
create trigger installments_touch_contract after insert or update or delete on public.installments
  for each row execute function public.touch_financial_contract();

-- Situação para exibição (vencida é derivada, nunca gravada por adivinhação).
create or replace view public.installments_view with (security_invoker = true) as
  select i.*,
         case
           when i.status in ('paga', 'cancelada', 'renegociada') then i.status::text
           when i.due_date < (now() at time zone 'America/Sao_Paulo')::date then 'vencida'
           when i.status = 'parcialmente_paga' then 'parcialmente_paga'
           else 'a_vencer'
         end as display_status
  from public.installments i;

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.financial_contracts (id) on delete cascade,
  installment_id uuid references public.installments (id) on delete set null,
  storage_path text not null,                -- client-documents/{unit_id}/comprovantes/...
  informed_amount numeric(14,2) check (informed_amount is null or informed_amount > 0),
  informed_paid_on date,
  client_note text,
  status public.receipt_status not null default 'enviado',
  review_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now()
);
create trigger payment_receipts_audit after insert or update on public.payment_receipts
  for each row execute function public.audit_row_change();

create table public.financial_inquiries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.financial_contracts (id) on delete cascade,
  installment_id uuid references public.installments (id) on delete set null,
  message text not null check (length(message) between 3 and 4000),
  status public.inquiry_status not null default 'aberta',
  response text,
  responded_by uuid references public.profiles (id),
  responded_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.financial_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  rows_count integer not null,
  summary jsonb not null default '{}'::jsonb,
  imported_by uuid references public.profiles (id),
  imported_at timestamptz not null default now()
);

create or replace function public.is_client_of_contract(p_contract_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.financial_contracts c where c.id = p_contract_id and public.is_client_of_unit(c.unit_id))
$$;

-- Cliente envia comprovante: fica "enviado" até a OUZ validar. Não altera a parcela.
create or replace function public.client_submit_receipt(p_contract_id uuid, p_installment_id uuid, p_storage_path text,
                                                        p_amount numeric, p_paid_on date, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_id uuid;
begin
  select unit_id into v_unit from public.financial_contracts where id = p_contract_id;
  if v_unit is null or not public.is_client_of_unit(v_unit) then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_installment_id is not null and not exists (select 1 from public.installments where id = p_installment_id and contract_id = p_contract_id) then
    raise exception 'parcela inválida' using errcode = '22023';
  end if;
  if p_storage_path not like v_unit::text || '/comprovantes/%' then raise exception 'caminho de arquivo inválido' using errcode = '22023'; end if;
  insert into public.payment_receipts (contract_id, installment_id, storage_path, informed_amount, informed_paid_on, client_note, uploaded_by)
  values (p_contract_id, p_installment_id, p_storage_path, p_amount, p_paid_on, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  perform public.notify_staff('financeiro', 'comprovante', 'Comprovante de pagamento para validar', 'Enviado pelo cliente.',
    '/admin/financeiro', 'comprovante:' || v_id);
  return v_id;
end $$;

-- Validação autorizada: só aqui a parcela pode receber baixa.
create or replace function public.admin_review_receipt(p_receipt_id uuid, p_approve boolean, p_note text,
                                                       p_register_payment boolean, p_amount numeric, p_paid_on date)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.payment_receipts; i public.installments; v_user uuid;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into r from public.payment_receipts where id = p_receipt_id for update;
  if r.id is null or r.status <> 'enviado' then raise exception 'comprovante já analisado' using errcode = '22023'; end if;
  if not p_approve and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'informe o motivo da recusa' using errcode = '22023'; end if;
  update public.payment_receipts
     set status = case when p_approve then 'validado'::public.receipt_status else 'recusado'::public.receipt_status end,
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = r.id;
  if p_approve and p_register_payment then
    if r.installment_id is null then raise exception 'vincule o comprovante a uma parcela para dar baixa' using errcode = '22023'; end if;
    perform public.admin_register_payment(r.installment_id, coalesce(p_amount, r.informed_amount), coalesce(p_paid_on, r.informed_paid_on), 'Comprovante validado');
  end if;
  select cl.user_id into v_user from public.financial_contracts c
    join public.client_units cu on cu.unit_id = c.unit_id and cu.active and cu.relation = 'titular'
    join public.clients cl on cl.id = cu.client_id where c.id = r.contract_id limit 1;
  if v_user is not null then
    perform public.notify_user(v_user, 'comprovante', case when p_approve then 'Comprovante validado' else 'Comprovante não validado' end,
      coalesce(nullif(trim(p_note), ''), 'Consulte o financeiro da sua unidade.'), '/cliente', 'comprovante:' || r.id || ':analise');
  end if;
end $$;

create or replace function public.admin_register_payment(p_installment_id uuid, p_amount numeric, p_paid_on date, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare i public.installments; v_total numeric; v_due numeric;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_paid_on is null then raise exception 'informe valor e data do pagamento' using errcode = '22023'; end if;
  select * into i from public.installments where id = p_installment_id for update;
  if i.id is null or i.status in ('cancelada', 'renegociada') then raise exception 'parcela não pode receber baixa' using errcode = '22023'; end if;
  v_total := i.paid_amount + p_amount;
  v_due := coalesce(i.updated_amount, i.original_amount);
  update public.installments
     set paid_amount = v_total, paid_on = p_paid_on,
         status = case when v_total >= v_due then 'paga'::public.installment_status else 'parcialmente_paga'::public.installment_status end
   where id = i.id;
  perform public.write_audit('parcela_baixa', 'installments', i.id::text,
    jsonb_build_object('valor', p_amount, 'data', p_paid_on), p_reason);
end $$;

create or replace function public.client_create_inquiry(p_contract_id uuid, p_installment_id uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_client_of_contract(p_contract_id) then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.financial_inquiries (contract_id, installment_id, message, created_by)
  values (p_contract_id, p_installment_id, trim(p_message), auth.uid()) returning id into v_id;
  perform public.notify_staff('financeiro', 'esclarecimento', 'Pedido de esclarecimento financeiro', left(trim(p_message), 200),
    '/admin/financeiro', 'esclarecimento:' || v_id);
  return v_id;
end $$;

create or replace function public.admin_answer_inquiry(p_id uuid, p_response text, p_close boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.financial_inquiries;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_response)), 0) < 3 then raise exception 'escreva a resposta' using errcode = '22023'; end if;
  update public.financial_inquiries
     set response = trim(p_response), responded_by = auth.uid(), responded_at = now(),
         status = case when p_close then 'encerrada'::public.inquiry_status else 'respondida'::public.inquiry_status end
   where id = p_id returning * into q;
  if q.id is null then raise exception 'pedido não encontrado' using errcode = '22023'; end if;
  perform public.notify_user(q.created_by, 'esclarecimento', 'Resposta ao seu pedido de esclarecimento', left(trim(p_response), 300),
    '/cliente', 'esclarecimento:' || q.id || ':resposta:' || extract(epoch from now())::bigint);
end $$;

-- Importação validada: tudo ou nada, por contrato identificado pela unidade.
-- p_rows = [{unit_id, number, kind, due_date, original_amount, monetary_update, interest, fine, updated_amount, paid_amount, paid_on, status, external_ref}]
create or replace function public.admin_import_installments(p_file_name text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_contract uuid; v_ins int := 0; v_upd int := 0; v_inserted boolean;
begin
  if not public.has_staff_permission('financeiro') then raise exception 'acesso negado' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'arquivo sem linhas' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_contract from public.financial_contracts where unit_id = (r ->> 'unit_id')::uuid;
    if v_contract is null then raise exception 'unidade sem contrato financeiro cadastrado (linha %)', r ->> 'line' using errcode = '22023'; end if;
    insert into public.installments (contract_id, number, kind, due_date, original_amount, monetary_update, interest, fine, updated_amount,
                                     paid_amount, paid_on, status, data_source, external_ref)
    values (v_contract, (r ->> 'number')::int, coalesce(r ->> 'kind', 'parcela')::public.installment_kind, (r ->> 'due_date')::date,
            (r ->> 'original_amount')::numeric, (r ->> 'monetary_update')::numeric, (r ->> 'interest')::numeric, (r ->> 'fine')::numeric,
            (r ->> 'updated_amount')::numeric, coalesce((r ->> 'paid_amount')::numeric, 0), (r ->> 'paid_on')::date,
            coalesce(r ->> 'status', 'aberta')::public.installment_status, 'importacao', r ->> 'external_ref')
    on conflict (contract_id, number) do update set
      kind = excluded.kind, due_date = excluded.due_date, original_amount = excluded.original_amount,
      monetary_update = excluded.monetary_update, interest = excluded.interest, fine = excluded.fine,
      updated_amount = excluded.updated_amount, paid_amount = excluded.paid_amount, paid_on = excluded.paid_on,
      status = excluded.status, data_source = 'importacao', external_ref = excluded.external_ref
    returning (xmax = 0) into v_inserted;
    if v_inserted then v_ins := v_ins + 1; else v_upd := v_upd + 1; end if;
  end loop;
  insert into public.financial_imports (file_name, rows_count, summary, imported_by)
  values (p_file_name, jsonb_array_length(p_rows), jsonb_build_object('inseridas', v_ins, 'atualizadas', v_upd), auth.uid());
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', v_upd);
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.financial_contracts enable row level security;
alter table public.installments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.financial_inquiries enable row level security;
alter table public.financial_imports enable row level security;

create policy documents_read on public.documents for select to authenticated using (public.can_read_document(id));
create policy documents_staff on public.documents for all to authenticated
  using (public.has_staff_permission('documentos')) with check (public.has_staff_permission('documentos'));
create policy document_versions_read on public.document_versions for select to authenticated using (public.can_read_document(document_id));
revoke insert, update, delete on public.document_versions from authenticated;   -- via admin_add_document_version

create policy contracts_client on public.financial_contracts for select to authenticated using (public.is_client_of_unit(unit_id));
create policy contracts_staff on public.financial_contracts for all to authenticated
  using (public.has_staff_permission('financeiro')) with check (public.has_staff_permission('financeiro'));
create policy installments_client on public.installments for select to authenticated using (public.is_client_of_contract(contract_id));
create policy installments_staff on public.installments for all to authenticated
  using (public.has_staff_permission('financeiro')) with check (public.has_staff_permission('financeiro'));
-- Baixa só pela função (com auditoria): staff não grava paid_amount/paid_on/status diretamente.
revoke update on public.installments from authenticated;
grant update (kind, due_date, original_amount, monetary_update, interest, fine, updated_amount, external_ref) on public.installments to authenticated;

create policy receipts_client on public.payment_receipts for select to authenticated using (public.is_client_of_contract(contract_id));
create policy receipts_staff on public.payment_receipts for select to authenticated using (public.has_staff_permission('financeiro'));
create policy inquiries_client on public.financial_inquiries for select to authenticated using (public.is_client_of_contract(contract_id));
create policy inquiries_staff on public.financial_inquiries for select to authenticated using (public.has_staff_permission('financeiro'));
create policy imports_staff on public.financial_imports for select to authenticated using (public.has_staff_permission('financeiro'));

revoke insert, update, delete on public.payment_receipts, public.financial_inquiries, public.financial_imports from authenticated;
revoke all on public.documents, public.document_versions, public.financial_contracts, public.installments, public.payment_receipts,
  public.financial_inquiries, public.financial_imports from anon;
revoke all on public.installments_view from anon;

-- Storage client-documents: leitura arquivo a arquivo.
-- Substitui a regra da Etapa 1 (que liberava toda a pasta da unidade): documento oculto ao cliente não pode ser baixado.
drop policy if exists "client-documents: leitura" on storage.objects;

create or replace function public.can_read_client_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_staff_permission('documentos')
      or exists (select 1 from public.document_versions v where v.storage_path = p_name and public.can_read_document(v.document_id))
      or ((storage.foldername(p_name))[2] = 'comprovantes' and public.is_client_of_unit(public.try_uuid((storage.foldername(p_name))[1])))
$$;

create policy "client-documents: leitura por documento" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and public.can_read_client_file(name));

-- Documentos de empreendimento (manuais) e comprovantes enviados pelo cliente.
create policy "client-documents: cliente envia comprovante" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and (storage.foldername(name))[2] = 'comprovantes'
              and public.is_client_of_unit(public.try_uuid((storage.foldername(name))[1])));
create policy "client-documents: financeiro lê comprovantes" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and (storage.foldername(name))[2] = 'comprovantes' and public.has_staff_permission('financeiro'));
