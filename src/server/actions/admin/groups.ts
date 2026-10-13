"use server";

import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { back, failOn, guard, optStr, str } from "./util";

export async function createGroup(fd: FormData) {
  const path = "/admin/grupos";
  await guard("comercial", path);
  const name = str(fd, "name");
  if (name.length < 2) back(path, "erro", "Informe o nome do grupo.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("broker_groups").insert({ name: name.slice(0, 120), description: optStr(fd, "description") }).select("id").single();
  failOn(error, path);
  back(`/admin/grupos/${data!.id}`, "ok", "Grupo criado.");
}

export async function addGroupMember(fd: FormData) {
  const id = str(fd, "group_id");
  const path = `/admin/grupos/${id}`;
  await guard("comercial", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("broker_group_members").insert({ group_id: id, broker_user_id: str(fd, "broker_user_id") });
  failOn(error, path);
  back(path, "ok", "Corretor adicionado ao grupo.");
}

export async function removeGroupMember(fd: FormData) {
  const id = str(fd, "group_id");
  const path = `/admin/grupos/${id}`;
  await guard("comercial", path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("broker_group_members").delete().eq("group_id", id).eq("broker_user_id", str(fd, "broker_user_id"));
  failOn(error, path);
  back(path, "ok", "Corretor removido do grupo.");
}
