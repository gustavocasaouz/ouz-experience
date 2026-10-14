import { ImageResponse } from "next/og";

/**
 * Ícone gerado a partir do símbolo vetorial oficial OUZ: fundo branco e símbolo preto (padrão de ouzgroup.com.br),
 * com a diagonal reforçada para não sumir em tamanhos pequenos.
 * circle: recorte redondo (aba do navegador). Sem circle, quadrado — iOS e Android aplicam o próprio recorte.
 */
export function brandIcon(size: number, opts: { padding?: number; rounded?: boolean; circle?: boolean } = {}) {
  const pad = Math.round(size * (opts.padding ?? 0.2));
  const inner = size - pad * 2;
  const fg = "#000000";
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: opts.circle ? size / 2 : opts.rounded ? size * 0.22 : 0 }}>
        <svg width={inner} height={inner} viewBox="38 39 42 42" fill={fg}>
          <path d="M78.7708 79.4685H49.6437L39.7336 69.6446V40.4314H68.9469L78.857 50.3415V79.4685H78.7708ZM50.5917 76.9695H76.2717V51.2894L67.8266 42.8443H42.2327V68.5244L50.5917 76.9695Z" />
          <path d="M77.5306 40.7578L40.0562 78.2323L40.9092 79.0854L78.3837 41.6109L77.5306 40.7578Z" stroke={fg} strokeWidth={size <= 64 ? 1.2 : 0.8} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
