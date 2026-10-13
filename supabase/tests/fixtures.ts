import type { TestDb, Claims } from "./harness";

export const SOHO = "00000000-0000-4000-8000-000000000001";
export const MAUI = "00000000-0000-4000-8000-000000000002";
export const UMAN = "00000000-0000-4000-8000-000000000003";

/** CPFs válidos gerados para teste (fictícios). */
export const CPF_A = "52998224725";
export const CPF_B = "11144477735";

export async function makeAdmin(db: TestDb, email = "admin@teste.ouz") {
  const id = await db.createUser(email);
  await db.admin(`select public.bootstrap_first_admin($1)`, [email]);
  return { id, aal2: { sub: id, aal: "aal2" } as Claims, aal1: { sub: id, aal: "aal1" } as Claims };
}

export async function makeOperator(db: TestDb, admin: Claims, email: string, perms: string[]) {
  const [{ token }] = await db.as<{ token: string }>(
    admin,
    `select public.create_staff_invitation($1, 'operador', $2::public.staff_permission[]) as token`,
    [email, `{${perms.join(",")}}`],
  );
  const id = await db.createUser(email);
  await db.as({ sub: id }, `select public.accept_staff_invitation($1)`, [token]);
  return { id, aal2: { sub: id, aal: "aal2" } as Claims };
}

export async function makeBroker(
  db: TestDb,
  email: string,
  cpf: string,
  creci: string,
  opts: { approveWith?: Claims } = {},
) {
  const id = await db.createUser(email);
  const me: Claims = { sub: id };
  await db.as(
    me,
    `insert into public.broker_profiles (user_id, full_name, cpf, cpf_hash, creci_number, creci_uf, email, phone, city, region,
       terms_version, privacy_version, terms_accepted_at, status)
     values ($1, 'Corretor Teste', $2, $3, $4, 'SC', $5, '48999990000', 'Florianópolis', 'SC', 'v1', 'v1', now(), 'aprovado')`,
    [id, cpf, `hash-${cpf}`, creci, email],
  );
  if (opts.approveWith) {
    await db.as(opts.approveWith, `select public.admin_set_broker_status($1, 'aprovado', null)`, [id]);
  }
  return { id, claims: me };
}

export async function makeClientWithUnit(db: TestDb, staff: Claims, email: string, unitCode: string, development = SOHO) {
  const [client] = await db.as<{ id: string }>(
    staff,
    `insert into public.clients (full_name, email) values ('Cliente Teste', $1) returning id`,
    [email],
  );
  const [unit] = await db.admin<{ id: string }>(
    `select id from public.units where development_id = $1 and code = $2`,
    [development, unitCode],
  );
  await db.as(staff, `insert into public.client_units (client_id, unit_id) values ($1, $2)`, [client.id, unit.id]);
  const [{ token }] = await db.as<{ token: string }>(staff, `select public.create_client_invitation($1) as token`, [client.id]);
  const userId = await db.createUser(email);
  await db.as({ sub: userId }, `select public.accept_client_invitation($1)`, [token]);
  return { clientId: client.id, unitId: unit.id, userId, claims: { sub: userId } as Claims };
}
