import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, makeAdmin, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let concierge: Claims, atendimento: Claims;
let A: Awaited<ReturnType<typeof makeClientWithUnit>>;
let A2: Awaited<ReturnType<typeof makeClientWithUnit>>;
let B: Awaited<ReturnType<typeof makeClientWithUnit>>;
const one = async <T,>(p: Promise<T[]>) => (await p)[0] as T;
const service = async (name: string) => (await one(db.admin<{ id: string }>(`select id from public.concierge_services where name = $1`, [name]))).id;
const status = async (id: string) => (await one(db.admin<{ status: string }>(`select status from public.concierge_requests where id = $1`, [id]))).status;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  const admin = await makeAdmin(db);
  concierge = (await makeOperator(db, admin.aal2, "concierge@t.ouz", ["concierge"])).aal2;
  atendimento = (await makeOperator(db, admin.aal2, "atend@t.ouz", ["atendimento"])).aal2;
  const clientes = (await makeOperator(db, admin.aal2, "cli@t.ouz", ["clientes"])).aal2;
  A = await makeClientWithUnit(db, clientes, "a@c.ouz", "DEMO-101", SOHO);
  A2 = await makeClientWithUnit(db, clientes, "a2@c.ouz", "DEMO-102", SOHO);
  B = await makeClientWithUnit(db, clientes, "b@c.ouz", "DEMO-101", MAUI);
});
afterAll(async () => db.close());

