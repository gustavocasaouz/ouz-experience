"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { assertStaff, AuthorizationError } from "@/server/auth/viewer";
import { STAFF_PERMISSIONS } from "@/server/auth/permissions";
import { enqueueEmail } from "@/server/notifications/outbox";
import { publicEnv } from "@/lib/env";
import { dbErrorMessage, type ActionState } from "../types";
import { back, guard, str } from "./util";

export async function inviteStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await assertStaff("administracao");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  const parsed = z
    .object({
      email: z.email("E-mail inválido.").transform((v) => v.toLowerCase()),
      role: z.enum(["operador", "administrador"]),
      permissions: z.array(z.enum(STAFF_PERMISSIONS)),
    })
    .safeParse({ email: str(fd, "email"), role: str(fd, "role"), permissions: fd.getAll("permissions") });
  if (!parsed.success) return { error: "Revise o e-mail e as permissões." };

  const supabase = await createSupabaseServerClient();
  const { data: token, error } = await supabase.rpc("create_staff_invitation", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_permissions: parsed.data.role === "administrador" ? [] : parsed.data.permissions,
  });
  if (error || typeof token !== "string") return { error: dbErrorMessage(error, "Não foi possível criar o convite.") };

  const link = `${publicEnv.appUrl}/entrar/convite#tipo=equipe&token=${token}`;
  await enqueueEmail({
    dedupeKey: `email:convite_staff:${token.slice(0, 16)}`,
    template: "convite_staff",
    recipientEmail: parsed.data.email,
    payload: { secret_link: link },
  });
  revalidatePath("/admin/equipe");
  return { ok: true, message: `Convite criado para ${parsed.data.email}. Válido por 72 horas.`, data: { link } };
}

export async function updateStaffAccess(fd: FormData) {
  const path = "/admin/equipe";
  await guard("administracao", path);
  const supabase = await createSupabaseServerClient();
  const perms = fd.getAll("permissions").filter((p): p is string => typeof p === "string" && (STAFF_PERMISSIONS as readonly string[]).includes(p));
  const { error } = await supabase.rpc("admin_set_staff_access", {
    p_user_id: str(fd, "user_id"),
    p_active: str(fd, "active") === "on",
    p_role: str(fd, "role") === "administrador" ? "administrador" : "operador",
    p_permissions: perms,
    p_reason: str(fd, "reason"),
  });
  if (error) back(path, "erro", dbErrorMessage(error));
  revalidatePath(path);
  back(path, "ok", "Acesso atualizado.");
}
