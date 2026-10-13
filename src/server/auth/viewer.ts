import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { isSupabaseConfigured } from "@/lib/env";
import type { BrokerStatus, StaffPermission, StaffRole } from "./permissions";

export type Viewer = {
  userId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  aal: "aal1" | "aal2";
  staff: { role: StaffRole; permissions: StaffPermission[]; mfaOk: boolean } | null;
  broker: { status: BrokerStatus } | null;
  isClient: boolean;
};

/**
 * Identidade e contextos do usuário atual. Cacheado por requisição.
 * Os contextos são DERIVADOS do banco (staff_members, broker_profiles, clients) — nunca de metadados do usuário.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Sempre por requisição: nunca pré-renderizar uma decisão de acesso no build.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [profileRes, staffRes, brokerRes, clientRes, userRes] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("staff_status"),
    supabase.from("broker_profiles").select("status").eq("user_id", claims.sub).maybeSingle(),
    supabase.rpc("is_client"),
    supabase.auth.getUser(),
  ]);

  const staff = staffRes.data as { is_staff: boolean; role?: StaffRole; permissions?: StaffPermission[]; mfa_ok?: boolean } | null;

  return {
    userId: claims.sub,
    email: profileRes.data?.email ?? (claims.email as string | undefined) ?? "",
    fullName: profileRes.data?.full_name ?? "",
    emailVerified: Boolean(userRes.data.user?.email_confirmed_at),
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    staff: staff?.is_staff ? { role: staff.role!, permissions: staff.permissions ?? [], mfaOk: Boolean(staff.mfa_ok) } : null,
    broker: brokerRes.data ? { status: brokerRes.data.status as BrokerStatus } : null,
    isClient: clientRes.data === true,
  };
});

export function hasPermission(viewer: Viewer | null, perm: StaffPermission) {
  return Boolean(viewer?.staff?.mfaOk && (viewer.staff.role === "administrador" || viewer.staff.permissions.includes(perm)));
}

export async function requireViewer(next: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return viewer;
}

/** Para páginas/layouts de /admin: exige staff ativo e MFA (aal2). */
export async function requireStaffPage(next = "/admin") {
  const viewer = await requireViewer(next);
  if (!viewer.staff) redirect("/conta?restrito=admin");
  if (!viewer.staff.mfaOk) redirect(`/entrar/mfa?next=${encodeURIComponent(next)}`);
  return viewer as Viewer & { staff: NonNullable<Viewer["staff"]> };
}

export class AuthorizationError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
  }
}

/** Para Server Actions administrativas. O banco verifica de novo (RLS / funções). */
export async function assertStaff(perm: StaffPermission) {
  const viewer = await getViewer();
  if (!viewer || !hasPermission(viewer, perm)) throw new AuthorizationError();
  return viewer;
}
