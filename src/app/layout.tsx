import type { Metadata, Viewport } from "next";
import { Albert_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Tipografia oficial OUZ (ouzgroup.com.br): General Sans (títulos; ITF Free Font License, via Fontshare) e Albert Sans (texto).
const heading = localFont({
  src: [
    { path: "./fonts/GeneralSans-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});
const body = Albert_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OUZ Experience", template: "%s · OUZ" },
  description: "OUZ — vamos além do metro quadrado. Empreendimentos com design e tecnologia em Florianópolis. Área do cliente e portal do corretor.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  appleWebApp: { capable: true, title: "OUZ", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f2f0eb",
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
