import { reviewReceipt } from "@/server/actions/admin/experience";

export function ReceiptForm({ ret, id }: { ret: string; id: string }) {
  return (
    <form action={reviewReceipt} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="return_to" value={ret} />
      <input type="hidden" name="receipt_id" value={id} />
      <input name="amount" placeholder="Valor (se diferente)" inputMode="decimal" className="border border-line bg-surface px-2 py-1 text-xs w-36" aria-label="Valor" />
      <input name="paid_on" type="date" className="border border-line bg-surface px-2 py-1 text-xs" aria-label="Data" />
      <input name="note" placeholder="Nota" className="border border-line bg-surface px-2 py-1 text-xs" aria-label="Nota" />
      <button name="decision" value="validar_baixar" className="text-xs underline">Validar e dar baixa</button>
      <button name="decision" value="validar" className="text-xs underline">Só validar</button>
      <button name="decision" value="recusar" className="text-xs underline text-danger">Recusar</button>
    </form>
  );
}
