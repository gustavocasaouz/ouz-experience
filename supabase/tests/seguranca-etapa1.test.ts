import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";
import { CPF_A, CPF_B, MAUI, SOHO, UMAN, makeAdmin, makeBroker, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
});
afterAll(async () => db.close());

describe("bloqueio de cadastro administrativo público", () => {
  it("usuário comum não se insere como staff nem concede permissões", async () => {
    const id = await db.createUser("intruso@teste.ouz");
    await expect(
      db.as({ sub: id, aal: "aal2" }, `insert into public.staff_members (user_id, role) values ($1, 'administrador')`, [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as({ sub: id, aal: "aal2" }, `insert into public.staff_permissions (user_id, permission) values ($1, 'financeiro')`, [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as({ sub: id }, `select public.bootstrap_first_admin('intruso@teste.ouz')`)).rejects.toThrow(/permission denied/);
    await expect(db.as({ sub: id, aal: "aal2" }, `select public.create_staff_invitation('x@y.com', 'administrador', '{}')`)).rejects.toThrow(
      /acesso negado/,
    );
    await expect(db.as({ sub: id }, `select public.accept_staff_invitation('token-inventado')`)).rejects.toThrow(/convite inválido/);
    const [s] = await db.as<{ s: { is_staff: boolean } }>({ sub: id, aal: "aal2" }, `select public.staff_status() as s`);
    expect(s.s.is_staff).toBe(false);
  });

  it("metadados do cadastro (raw_user_meta_data) não concedem papel", async () => {
    const [{ id }] = await db.admin<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ('meta@teste.ouz', now(), '{"role":"administrador","staff":true}') returning id`,
    );
    const rows = await db.admin(`select 1 from public.staff_members where user_id = $1`, [id]);
    expect(rows).toHaveLength(0);
  });

  it("convite de staff só vale para o e-mail convidado e uma única vez", async () => {
    const [{ token }] = await db.as<{ token: string }>(
      admin.aal2,
      `select public.create_staff_invitation('op-convite@teste.ouz', 'operador', '{atendimento}') as token`,
    );
    const outro = await db.createUser("outro@teste.ouz");
    await expect(db.as({ sub: outro }, `select public.accept_staff_invitation($1)`, [token])).rejects.toThrow(/outro e-mail/);
    const certo = await db.createUser("op-convite@teste.ouz");
    await db.as({ sub: certo }, `select public.accept_staff_invitation($1)`, [token]);
    await expect(db.as({ sub: certo }, `select public.accept_staff_invitation($1)`, [token])).rejects.toThrow(/inválido/);
  });

  it("e-mail não verificado não aceita convite", async () => {
    const [{ token }] = await db.as<{ token: string }>(
      admin.aal2,
      `select public.create_staff_invitation('naoverif@teste.ouz', 'operador', '{}') as token`,
    );
    const id = await db.createUser("naoverif@teste.ouz", { confirmed: false });
    await expect(db.as({ sub: id }, `select public.accept_staff_invitation($1)`, [token])).rejects.toThrow(/não verificado/);
  });

  it("staff sem MFA (aal1) não tem permissão alguma", async () => {
    await expect(
      db.as(admin.aal1, `select public.create_staff_invitation('z@teste.ouz', 'operador', '{}')`),
    ).rejects.toThrow(/acesso negado/);
    const rows = await db.as(admin.aal1, `select * from public.audit_log`);
    expect(rows).toHaveLength(0);
  });

  it("operador não convida administrador", async () => {
    const op = await makeOperator(db, admin.aal2, "op-adm@teste.ouz", ["administracao"]);
    await expect(
      db.as(op.aal2, `select public.create_staff_invitation('novo-adm@teste.ouz', 'administrador', '{}')`),
    ).rejects.toThrow(/somente administradores/);
  });
});

describe("corretores", () => {
  it("cadastro entra sempre como pendente e o corretor não muda o próprio status", async () => {
    const b = await makeBroker(db, "pend@teste.ouz", CPF_A, "12345");
    const [p] = await db.as<{ status: string }>(b.claims, `select status from public.broker_profiles where user_id = $1`, [b.id]);
    expect(p.status).toBe("pendente");
    await db.as(b.claims, `update public.broker_profiles set status = 'aprovado', city = 'São José' where user_id = $1`, [b.id]);
    const [p2] = await db.as<{ status: string; city: string }>(b.claims, `select status, city from public.broker_profiles where user_id = $1`, [b.id]);
    expect(p2).toEqual({ status: "pendente", city: "São José" });
    await expect(db.as(b.claims, `select public.admin_set_broker_status($1, 'aprovado', null)`, [b.id])).rejects.toThrow(/acesso negado/);
  });

  it("transições têm histórico, motivo e notificação sem duplicidade", async () => {
    const b = await makeBroker(db, "hist@teste.ouz", CPF_B, "54321");
    await expect(db.as(admin.aal2, `select public.admin_set_broker_status($1, 'recusado', '')`, [b.id])).rejects.toThrow(/motivo/);
    await db.as(admin.aal2, `select public.admin_set_broker_status($1, 'ajustes_solicitados', 'Enviar CRECI legível')`, [b.id]);
    await db.as(b.claims, `select public.broker_resubmit()`);
    await db.as(admin.aal2, `select public.admin_set_broker_status($1, 'aprovado', null)`, [b.id]);
    await expect(db.as(admin.aal2, `select public.admin_set_broker_status($1, 'pendente', 'x')`, [b.id])).rejects.toThrow(/inválido/);
    await expect(db.as(admin.aal2, `select public.admin_set_broker_status($1, 'recusado', 'x x')`, [b.id])).rejects.toThrow(/não permitida/);

    const hist = await db.as<{ to_status: string }>(
      b.claims,
      `select to_status from public.broker_status_history where broker_user_id = $1 order by id`,
      [b.id],
    );
    expect(hist.map((h) => h.to_status)).toEqual(["ajustes_solicitados", "pendente", "aprovado"]);
    const notifs = await db.as(b.claims, `select dedupe_key from public.notifications where user_id = $1`, [b.id]);
    expect(notifs).toHaveLength(2);
    const outbox = await db.admin(`select dedupe_key from public.notification_outbox where recipient_user_id = $1`, [b.id]);
    expect(outbox).toHaveLength(2);
  });

  it("CPF e CRECI duplicados são rejeitados", async () => {
    await expect(makeBroker(db, "dup@teste.ouz", CPF_A, "99999")).rejects.toThrow(/duplicate key/);
  });
});

describe("acesso por empreendimento (UMAN restrito)", () => {
  let semGrant: Awaited<ReturnType<typeof makeBroker>>;
  let individual: Awaited<ReturnType<typeof makeBroker>>;
  let viaGrupo: Awaited<ReturnType<typeof makeBroker>>;
  let pendente: Awaited<ReturnType<typeof makeBroker>>;

  beforeAll(async () => {
    semGrant = await makeBroker(db, "b1@teste.ouz", "39053344705", "1001", { approveWith: admin.aal2 });
    individual = await makeBroker(db, "b2@teste.ouz", "71428793860", "1002", { approveWith: admin.aal2 });
    viaGrupo = await makeBroker(db, "b3@teste.ouz", "86288366757", "1003", { approveWith: admin.aal2 });
    pendente = await makeBroker(db, "b4@teste.ouz", "45317828791", "1004");

    await db.as(admin.aal2, `select public.admin_grant_development_access($1, $2, null, 'Parceiro UMAN')`, [UMAN, individual.id]);
    const [g] = await db.as<{ id: string }>(admin.aal2, `insert into public.broker_groups (name) values ('Grupo UMAN') returning id`);
    await db.as(admin.aal2, `insert into public.broker_group_members (group_id, broker_user_id) values ($1, $2)`, [g.id, viaGrupo.id]);
    await db.as(admin.aal2, `select public.admin_grant_development_access($1, null, $2, 'Onda 1')`, [UMAN, g.id]);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('broker-content', $1)`, [`${UMAN}/planta.pdf`]);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('broker-content', $1)`, [`${SOHO}/planta.pdf`]);
    // arquivos de corretor só são lidos se registrados como material publicado (apresentação: não depende de preço)
    await db.admin(`insert into public.broker_materials (development_id, kind, title, storage_path, is_published) values
      ($1, 'apresentacao', 'UMAN', $2, true), ($3, 'apresentacao', 'SOHO', $4, true)`, [UMAN, `${UMAN}/planta.pdf`, SOHO, `${SOHO}/planta.pdf`]);
  });

  const restrito = async (claims: { sub?: string }) => ({
    units: (await db.as(claims, `select id from public.units where development_id = $1`, [UMAN])).length,
    content: (await db.as(claims, `select 1 from public.development_broker_content where development_id = $1`, [UMAN])).length,
    teaser: (await db.as(claims, `select 1 from public.development_teasers where development_id = $1`, [UMAN])).length,
    arquivos: (await db.as(claims, `select name from storage.objects where bucket_id = 'broker-content' and name like $1`, [`${UMAN}/%`])).length,
  });

  it("aprovado sem autorização vê só o teaser", async () => {
    expect(await restrito(semGrant.claims)).toEqual({ units: 0, content: 0, teaser: 1, arquivos: 0 });
    const soho = await db.as(semGrant.claims, `select id from public.units where development_id = $1`, [SOHO]);
    expect(soho.length).toBeGreaterThan(0);
    const sohoArq = await db.as(semGrant.claims, `select name from storage.objects where bucket_id = 'broker-content'`);
    expect(sohoArq).toEqual([{ name: `${SOHO}/planta.pdf` }]);
  });

  it("autorização individual e por grupo liberam o conteúdo completo", async () => {
    expect(await restrito(individual.claims)).toEqual({ units: 4, content: 1, teaser: 1, arquivos: 1 });
    expect(await restrito(viaGrupo.claims)).toEqual({ units: 4, content: 1, teaser: 1, arquivos: 1 });
  });

  it("corretor pendente não vê nada restrito, nem de empreendimentos abertos", async () => {
    expect(await restrito(pendente.claims)).toEqual({ units: 0, content: 0, teaser: 0, arquivos: 0 });
    expect(await db.as(pendente.claims, `select 1 from public.units where development_id = $1`, [MAUI])).toHaveLength(0);
  });

  it("revogação remove o acesso e é auditada; corretor não lista grupos nem concessões", async () => {
    const [grant] = await db.as<{ id: string }>(
      admin.aal2,
      `select id from public.development_broker_grants where broker_user_id = $1 and revoked_at is null`,
      [individual.id],
    );
    await expect(db.as(admin.aal2, `select public.admin_revoke_development_access($1, '')`, [grant.id])).rejects.toThrow(/motivo/);
    await db.as(admin.aal2, `select public.admin_revoke_development_access($1, 'Fim da parceria')`, [grant.id]);
    expect((await restrito(individual.claims)).units).toBe(0);
    expect(await db.as(individual.claims, `select * from public.development_broker_grants`)).toHaveLength(0);
    expect(await db.as(individual.claims, `select * from public.broker_group_members`)).toHaveLength(0);
    const audit = await db.admin(`select 1 from public.audit_log where action = 'acesso_empreendimento_revogado' and entity_id = $1`, [grant.id]);
    expect(audit).toHaveLength(1);
  });

  it("modo teaser e oculto prevalecem sobre autorizações; corretor suspenso perde tudo", async () => {
    await db.as(admin.aal2, `select public.admin_set_development_access_mode($1, 'teaser', 'Revisão de material')`, [UMAN]);
    expect(await restrito(viaGrupo.claims)).toEqual({ units: 0, content: 0, teaser: 1, arquivos: 0 });
    await db.as(admin.aal2, `select public.admin_set_development_access_mode($1, 'oculto', 'Teste')`, [UMAN]);
    expect(await restrito(viaGrupo.claims)).toEqual({ units: 0, content: 0, teaser: 0, arquivos: 0 });
    await db.as(admin.aal2, `select public.admin_set_development_access_mode($1, 'restrito', 'Retorno')`, [UMAN]);
    await db.as(admin.aal2, `select public.admin_set_broker_status($1, 'suspenso', 'Verificação cadastral')`, [viaGrupo.id]);
    expect(await restrito(viaGrupo.claims)).toEqual({ units: 0, content: 0, teaser: 0, arquivos: 0 });
  });

  it("corretor não altera o modo de acesso nem concede acesso a si mesmo", async () => {
    await expect(
      db.as(semGrant.claims, `select public.admin_grant_development_access($1, $2, null, 'eu')`, [UMAN, semGrant.id]),
    ).rejects.toThrow(/acesso negado/);
    await expect(
      db.as(semGrant.claims, `update public.developments set broker_access_mode = 'aberto' where id = $1`, [UMAN]),
    ).rejects.toThrow(/permission denied/);
  });

  it("visitante anônimo não vê unidades, teaser nem conteúdo restrito", async () => {
    await expect(db.as("anon", `select * from public.units`)).rejects.toThrow(/permission denied/);
    await expect(db.as("anon", `select * from public.development_broker_content`)).rejects.toThrow(/permission denied/);
    // Sem área pública no app: visitante não lê nenhum empreendimento.
    const pub = await db.as("anon", `select slug from public.developments order by sort_order`).catch(() => []);
    expect(pub).toHaveLength(0);
  });
});

describe("isolamento entre clientes", () => {
  let staff: Awaited<ReturnType<typeof makeOperator>>;
  let a: Awaited<ReturnType<typeof makeClientWithUnit>>;
  let b: Awaited<ReturnType<typeof makeClientWithUnit>>;

  beforeAll(async () => {
    staff = await makeOperator(db, admin.aal2, "clientes@teste.ouz", ["clientes", "documentos"]);
    a = await makeClientWithUnit(db, staff.aal2, "cliente.a@teste.ouz", "DEMO-101");
    b = await makeClientWithUnit(db, staff.aal2, "cliente.b@teste.ouz", "DEMO-102", MAUI);
    await db.as(staff.aal2, `insert into public.client_identities values ($1, 'cpf', $2, 'h-a')`, [a.clientId, CPF_A]);
    await db.as(staff.aal2, `insert into public.client_identities values ($1, 'cpf', $2, 'h-b')`, [b.clientId, CPF_B]);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('client-documents', $1), ('client-documents', $2)`, [
      `${a.unitId}/contrato.pdf`,
      `${b.unitId}/contrato.pdf`,
    ]);
    // Etapa 3: arquivo só é legível se registrado como documento visível ao cliente.
    for (const c of [a, b]) {
      const [{ id }] = await db.admin<{ id: string }>(
        `insert into public.documents (unit_id, category, title) values ($1, 'contrato', 'Contrato') returning id`,
        [c.unitId],
      );
      await db.admin(`insert into public.document_versions (document_id, version_number, storage_path) values ($1, 1, $2)`, [id, `${c.unitId}/contrato.pdf`]);
    }
  });

  it("cada cliente vê apenas o próprio cadastro, unidades, empreendimento e arquivos", async () => {
    const ver = async (c: typeof a) => ({
      clients: (await db.as<{ id: string }>(c.claims, `select id from public.clients`)).map((r) => r.id),
      units: (await db.as<{ id: string }>(c.claims, `select id from public.units`)).map((r) => r.id),
      identities: (await db.as<{ client_id: string }>(c.claims, `select client_id from public.client_identities`)).map((r) => r.client_id),
      files: (await db.as<{ name: string }>(c.claims, `select name from storage.objects where bucket_id = 'client-documents'`)).map(
        (r) => r.name,
      ),
    });
    expect(await ver(a)).toEqual({ clients: [a.clientId], units: [a.unitId], identities: [a.clientId], files: [`${a.unitId}/contrato.pdf`] });
    expect(await ver(b)).toEqual({ clients: [b.clientId], units: [b.unitId], identities: [b.clientId], files: [`${b.unitId}/contrato.pdf`] });
  });

  it("cliente não se vincula a outra unidade nem altera o próprio vínculo", async () => {
    await expect(
      db.as(a.claims, `insert into public.client_units (client_id, unit_id) values ($1, $2)`, [a.clientId, b.unitId]),
    ).rejects.toThrow(/row-level security/);
    await expect(db.as(a.claims, `update public.clients set user_id = null where id = $1`, [a.clientId])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("convite de cliente exige o mesmo e-mail; conhecer CPF não dá acesso", async () => {
    const [c] = await db.as<{ id: string }>(staff.aal2, `insert into public.clients (full_name, email) values ('Cliente C', 'c@teste.ouz') returning id`);
    const [{ token }] = await db.as<{ token: string }>(staff.aal2, `select public.create_client_invitation($1) as token`, [c.id]);
    const intruso = await db.createUser("intruso2@teste.ouz");
    await expect(db.as({ sub: intruso }, `select public.accept_client_invitation($1)`, [token])).rejects.toThrow(/outro e-mail/);
    const rows = await db.as({ sub: intruso }, `select * from public.client_identities where document_number = $1`, [CPF_A]);
    expect(rows).toHaveLength(0);
  });

  it("operador de atendimento vê clientes, mas não CPF nem documentos", async () => {
    const at = await makeOperator(db, admin.aal2, "atendimento@teste.ouz", ["atendimento"]);
    expect((await db.as(at.aal2, `select id from public.clients`)).length).toBeGreaterThanOrEqual(2);
    expect(await db.as(at.aal2, `select * from public.client_identities`)).toHaveLength(0);
    expect(await db.as(at.aal2, `select * from storage.objects where bucket_id = 'client-documents'`)).toHaveLength(0);
    expect(await db.as(at.aal2, `select * from public.audit_log`)).toHaveLength(0);
  });
});

describe("auditoria e notificações", () => {
  it("auditoria é imutável até para o dono do banco", async () => {
    await expect(db.admin(`delete from public.audit_log`)).rejects.toThrow(/somente inserção/);
    await expect(db.admin(`update public.audit_log set action = 'x'`)).rejects.toThrow(/somente inserção/);
  });

  it("auditoria não guarda CPF", async () => {
    const rows = await db.admin<{ t: string }>(`select string_agg(metadata::text || coalesce(reason, ''), ' ') as t from public.audit_log`);
    expect(rows[0].t).not.toContain(CPF_A);
    expect(rows[0].t).not.toContain(CPF_B);
  });

  it("outbox ignora dedupe_key repetida e o lote não é pego duas vezes", async () => {
    const ins = `insert into public.notification_outbox (dedupe_key, template, recipient_email) values ('k1', 't', 'x@teste.ouz')
                 on conflict (dedupe_key) do nothing returning id`;
    expect(await db.admin(ins)).toHaveLength(1);
    expect(await db.admin(ins)).toHaveLength(0);
    const lote1 = await db.admin(`select id from public.claim_outbox_batch(100)`);
    const lote2 = await db.admin(`select id from public.claim_outbox_batch(100)`);
    expect(lote1.length).toBeGreaterThan(0);
    expect(lote2).toHaveLength(0);
  });

  it("mascaramento de documento", async () => {
    const [r] = await db.admin<{ cpf: string; cnpj: string }>(
      `select public.mask_document('529.982.247-25') as cpf, public.mask_document('11222333000181') as cnpj`,
    );
    expect(r).toEqual({ cpf: "***.982.247-**", cnpj: "**.222.333/****-**" });
  });
});

describe("listagem básica de corretores para o comercial", () => {
  it("comercial lista nome/CRECI sem CPF; atendimento não lista", async () => {
    const com = await makeOperator(db, admin.aal2, "comercial@teste.ouz", ["comercial"]);
    const rows = await db.as<Record<string, unknown>>(com.aal2, `select * from public.staff_list_brokers_basic()`);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0])).not.toContain("cpf");
    expect(await db.as(com.aal2, `select * from public.broker_profiles`)).toHaveLength(0);
    const at = await makeOperator(db, admin.aal2, "at2@teste.ouz", ["atendimento"]);
    await expect(db.as(at.aal2, `select * from public.staff_list_brokers_basic()`)).rejects.toThrow(/acesso negado/);
  });
});
