import { ImageResponse } from "next/og";

/**
 * Ícone gerado a partir do símbolo vetorial oficial OUZ.
 * Padrão (app instalado): fundo preto, símbolo off-white.
 * circle (aba do navegador, como ouzgroup.com.br): círculo branco, símbolo preto, diagonal reforçada para não sumir em 16–32 px.
 */
export function brandIcon(size: number, opts: { padding?: number; rounded?: boolean; circle?: boolean } = {}) {
  const pad = Math.round(size * (opts.padding ?? 0.2));
  const inner = size - pad * 2;
  const fg = opts.circle ? "#000000" : "#f2f0eb";
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: opts.circle ? "#ffffff" : "#000000", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: opts.circle ? size / 2 : opts.rounded ? size * 0.22 : 0 }}>
        <svg width={inner} height={inner} viewBox="38 39 42 42" fill={fg}>
          <path d="M78.7708 79.4685H49.6437L39.7336 69.6446V40.4314H68.9469L78.857 50.3415V79.4685H78.7708ZM50.5917 76.9695H76.2717V51.2894L67.8266 42.8443H42.2327V68.5244L50.5917 76.9695Z" />
          <path d="M77.5306 40.7578L40.0562 78.2323L40.9092 79.0854L78.3837 41.6109L77.5306 40.7578Z" stroke={opts.circle ? fg : "none"} strokeWidth={opts.circle ? 1.2 : 0} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
