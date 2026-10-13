import type { z } from "zod";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores enviados, para repovoar o formulário após erro. */
  values?: Record<string, string>;
  data?: Record<string, unknown>;
};

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

export function fromZodError(error: z.ZodError, values?: Record<string, string>): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { error: "Revise os campos destacados.", fieldErrors, values };
}

/** Converte erros do Postgres/Supabase em mensagens seguras (sem detalhes internos). */
export function dbErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "Não foi possível concluir a operação.") {
  if (!error) return fallback;
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.code === "23505") return "Já existe um registro com esses dados.";
  // Mensagens levantadas pelas funções do banco (22023) são escritas para o usuário.
  if (error.code === "22023" && error.message) return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
  return fallback;
}
