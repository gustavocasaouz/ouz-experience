import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  // Aba do navegador: círculo branco com o símbolo preto (mesmo padrão de ouzgroup.com.br).
  return brandIcon(32, { padding: 0.2, circle: true });
}
