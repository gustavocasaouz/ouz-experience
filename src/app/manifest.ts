import type { MetadataRoute } from "next";

/** Manifesto PWA. Ícone com o símbolo oficial OUZ. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OUZ Experience",
    short_name: "OUZ",
    description: "Área do cliente e portal do corretor OUZ.",
    start_url: "/conta",
    display: "standalone",
    background_color: "#f2f0eb",
    theme_color: "#f2f0eb",
    lang: "pt-BR",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
