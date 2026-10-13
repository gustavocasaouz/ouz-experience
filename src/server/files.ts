import "server-only";
import { randomUUID } from "node:crypto";

export const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Valida o arquivo pelo tipo declarado E pela assinatura binária (magic bytes). */
export async function validateUpload(file: File, allowed: readonly string[], maxBytes: number): Promise<string | null> {
  if (file.size === 0) return "Arquivo vazio.";
  if (file.size > maxBytes) return `Arquivo acima de ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  if (!allowed.includes(file.type)) return "Formato não aceito.";
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = Array.from(head, (b) => b.toString(16).padStart(2, "0")).join("");
  const ok =
    (file.type === "application/pdf" && hex.startsWith("25504446")) ||
    (file.type === "image/jpeg" && hex.startsWith("ffd8ff")) ||
    (file.type === "image/png" && hex.startsWith("89504e47")) ||
    (file.type === "image/webp" && hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") ||
    (file.type === "image/avif" && hex.slice(8, 16) === "66747970");
  return ok ? null : "O conteúdo do arquivo não corresponde ao formato informado.";
}

/** Nome de objeto opaco (sem nome original do arquivo, que pode conter dados pessoais). */
export function objectPath(prefix: string, file: File) {
  return `${prefix}/${randomUUID()}.${EXT[file.type] ?? "bin"}`;
}

export function filesFrom(fd: FormData, name: string): File[] {
  return fd.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
}