describe("concierge", () => {
  it("catálogo só para clientes do empreendimento; prestadores só para a OUZ", async () => {
    expect((await db.as(A.claims, `select id from public.concierge_services`)).length).toBe(8);
    expect(await db.as(B.claims, `select id from public.concierge_services`)).toHaveLength(0); // MAUI sem catálogo
    expect(await db.as(A.claims, `select * from public.concierge_providers`)).toHaveLength(0);
    expect(await db.as(atendimento, `select * from public.concierge_providers`)).toHaveLength(0);
    expect((await db.as(concierge, `select * from public.concierge_providers`)).length).toBe(1);
    await expect(db.as(B.claims, `select public.client_request_concierge($1, $2, 'Flores', null)`, [B.unitId, await service("[Demonstrativo] Flores")])).rejects.toThrow(/indisponível/);
  });

  it("fluxo completo: solicitação → análise → orçamento com taxa → aprovação do cliente → agendamento → execução → conclusão → avaliação", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_request_concierge($1, $2, 'Limpeza pós-mudança', now() + interval '5 days') as id`,
      [A.unitId, await service("[Demonstrativo] Limpeza")]));
    expect(await db.as(A2.claims, `select id from public.concierge_requests`)).toHaveLength(0);
    expect(await db.as(atendimento, `select id from public.concierge_requests`)).toHaveLength(0);

    // nada é confirmado automaticamente: sem aprovação do cliente não agenda
    await expect(db.as(concierge, `select public.admin_concierge_schedule($1, now() + interval '6 days', null, null)`, [id])).rejects.toThrow(/aprovação do cliente/);
    await db.as(concierge, `select public.admin_concierge_transition($1, 'em_analise', null)`, [id]);
    const { pid } = await one(db.as<{ pid: string }>(concierge, `select id as pid from public.concierge_providers limit 1`));
    await db.as(concierge, `select public.admin_concierge_quote($1, 450, 45, 'Duas diaristas, 6 h', current_date + 7, $2)`, [id, pid]);
    await expect(db.as(A2.claims, `select public.client_decide_concierge_quote($1, true)`, [id])).rejects.toThrow(/acesso negado/);
    const seen = await one(db.as<Record<string, unknown>>(A.claims, `select service_amount, ouz_fee, status from public.concierge_requests where id = $1`, [id]));
    expect(seen).toEqual({ service_amount: "450.00", ouz_fee: "45.00", status: "orcamento_enviado" });
    await expect(db.as(A.claims, `select provider_id from public.concierge_requests where id = $1`, [id])).rejects.toThrow(/permission denied/);

    await db.as(A.claims, `select public.client_decide_concierge_quote($1, true)`, [id]);
    await db.as(concierge, `select public.admin_concierge_schedule($1, now() + interval '6 days', $2, 'Equipe confirmada')`, [id, pid]);
    await expect(db.as(A.claims, `select public.client_rate_concierge($1, 5, null)`, [id])).rejects.toThrow(/após a conclusão/);
    await expect(db.as(concierge, `select public.admin_concierge_transition($1, 'concluida', null)`, [id])).rejects.toThrow(/não permitida/);
    await db.as(concierge, `select public.admin_concierge_transition($1, 'em_execucao', null)`, [id]);
    await db.as(concierge, `select public.admin_concierge_occurrence($1, 'atraso', 'Equipe chegou 30 min atrasada', true)`, [id]);
    await db.as(concierge, `select public.admin_concierge_occurrence($1, 'outro', 'Nota interna sobre o prestador', false)`, [id]);
    await db.as(concierge, `select public.admin_concierge_transition($1, 'concluida', 'Serviço finalizado')`, [id]);
    await db.as(A.claims, `select public.client_rate_concierge($1, 4, 'Bom, mas atrasou')`, [id]);
    await expect(db.as(A.claims, `select public.client_rate_concierge($1, 5, null)`, [id])).rejects.toThrow(/já avaliado/);

    expect((await db.as(A.claims, `select kind from public.concierge_occurrences`)).map((r: Record<string, unknown>) => r.kind)).toEqual(["atraso"]);
    const steps = (await db.as<{ to_status: string }>(A.claims, `select to_status from public.concierge_events where request_id = $1 order by id`, [id])).map((r) => r.to_status);
    expect(steps).toEqual(["solicitada", "em_analise", "orcamento_enviado", "aprovada_cliente", "agendada", "em_execucao", "concluida"]);
    expect((await db.admin(`select 1 from public.notifications where user_id = $1 and kind = 'concierge'`, [A.userId])).length).toBeGreaterThanOrEqual(5);
  });

  it("serviço sem orçamento pode ser agendado pela OUZ; cliente cancela antes da execução; indisponibilidade exige motivo", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_request_concierge($1, $2, 'Caixa grande na quarta', null) as id`,
      [A.unitId, await service("[Demonstrativo] Recebimento de entregas")]));
    await db.as(concierge, `select public.admin_concierge_schedule($1, now() + interval '2 days', null, null)`, [id]);
    expect(await status(id)).toBe("agendada");
    await db.as(A.claims, `select public.client_cancel_concierge($1, 'Mudei de ideia')`, [id]);
    expect(await status(id)).toBe("cancelada");

    const { id: id2 } = await one(db.as<{ id: string }>(A.claims, `select public.client_request_concierge($1, $2, 'Flores para sábado', null) as id`,
      [A.unitId, await service("[Demonstrativo] Flores")]));
    await expect(db.as(concierge, `select public.admin_concierge_transition($1, 'indisponivel', '')`, [id2])).rejects.toThrow(/motivo/);
    await db.as(concierge, `select public.admin_concierge_transition($1, 'indisponivel', 'Sem fornecedor neste sábado')`, [id2]);
    await expect(db.as(A.claims, `select public.client_cancel_concierge($1, null)`, [id2])).rejects.toThrow(/não pode mais/);
  });

  it("orçamento vencido não pode ser aprovado", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_request_concierge($1, $2, 'Lavar cortinas', null) as id`,
      [A.unitId, await service("[Demonstrativo] Lavanderia")]));
    await db.as(concierge, `select public.admin_concierge_quote($1, 200, 0, null, current_date, null)`, [id]);
    await db.admin(`update public.concierge_requests set quote_valid_until = current_date - 1 where id = $1`, [id]);
    await expect(db.as(A.claims, `select public.client_decide_concierge_quote($1, true)`, [id])).rejects.toThrow(/vencido/);
  });
});
