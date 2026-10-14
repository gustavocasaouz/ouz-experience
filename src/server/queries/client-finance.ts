import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type InstallmentRow = {
  id: string; number: number; kind: string; due_date: string | null; original_amount: string; monetary_update: string | null;
  interest: string | null; fine: string | null; updated_amount: string | null; paid_amount: string; paid_on: string | null;
  status: string; display_status: string; indexed: boolean; is_estimate: boolean; index_month: string | null; late_days: number | null;
};

export async function unitFinance(unitId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: contract } = await supabase
    .from("financial_contracts")
    .select("id, contract_value, signed_on, last_updated_at, notes, index_name, late_interest_monthly_pct, late_fine_pct")
    .eq("unit_id", unitId)
    .maybeSingle();
  if (!contract) return null;
  const [{ data: inst }, { data: receipts }, { data: inquiries }] = await Promise.all([
    supabase.from("installments_view").select("*").eq("contract_id", contract.id).order("due_date").order("number"),
    supabase.from("payment_receipts").select("id, installment_id, informed_amount, informed_paid_on, status, review_note, uploaded_at, storage_path").eq("contract_id", contract.id).order("uploaded_at", { ascending: false }),
    supabase.from("financial_inquiries").select("id, installment_id, message, status, response, created_at, responded_at").eq("contract_id", contract.id).order("created_at", { ascending: false }),
  ]);
  const installments = (inst ?? []) as InstallmentRow[];
  const n = (v: string | null | undefined) => Number(v ?? 0);
  const due = (i: InstallmentRow) => n(i.updated_amount ?? i.original_amount);
  const live = installments.filter((i) => !["cancelada", "renegociada"].includes(i.status));
  const totals = {
    contracted: n(contract.contract_value),
    paid: live.reduce((a, i) => a + n(i.paid_amount), 0),
    toPay: live.filter((i) => i.status !== "paga").reduce((a, i) => a + Math.max(due(i) - n(i.paid_amount), 0), 0),
    overdueCount: live.filter((i) => i.display_status === "vencida").length,
    overdueAmount: live.filter((i) => i.display_status === "vencida").reduce((a, i) => a + Math.max(due(i) - n(i.paid_amount), 0), 0),
    upcomingCount: live.filter((i) => i.display_status === "a_vencer").length,
    hasEstimate: live.some((i) => i.status !== "paga" && i.is_estimate),
    lastIndexMonth: live.filter((i) => i.is_estimate && i.index_month).map((i) => i.index_month as string).sort().at(-1) ?? null,
  };
  return { contract, installments, receipts: receipts ?? [], inquiries: inquiries ?? [], totals };
}
