import type { MetadataRoute } from "next";

/** Manifesto PWA. Ícone provisório (tipográfico) até o logotipo oficial. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OUZ Experience",
    short_name: "OUZ",
    description: "Área do cliente e portal do corretor OUZ.",
    start_url: "/conta",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    lang: "pt-BR",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
