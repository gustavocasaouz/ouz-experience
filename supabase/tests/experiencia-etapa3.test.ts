import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Claims, type TestDb } from "./harness";
import { MAUI, SOHO, makeAdmin, makeBroker, makeClientWithUnit, makeOperator } from "./fixtures";

let db: TestDb;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
let conteudo: Claims, documentos: Claims, financeiro: Claims, atendimento: Claims, eventos: Claims;
let A: Awaited<ReturnType<typeof makeClientWithUnit>>; // SOHO DEMO-101
let A2: Awaited<ReturnType<typeof makeClientWithUnit>>; // SOHO DEMO-102 (mesmo empreendimento, outra unidade)
let B: Awaited<ReturnType<typeof makeClientWithUnit>>; // MAUI DEMO-101

const one = async <T,>(p: Promise<T[]>) => (await p)[0] as T;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  admin = await makeAdmin(db);
  const op = async (email: string, perms: string[]) => (await makeOperator(db, admin.aal2, email, perms)).aal2;
  conteudo = await op("conteudo@t.ouz", ["conteudo"]);
  documentos = await op("documentos@t.ouz", ["documentos"]);
  financeiro = await op("financeiro@t.ouz", ["financeiro"]);
  atendimento = await op("atendimento@t.ouz", ["atendimento"]);
  eventos = await op("eventos@t.ouz", ["eventos"]);
  const clientes = await op("clientes@t.ouz", ["clientes"]);
  A = await makeClientWithUnit(db, clientes, "a@cli.ouz", "DEMO-101", SOHO);
  A2 = await makeClientWithUnit(db, clientes, "a2@cli.ouz", "DEMO-102", SOHO);
  B = await makeClientWithUnit(db, clientes, "b@cli.ouz", "DEMO-101", MAUI);
});
afterAll(async () => db.close());

describe("acompanhamento", () => {
  it("só publicado e só para clientes do empreendimento; previsão muda com histórico e motivo", async () => {
    const { id: m } = await one(db.as<{ id: string }>(conteudo,
      `insert into public.development_milestones (development_id, stage, title, forecast_date, is_published) values ($1, 'entrega', 'Entrega das chaves', '2028-06-30', true) returning id`, [SOHO]));
    await db.as(conteudo, `insert into public.development_milestones (development_id, stage, title) values ($1, 'obra', 'Rascunho interno')`, [SOHO]);
    expect((await db.as(A.claims, `select title from public.development_milestones`)).map((r: Record<string, unknown>) => r.title)).toEqual(["Entrega das chaves"]);
    expect(await db.as(B.claims, `select * from public.development_milestones`)).toHaveLength(0);

    await expect(db.as(conteudo, `update public.development_milestones set forecast_date = '2028-09-30' where id = $1`, [m])).rejects.toThrow(/permission denied/);
    await expect(db.as(conteudo, `select public.admin_change_milestone_forecast($1, '2028-09-30', '')`, [m])).rejects.toThrow(/motivo/);
    await db.as(conteudo, `select public.admin_change_milestone_forecast($1, '2028-09-30', 'Chuvas acima da média')`, [m]);
    const hist = await db.as<{ previous_date: string; reason: string }>(A.claims, `select previous_date::text, reason from public.milestone_forecast_changes`);
    expect(hist).toEqual([{ previous_date: "2028-06-30", reason: "Chuvas acima da média" }]);
    await expect(db.as(atendimento, `select public.admin_change_milestone_forecast($1, '2029-01-01', 'sem permissão')`, [m])).rejects.toThrow(/acesso negado/);
  });

  it("atualizações, evolução física e comunicados por empreendimento ou unidade; comunicado avisa sem duplicar", async () => {
    await db.as(conteudo, `insert into public.development_updates (development_id, title, published_at) values ($1, 'Concretagem', now())`, [SOHO]);
    await db.as(conteudo, `insert into public.progress_reports (development_id, reference_date, overall_percent, published_at) values ($1, current_date, 42.5, now())`, [SOHO]);
    expect(await db.as(A.claims, `select * from public.development_updates`)).toHaveLength(1);
    expect(await db.as(B.claims, `select * from public.progress_reports`)).toHaveLength(0);

    const { id: geral } = await one(db.as<{ id: string }>(conteudo, `insert into public.announcements (development_id, title, body) values ($1, 'Aviso geral', 'Texto') returning id`, [SOHO]));
    const { id: so101 } = await one(db.as<{ id: string }>(conteudo, `insert into public.announcements (development_id, unit_id, title, body) values ($1, $2, 'Só 101', 'Texto') returning id`, [SOHO, A.unitId]));
    expect(await db.as(A.claims, `select * from public.announcements`)).toHaveLength(0); // ainda não publicados
    const { n } = await one(db.as<{ n: number }>(conteudo, `select public.admin_publish_announcement($1) as n`, [geral]));
    expect(n).toBe(2);
    await db.as(conteudo, `select public.admin_publish_announcement($1)`, [geral]);
    await db.as(conteudo, `select public.admin_publish_announcement($1)`, [so101]);
    expect((await db.as(A.claims, `select title from public.announcements order by title`)).length).toBe(2);
    expect((await db.as(A2.claims, `select title from public.announcements`)).length).toBe(1);
    const notif = await db.admin(`select 1 from public.notifications where user_id = $1 and kind = 'comunicado'`, [A.userId]);
    expect(notif).toHaveLength(2); // geral (uma vez, apesar de publicar duas vezes) + específico
  });
});

