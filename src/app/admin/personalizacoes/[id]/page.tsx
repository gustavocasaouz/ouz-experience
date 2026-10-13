import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("customization_requests").select("unit_id").eq("id", (await params).id).maybeSingle();
  if (!data) notFound();
  redirect(`/admin/unidades/${data.unit_id}#personalizacao`);
}
