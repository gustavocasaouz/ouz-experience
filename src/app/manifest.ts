import type { MetadataRoute } from "next";

/** Manifesto PWA com a identidade oficial OUZ. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OUZ Experience",
    short_name: "OUZ",
    description: "Área do cliente e portal do corretor OUZ.",
    start_url: "/conta",
    scope: "/",
    display: "standalone",
    background_color: "#f2f0eb",
    theme_color: "#f2f0eb",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "lifestyle"],
    icons: [
      { src: "/pwa-icon/192?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg?v=2", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Minhas unidades", url: "/cliente", icons: [{ src: "/pwa-icon/192?v=2", sizes: "192x192" }] },
      { name: "Minhas propostas", url: "/corretor/propostas", icons: [{ src: "/pwa-icon/192?v=2", sizes: "192x192" }] },
      { name: "Agenda", url: "/agenda", icons: [{ src: "/pwa-icon/192?v=2", sizes: "192x192" }] },
      { name: "Notificações", url: "/notificacoes", icons: [{ src: "/pwa-icon/192?v=2", sizes: "192x192" }] },
    ],
  };
}
