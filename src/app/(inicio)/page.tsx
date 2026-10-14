import Link from "next/link";
import { OuzLogo } from "@/design-system/brand";
import { IntroAnimation } from "@/components/intro-animation";
import { EnvironmentBanner } from "@/components/environment-banner";
import { EntradaFotos, type Foto } from "@/components/entrada-fotos";

// Porta de entrada do app (ouz.app.br): só os acessos. O conteúdo institucional fica em ouzgroup.com.br.
const FOTOS: Foto[] = [
  { src: "/brand/entrada/maui-rooftop-entardecer.jpg", name: "MAUI", note: "Praia Mole" },
  { src: "/brand/entrada/soho-fachada.jpg", name: "SOHO", note: "Jurerê" },
  { src: "/brand/entrada/maui-rooftop-mar.jpg", name: "MAUI", note: "Rooftop" },
  { src: "/brand/entrada/soho-rooftop-aereo.jpg", name: "SOHO", note: "Rooftop" },
  { src: "/brand/entrada/maui-fachada.jpg", name: "MAUI", note: "Fachada" },
  { src: "/brand/entrada/soho-rooftop-gourmet.jpg", name: "SOHO", note: "Espaço gourmet" },
];

const ACESSOS = [
  { href: "/entrar?next=/cliente", title: "Área do cliente", desc: "Sua unidade, obra, documentos e financeiro" },
  { href: "/entrar?next=/corretor", title: "Portal do corretor", desc: "Empreendimentos, tabelas e propostas" },
];

export default function Entrada() {
  return (
    <>
      <IntroAnimation />
      <EnvironmentBanner />
      <main id="conteudo" className="flex-1 grid lg:grid-cols-2 bg-paper">
        <EntradaFotos fotos={FOTOS} className="h-[34svh] lg:h-auto lg:order-2" />
        <div className="flex flex-col px-6 sm:px-12 lg:px-16 py-8 lg:py-12 pb-[max(env(safe-area-inset-bottom),2rem)]">
          <div className="flex items-center justify-between">
            <OuzLogo className="h-6 w-auto" />
            {/* Só no computador: no celular e no app instalado, abrir o site levaria para fora do app. */}
            <a href="https://ouzgroup.com.br" className="hidden lg:inline text-sm text-ink-soft underline-offset-4 hover:underline [@media(display-mode:standalone)]:hidden">
              ← Voltar ao site da OUZ
            </a>
          </div>
          <div className="flex-1 flex flex-col justify-center py-10 max-w-md">
            <p className="eyebrow mb-4">OUZ Experience</p>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight">Criamos empreendimentos com significado.</h1>
            <p className="mt-4 text-ink-soft">Construir espaços que inspiram as pessoas e eternizam momentos.</p>
            <nav aria-label="Acessos" className="mt-10 flex flex-col border-t border-line">
              {ACESSOS.map((a) => (
                <Link key={a.href} href={a.href} className="group flex items-center justify-between gap-4 border-b border-line py-5">
                  <span>
                    <span className="block text-xl">{a.title}</span>
                    <span className="block text-sm text-ink-mute">{a.desc}</span>
                  </span>
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              ))}
            </nav>
            <p className="mt-4 text-sm text-ink-mute">
              Corretor novo? <Link className="underline underline-offset-4 text-ink-soft" href="/entrar/cadastro?next=/corretor">Cadastre-se</Link>
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 text-xs text-ink-mute">
            <span>SOHO · MAUI · UMAN</span>
            <Link href="/entrar?next=/admin" className="hover:text-ink">Acesso da equipe OUZ</Link>
          </div>
        </div>
      </main>
    </>
  );
}
