import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

// Tipografia PROVISÓRIA — trocar junto com os tokens quando o branding oficial chegar.
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-heading", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OUZ Experience", template: "%s · OUZ" },
  description: "Empreendimentos de alto padrão em Florianópolis. Área do cliente e portal do corretor.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  appleWebApp: { capable: true, title: "OUZ", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 bg-ink text-paper px-4 py-2">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
