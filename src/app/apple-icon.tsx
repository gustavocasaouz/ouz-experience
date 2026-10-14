import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS aplica os cantos arredondados sozinho.
export default function AppleIcon() {
  return brandIcon(180, { padding: 0.2 });
}
