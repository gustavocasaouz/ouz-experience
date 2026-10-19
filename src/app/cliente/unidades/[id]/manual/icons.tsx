import { cx } from "@/design-system/cx";
import { fold } from "@/lib/manual";

// Ícones de traço (24×24), no mesmo desenho do manual web original.
const P: Record<string, string> = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  building: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18"/><path d="M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 13 11"/>',
  paper: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1.5 2 1.5 3 1-2 1.5-5 1.5-8z"/>',
  fire: '<path d="M8 3h8v4H8zM10 7v3M14 7v3"/><rect x="7" y="10" width="10" height="11" rx="3"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8"/>',
  elevator: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M7.5 10l1.5-2 1.5 2M13.5 14l1.5 2 1.5-2"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
  brush: '<path d="M18 3 9 12l3 3 9-9z"/><path d="M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 10-5z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  pool: '<path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15V5a2 2 0 0 1 4 0M14 15V5a2 2 0 0 1 4 0M8 9h6"/>',
  tree: '<path d="M12 21v-6M12 15c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6z"/>',
  snow: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v3h3v-3M16 16v3h3v-3"/><path d="M5 11h14"/>',
  door: '<path d="M5 21V3h12v18M3 21h18M14 12h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  bath: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V5a2 2 0 0 1 4 0"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 11h8"/>',
  grill: '<path d="M4 9h16a8 8 0 0 1-16 0zM8 17l-2 4M16 17l2 4M9 5c0-1 1-1 1-2M14 5c0-1 1-1 1-2"/>',
  foundation: '<path d="M3 21h18M5 21V11h14v10M9 21v-5h6v5M3 11l9-7 9 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
};

export function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className={cx("shrink-0", className)} aria-hidden dangerouslySetInnerHTML={{ __html: P[name] ?? P.book! }} />
  );
}

const SYSTEM_ICONS: Array<[string, string]> = [
  ["FUNDAC", "foundation"], ["ESTRUTURAMETAL", "layers"], ["ESTRUTURA", "building"], ["VEDAC", "grid"], ["ARGAMASSA", "brush"], ["GAS", "flame"],
  ["ELETRIC", "bolt"], ["TELEFON", "wifi"], ["HIDROSS", "drop"], ["INCENDIO", "fire"], ["DESCARGAS", "bolt"], ["SEGURANCA", "shield"], ["ELEVADOR", "elevator"],
  ["EXAUST", "wind"], ["SERRALH", "tools"], ["INOX", "layers"], ["FACHADA", "building"], ["PINTURA", "brush"], ["GARAGE", "car"], ["CERAMIC", "grid"], ["PISO", "grid"],
  ["PEDRAS", "layers"], ["REJUNTE", "grid"], ["FORRO", "layers"], ["DECK", "layers"], ["IMPERMEAB", "drop"], ["ARCONDIC", "snow"], ["VEICULOS", "car"], ["COBERTURA", "home"],
  ["ALUMINIO", "window"], ["VIDRO", "window"], ["MADEIRA", "door"], ["RODAPE", "grid"], ["CHURRAS", "grill"], ["ILUMINAC", "bulb"], ["LOUCA", "bath"], ["PISCINA", "pool"],
  ["ANCORAGEM", "anchor"], ["PAISAG", "tree"],
];
export function systemIcon(title: string) {
  const t = fold(title).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return SYSTEM_ICONS.find(([k]) => t.includes(k))?.[1] ?? "tools";
}
export const CHAPTER_ICONS: Record<string, string> = {
  "1": "book", "2": "shield", "3": "building", "4": "key", "5": "tools", "6": "users", "7": "calendar", "8": "paper", "9": "alert", "10": "folder",
};

/** Cores dos quadros do manual web (dourado, verde, azul e vermelho), com as variantes do modo escuro. */
export type Tone = "neutral" | "gold" | "green" | "blue" | "red";
const TONES: Record<Tone, string> = {
  neutral: "bg-sand text-ink",
  gold: "bg-warning-soft text-warning",
  green: "bg-success-soft text-success",
  blue: "bg-info-soft text-info",
  red: "bg-danger-soft text-danger",
};

export function IconBadge({ name, tone = "neutral", className }: { name: string; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-grid place-items-center size-11 rounded-[var(--radius-sm)]", TONES[tone], className)}>
      <Icon name={name} />
    </span>
  );
}
