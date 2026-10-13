import { describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

describe("migrações", () => {
  it("aplicam do zero, com seed, e todas as tabelas públicas têm RLS", async () => {
    const db = await createTestDb({ seed: true });
    const semRls = await db.admin<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(semRls.map((r) => r.relname)).toEqual([]);
    const devs = await db.admin<{ slug: string }>(`select slug from public.developments order by sort_order`);
    expect(devs.map((d) => d.slug)).toEqual(["soho", "maui", "uman"]);
    await db.close();
  });
});
