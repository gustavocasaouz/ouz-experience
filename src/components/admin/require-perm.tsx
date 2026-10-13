import { RestrictedState } from "@/design-system";
import { hasPermission, requireStaffPage } from "@/server/auth/viewer";
import { PERMISSION_LABELS, type StaffPermission } from "@/server/auth/permissions";

/** Bloqueio de página por permissão. Retorna o viewer ou um estado de acesso restrito. */
export async function staffWith(perms: StaffPermission[], next: string) {
  const viewer = await requireStaffPage(next);
  const ok = perms.some((p) => hasPermission(viewer, p));
  return {
    viewer,
    denied: ok ? null : (
      <RestrictedState>
        Esta área exige a permissão {perms.map((p) => `“${PERMISSION_LABELS[p].label}”`).join(" ou ")}. Solicite a um administrador.
      </RestrictedState>
    ),
  };
}
