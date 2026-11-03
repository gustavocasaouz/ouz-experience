import Link from "next/link";
import { PageHeader } from "@/design-system";
import { COMPANY } from "@/lib/company";

export const metadata = { title: "Suporte" };

/** (48) 99999-9999 a partir dos dígitos. */
const formatPhone = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d);

/** Página de suporte (URL de suporte exigida pela App Store). */
export default function SupportPage() {
  const phone = COMPANY.supportPhone;
  return (
    <div className="container-page py-14 max-w-3xl">
      <PageHeader eyebrow="OUZ Experience" title="Suporte" description="Fale com a OUZ sobre o app, sua unidade ou seu cadastro de corretor." />

      <div className="grid gap-4 sm:grid-cols-2 mb-12">
        <a href={`mailto:${COMPANY.supportEmail}`} className="border border-line bg-surface p-5 hover:border-ink transition-colors">
          <p className="eyebrow mb-2">E-mail</p>
          <p className="font-medium break-all">{COMPANY.supportEmail}</p>
        </a>
        {phone && (
          <a href={`https://wa.me/55${phone}`} className="border border-line bg-surface p-5 hover:border-ink transition-colors">
            <p className="eyebrow mb-2">WhatsApp e telefone</p>
            <p className="font-medium">{formatPhone(phone)}</p>
          </a>
        )}
      </div>

      <div className="flex flex-col gap-8 text-ink-soft leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-2xl text-ink">Dúvidas frequentes</h2>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-ink">Comprei uma unidade. Como acesso o app?</h3>
          <p>O acesso de cliente é liberado por convite da OUZ, enviado ao e-mail cadastrado no contrato. Não recebeu? Fale com a OUZ pelos contatos acima.</p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-ink">Esqueci minha senha</h3>
          <p>Na tela de entrada, toque em <Link href="/entrar/recuperar" className="underline">Esqueci minha senha</Link> e siga o link enviado por e-mail.</p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-ink">Sou corretor. Como me cadastro?</h3>
          <p>Faça o <Link href="/entrar/cadastro?next=/corretor" className="underline">cadastro profissional</Link>. A OUZ analisa os dados e o CRECI e libera o acesso aos empreendimentos.</p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-ink">Problema na unidade</h3>
          <p>Abra um chamado em Chamados, no app. Em emergências (vazamento, curto-circuito, cheiro de gás), procure primeiro os serviços de emergência e a administração do condomínio.</p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-ink">Excluir minha conta</h3>
          <p>Em <Link href="/conta/excluir" className="underline">Minha conta › Excluir conta</Link>. Veja o que é apagado e o que a OUZ guarda na <Link href="/privacidade" className="underline">política de privacidade</Link>.</p>
        </section>
        <p className="text-sm border-t border-line pt-6">
          {COMPANY.legalName} · CNPJ {COMPANY.cnpj} · {COMPANY.address}
        </p>
      </div>
    </div>
  );
}
