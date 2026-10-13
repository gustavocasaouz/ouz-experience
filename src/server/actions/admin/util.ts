import "server-only";
import { redirect } from "next/navigation";
import { assertStaff, AuthorizationError } from "@/server/auth/viewer";
import type { StaffPermission } from "@/server/auth/permissions";
import { dbErrorMessage } from "../types";

/** Volta para a página com mensagem (não sensível) na URL. */
export function back(path: string, kind: "ok" | "erro", msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

/** Exige a permissão; em caso negativo, volta com erro. O banco verifica novamente (RLS/funções). */
export async function guard(perm: StaffPermission, path: string) {
  try {
    return await assertStaff(perm);
  } catch (e) {
    if (e instanceof AuthorizationError) back(path, "erro", e.message);
    throw e;
  }
}

export function failOn(error: { code?: string; message?: string } | null, path: string, fallback?: string) {
  if (error) back(path, "erro", dbErrorMessage(error, fallback));
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const lines = (fd: FormData, k: string) =>
  str(fd, k)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