describe("personalização, vistoria, pendências", () => {
  it("personalização: só o cliente da unidade; orçamento pela OUZ, aprovação só pelo cliente", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_create_customization($1, 'Trocar piso', 'Porcelanato 120x120 na sala') as id`, [A.unitId]));
    await expect(db.as(B.claims, `select public.client_create_customization($1, 'X', 'Y y y')`, [A.unitId])).rejects.toThrow(/acesso negado/);
    expect(await db.as(A2.claims, `select * from public.customization_requests`)).toHaveLength(0);
    expect(await db.as(financeiro, `select * from public.customization_requests`)).toHaveLength(0);
    await expect(db.as(atendimento, `select public.admin_update_customization($1, 'aprovada', null, null, null)`, [id])).rejects.toThrow(/cliente/);
    await db.as(atendimento, `select public.admin_update_customization($1, 'orcamento_enviado', 'Viável', 18500, current_date + 10)`, [id]);
    await db.as(A.claims, `select public.client_decide_customization($1, true)`, [id]);
    expect((await one(db.admin<{ status: string }>(`select status from public.customization_requests where id = $1`, [id]))).status).toBe("aprovada");
  });

  it("agenda: horário atende uma unidade; reagendar libera o anterior; outro empreendimento não agenda", async () => {
    const { id: s1 } = await one(db.as<{ id: string }>(atendimento, `insert into public.appointment_slots (development_id, kind, starts_at, ends_at) values ($1, 'vistoria', now() + interval '3 days', now() + interval '3 days 1 hour') returning id`, [SOHO]));
    const { id: s2 } = await one(db.as<{ id: string }>(atendimento, `insert into public.appointment_slots (development_id, kind, starts_at, ends_at) values ($1, 'vistoria', now() + interval '4 days', now() + interval '4 days 1 hour') returning id`, [SOHO]));
    expect((await db.as(A.claims, `select * from public.available_slots($1, 'vistoria')`, [A.unitId])).length).toBe(2);
    await db.as(A.claims, `select public.client_book_slot($1, $2)`, [s1, A.unitId]);
    await expect(db.as(A2.claims, `select public.client_book_slot($1, $2)`, [s1, A2.unitId])).rejects.toThrow(/ocupado|indisponível/);
    expect((await db.as(A2.claims, `select * from public.available_slots($1, 'vistoria')`, [A2.unitId])).length).toBe(1);
    await expect(db.as(B.claims, `select public.client_book_slot($1, $2)`, [s2, B.unitId])).rejects.toThrow(/indisponível/);
    await db.as(A.claims, `select public.client_book_slot($1, $2)`, [s2, A.unitId]); // reagenda
    const active = await db.admin(`select slot_id from public.appointment_bookings where unit_id = $1 and status = 'agendada'`, [A.unitId]);
    expect(active).toEqual([{ slot_id: s2 }]);
    expect(await db.as(A2.claims, `select * from public.appointment_bookings`)).toHaveLength(0);
  });

  it("pendências: cliente aceita ou contesta só depois de resolvida", async () => {
    const { id } = await one(db.as<{ id: string }>(atendimento, `insert into public.punch_list_items (unit_id, location, description) values ($1, 'Suíte', 'Rejunte falhado') returning id`, [A.unitId]));
    await expect(db.as(A.claims, `select public.client_respond_punch_item($1, true, null)`, [id])).rejects.toThrow(/resolvido/);
    await db.as(atendimento, `update public.punch_list_items set status = 'resolvida', resolved_at = now() where id = $1`, [id]);
    await expect(db.as(A.claims, `select public.client_respond_punch_item($1, false, '')`, [id])).rejects.toThrow(/motivo/);
    await db.as(A.claims, `select public.client_respond_punch_item($1, false, 'Ainda manchado')`, [id]);
    expect((await one(db.admin<{ status: string }>(`select status from public.punch_list_items where id = $1`, [id]))).status).toBe("contestada");
    expect(await db.as(A2.claims, `select * from public.punch_list_items`)).toHaveLength(0);
  });
});

describe("documentos", () => {
  it("versões numeradas e imutáveis; oculto não é lido nem baixado; manual do empreendimento para todos os clientes dele", async () => {
    const { id: visible } = await one(db.as<{ id: string }>(documentos, `insert into public.documents (unit_id, category, title) values ($1, 'contrato', 'Contrato assinado') returning id`, [A.unitId]));
    const { id: hidden } = await one(db.as<{ id: string }>(documentos, `insert into public.documents (unit_id, category, title, visible_to_client) values ($1, 'outro', 'Parecer interno', false) returning id`, [A.unitId]));
    const { id: manual } = await one(db.as<{ id: string }>(documentos, `insert into public.documents (development_id, category, title) values ($1, 'manual', 'Manual do proprietário') returning id`, [SOHO]));
    const add = (doc: string, path: string) => db.as(documentos, `select public.admin_add_document_version($1, $2, 'application/pdf', 10, null) as v`, [doc, path]);
    await expect(add(visible, `${B.unitId}/x.pdf`)).rejects.toThrow(/caminho/);
    expect((await add(visible, `${A.unitId}/contrato-v1.pdf`))[0]).toEqual({ v: 1 });
    expect((await add(visible, `${A.unitId}/contrato-v2.pdf`))[0]).toEqual({ v: 2 });
    await add(hidden, `${A.unitId}/parecer.pdf`);
    await add(manual, `empreendimento/${SOHO}/manual.pdf`);
    await expect(db.admin(`update public.document_versions set storage_path = 'x' where document_id = $1`, [visible])).rejects.toThrow(/imutáveis/);
    for (const p of [`${A.unitId}/contrato-v1.pdf`, `${A.unitId}/parecer.pdf`, `empreendimento/${SOHO}/manual.pdf`]) {
      await db.admin(`insert into storage.objects (bucket_id, name) values ('client-documents', $1)`, [p]);
    }
    const titles = (await db.as<{ title: string }>(A.claims, `select title from public.documents order by title`)).map((r) => r.title);
    expect(titles).toEqual(["Contrato assinado", "Manual do proprietário"]); // "Parecer interno" (oculto) não aparece
    const files = (await db.as<{ name: string }>(A.claims, `select name from storage.objects where bucket_id = 'client-documents' order by name`)).map((r) => r.name);
    expect(files).not.toContain(`${A.unitId}/parecer.pdf`);
    expect(files).toContain(`${A.unitId}/contrato-v1.pdf`);
    expect((await db.as<{ title: string }>(A2.claims, `select title from public.documents`)).map((r) => r.title)).toContain("Manual do proprietário");
    expect((await db.as<{ title: string }>(A2.claims, `select title from public.documents`)).map((r) => r.title)).not.toContain("Contrato assinado");
    expect(await db.as(B.claims, `select * from public.documents where development_id = $1`, [SOHO])).toHaveLength(0);
    expect(await db.as(atendimento, `select * from public.documents`)).toHaveLength(0);
  });
});

describe("financeiro do cliente", () => {
  let contract: string;
  let inst1: string;
  beforeAll(async () => {
    ({ id: contract } = await one(db.as<{ id: string }>(financeiro, `insert into public.financial_contracts (unit_id, contract_value) values ($1, 1025000) returning id`, [A.unitId])));
    ({ id: inst1 } = await one(db.as<{ id: string }>(financeiro,
      `insert into public.installments (contract_id, number, kind, due_date, original_amount, monetary_update, interest, fine, updated_amount)
       values ($1, 1, 'parcela', current_date - 10, 10000, 150, 33.33, 200, 10383.33) returning id`, [contract])));
    await db.as(financeiro, `insert into public.installments (contract_id, number, due_date, original_amount) values ($1, 2, current_date + 20, 10000)`, [contract]);
  });

  it("cliente vê o próprio financeiro com vencidas/a vencer derivadas; outros e atendimento não veem", async () => {
    const rows = await db.as<{ number: number; display_status: string }>(A.claims, `select number, display_status from public.installments_view order by number`);
    expect(rows).toEqual([{ number: 1, display_status: "vencida" }, { number: 2, display_status: "a_vencer" }]);
    for (const c of [A2.claims, B.claims, atendimento, documentos]) expect(await db.as(c, `select * from public.installments`)).toHaveLength(0);
  });

  it("comprovante não dá baixa; só a validação autorizada; staff não grava pagamento direto", async () => {
    await expect(
      db.as(A.claims, `select public.client_submit_receipt($1, $2, $3, 10383.33, current_date, null)`, [contract, inst1, `${A2.unitId}/comprovantes/x.pdf`]),
    ).rejects.toThrow(/caminho/);
    const { id: rec } = await one(db.as<{ id: string }>(A.claims, `select public.client_submit_receipt($1, $2, $3, 10383.33, current_date, 'Pago via PIX') as id`,
      [contract, inst1, `${A.unitId}/comprovantes/pix.pdf`]));
    expect((await one(db.admin<{ status: string; paid_amount: string }>(`select status, paid_amount from public.installments where id = $1`, [inst1])))).toEqual({ status: "aberta", paid_amount: "0.00" });
    await expect(db.as(financeiro, `update public.installments set paid_amount = 1, status = 'paga' where id = $1`, [inst1])).rejects.toThrow(/permission denied/);
    await expect(db.as(atendimento, `select public.admin_review_receipt($1, true, null, true, null, null)`, [rec])).rejects.toThrow(/acesso negado/);
    await db.as(financeiro, `select public.admin_review_receipt($1, true, 'Conferido', true, null, null)`, [rec]);
    expect((await one(db.admin<{ status: string }>(`select status from public.installments where id = $1`, [inst1]))).status).toBe("paga");
    await expect(db.as(financeiro, `select public.admin_review_receipt($1, true, null, false, null, null)`, [rec])).rejects.toThrow(/já analisado/);
    expect(await db.admin(`select 1 from public.audit_log where action = 'parcela_baixa' and entity_id = $1`, [inst1])).toHaveLength(1);
  });

  it("importação validada é tudo ou nada e marca a origem", async () => {
    const good = [{ line: 1, unit_id: A.unitId, number: 3, due_date: "2027-01-10", original_amount: 10000 }];
    const bad = [...good, { line: 2, unit_id: B.unitId, number: 1, due_date: "2027-01-10", original_amount: 10000 }];
    await expect(db.as(financeiro, `select public.admin_import_installments('x.csv', $1::jsonb)`, [JSON.stringify(bad)])).rejects.toThrow(/sem contrato/);
    expect(await db.admin(`select 1 from public.installments where contract_id = $1 and number = 3`, [contract])).toHaveLength(0);
    const { r } = await one(db.as<{ r: { inseridas: number } }>(financeiro, `select public.admin_import_installments('ok.csv', $1::jsonb) as r`, [JSON.stringify(good)]));
    expect(r.inseridas).toBe(1);
    expect((await one(db.admin<{ data_source: string }>(`select data_source from public.installments where contract_id = $1 and number = 3`, [contract]))).data_source).toBe("importacao");
  });

  it("pedido de esclarecimento: cliente pergunta, financeiro responde e o cliente é avisado", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_create_inquiry($1, $2, 'Por que há multa?') as id`, [contract, inst1]));
    await db.as(financeiro, `select public.admin_answer_inquiry($1, 'Pagamento após o vencimento.', false)`, [id]);
    expect((await one(db.as<{ status: string }>(A.claims, `select status from public.financial_inquiries where id = $1`, [id]))).status).toBe("respondida");
    expect(await db.as(A2.claims, `select * from public.financial_inquiries`)).toHaveLength(0);
  });
});

