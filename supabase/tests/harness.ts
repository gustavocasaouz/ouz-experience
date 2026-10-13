/**
 * Postgres embutido (PGlite) com stubs mínimos dos esquemas `auth` e `storage` do Supabase,
 * para testar migrações, RLS e funções transacionais sem Docker nem projeto remoto.
 * Os stubs reproduzem só o que as migrações usam: auth.uid(), auth.jwt(), auth.users,
 * storage.buckets/objects/foldername() e os papéis anon/authenticated/service_role.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

const SUPABASE_STUBS = /* sql */ `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create schema storage;
grant usage on schema public, extensions, storage to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
`;

export function migrationFiles(): string[] {
  const dir = join(ROOT, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

export async function createTestDb(opts: { seed?: boolean } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`Falha na migração ${file}: ${(e as Error).message}`);
    }
  }
  if (opts.seed) await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  return new TestDb(db);
}

export type Claims = { sub?: string; aal?: "aal1" | "aal2"; email?: string; role?: string };

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** Executa como superusuário (equivale ao service role / SQL Editor). */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  /**
   * Executa como usuário autenticado (ou anon) dentro de uma transação, como o PostgREST faz.
   * Erros são propagados; a transação é desfeita em caso de erro.
   */
  async as<T = Record<string, unknown>>(
    who: Claims | "anon",
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const role = who === "anon" ? "anon" : "authenticated";
    const claims = who === "anon" ? { role: "anon" } : { role: "authenticated", aal: "aal1", ...who };
    return this.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  async createUser(email: string, opts: { confirmed?: boolean; fullName?: string } = {}) {
    const rows = await this.admin<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, $3) returning id`,
      [email, opts.confirmed === false ? null : new Date().toISOString(), { full_name: opts.fullName ?? email }],
    );
    return rows[0].id;
  }

  async close() {
    await this.pg.close();
  }
}