describe("chamados", () => {
  it("isolamento, nota interna oculta, avaliação de garantia manual e oculta ao cliente, avaliação do atendimento", async () => {
    const { id } = await one(db.as<{ id: string }>(A.claims, `select public.client_open_ticket($1, 'assistencia_tecnica', 'Infiltração', 'Mancha no teto do banheiro') as id`, [A.unitId]));
    expect(await db.as(A2.claims, `select id from public.tickets`)).toHaveLength(0);
    expect(await db.as(financeiro, `select id from public.tickets`)).toHaveLength(0);
    await db.as(atendimento, `select public.post_ticket_message($1, 'Verificar laje', true)`, [id]);
    await db.as(atendimento, `select public.post_ticket_message($1, 'Agendaremos uma visita.', false)`, [id]);
    await expect(db.as(A.claims, `select public.post_ticket_message($1, 'x', true)`, [id])).rejects.toThrow(/acesso negado/);
    const msgs = await db.as<{ body: string }>(A.claims, `select body from public.ticket_messages where ticket_id = $1`, [id]);
    expect(msgs.map((m) => m.body)).toEqual(["Agendaremos uma visita."]);
    expect((await one(db.as<{ coverage: string }>(atendimento, `select * from public.admin_ticket_internal($1)`, [id]))).coverage).toBe("nao_avaliado");
    await expect(db.as(A.claims, `select coverage from public.tickets where id = $1`, [id])).rejects.toThrow(/permission denied/);
    await expect(db.as(A.claims, `select public.client_rate_ticket($1, 5, null)`, [id])).rejects.toThrow(/após a resolução/);
    await db.as(atendimento, `select public.admin_update_ticket($1, 'resolvido', 'alta', null, null, current_date + 5, 'coberto', 'Garantia estrutural')`, [id]);
    await db.as(A.claims, `select public.client_rate_ticket($1, 5, 'Rápido')`, [id]);
    expect((await one(db.admin<{ status: string; rating: number }>(`select status, rating from public.tickets where id = $1`, [id])))).toEqual({ status: "encerrado", rating: 5 });
    await db.admin(`insert into storage.objects (bucket_id, name) values ('ticket-attachments', $1)`, [`${id}/foto.jpg`]);
    expect(await db.as(A2.claims, `select name from storage.objects where bucket_id = 'ticket-attachments'`)).toHaveLength(0);
    expect(await db.as(A.claims, `select name from storage.objects where bucket_id = 'ticket-attachments'`)).toHaveLength(1);
  });
});

describe("eventos", () => {
  it("convidados, capacidade com lista de espera, promoção e sigilo dos participantes; lembrete sem duplicar", async () => {
    const broker = await makeBroker(db, "evt@t.ouz", "52998224725", "7777", { approveWith: admin.aal2 });
    const { id: ev } = await one(db.as<{ id: string }>(eventos,
      `insert into public.events (title, starts_at, audience, capacity, is_published, reminder_hours) values ('Coquetel', now() + interval '12 hours', 'convidados', 2, true, 24) returning id`));
    await db.as(eventos, `insert into public.event_invitations (event_id, user_id) values ($1, $2), ($1, $3), ($1, $4)`, [ev, A.userId, A2.userId, broker.id]);
    expect(await db.as(B.claims, `select id from public.events where id = $1`, [ev])).toHaveLength(0);
    await expect(db.as(B.claims, `select public.event_rsvp($1, true, 0)`, [ev])).rejects.toThrow(/acesso negado/);

    expect((await one(db.as<{ s: string }>(A.claims, `select public.event_rsvp($1, true, 0) as s`, [ev]))).s).toBe("confirmado");
    expect((await one(db.as<{ s: string }>(A2.claims, `select public.event_rsvp($1, true, 0) as s`, [ev]))).s).toBe("confirmado");
    expect((await one(db.as<{ s: string }>(broker.claims, `select public.event_rsvp($1, true, 0) as s`, [ev]))).s).toBe("lista_espera");
    expect(await db.as(A.claims, `select * from public.event_rsvps`)).toHaveLength(1); // só a própria
    await expect(db.as(A.claims, `select * from public.admin_event_attendance($1)`, [ev])).rejects.toThrow(/acesso negado/);

    await db.as(A.claims, `select public.event_rsvp($1, false, 0)`, [ev]);
    const att = await db.as<{ status: string }>(eventos, `select status from public.admin_event_attendance($1) where user_id = $2`, [ev, broker.id]);
    expect(att[0].status).toBe("confirmado");

    await db.admin(`select public.send_event_reminders()`);
    await db.admin(`select public.send_event_reminders()`);
    const rem = await db.admin(`select 1 from public.notifications where kind = 'evento_lembrete' and user_id = $1`, [A2.userId]);
    expect(rem).toHaveLength(1);
  });
});
