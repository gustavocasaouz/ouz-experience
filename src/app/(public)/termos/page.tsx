import Link from "next/link";
import { publicEnv } from "@/lib/env";
import { COMPANY } from "@/lib/company";
import { Fill, LegalList, LegalPage, LegalSection } from "@/components/legal";

export const metadata = { title: "Termos de uso" };

export default function TermsPage() {
  const email = COMPANY.supportEmail || COMPANY.privacyEmail;
  return (
    <LegalPage title="Termos de uso" version={publicEnv.termsVersion}>
      <p>
        Estes termos regem o uso do OUZ Experience, no site ouz.app.br e no aplicativo para iPhone, oferecido por <Fill value={COMPANY.legalName} />,
        CNPJ <Fill value={COMPANY.cnpj} /> (&quot;OUZ&quot;). Ao criar uma conta ou usar o OUZ Experience, você concorda com estes termos e com a{" "}
        <Link href="/privacidade" className="underline">política de privacidade</Link>.
      </p>

      <LegalSection n={1} title="O que é o OUZ Experience">
        <p>
          É o canal de relacionamento da OUZ com clientes que compraram unidades, corretores parceiros e a equipe OUZ. Nele o cliente acompanha a unidade, a
          obra, os documentos e o financeiro, abre chamados e recebe avisos; o corretor consulta empreendimentos liberados, materiais e tabelas e registra
          propostas e reservas.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Quem pode usar">
        <LegalList
          items={[
            "Pessoas maiores de 18 anos e capazes.",
            "Clientes: o acesso é liberado por convite da OUZ, enviado ao e-mail cadastrado no contrato.",
            "Corretores: com cadastro profissional e CRECI regular, sujeitos à análise e aprovação da OUZ, que pode pedir ajustes, recusar ou suspender o cadastro.",
            "Equipe OUZ: por convite, com verificação em duas etapas.",
          ]}
        />
      </LegalSection>

      <LegalSection n={3} title="Sua conta">
        <p>
          A conta é pessoal e intransferível. Mantenha seu e-mail atualizado, use uma senha segura e não a compartilhe. Se ativar o Face ID, o acesso fica
          ligado à biometria cadastrada no seu iPhone. Avise a OUZ se suspeitar de uso indevido. Você pode sair da conta ou excluí-la a qualquer momento em
          Minha conta.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Informações exibidas">
        <LegalList
          items={[
            "As informações do OUZ Experience (evolução da obra, previsões, parcelas, documentos e prazos de garantia) ajudam no acompanhamento, mas não substituem o contrato, os documentos assinados e os comunicados oficiais. Em caso de divergência, prevalecem o contrato e esses documentos.",
            "Previsões de obra e de entrega são estimativas e podem mudar; as alterações ficam registradas no app.",
            "Imagens, plantas e materiais de divulgação são ilustrativos.",
            "Informações publicadas não constituem oferta, reserva ou garantia de unidade, preço ou condição comercial. Tabelas e políticas comerciais podem mudar sem aviso e valem conforme a versão vigente na data da proposta.",
          ]}
        />
      </LegalSection>

      <LegalSection n={5} title="Chamados, assistência técnica e garantia">
        <p>
          Os chamados são o canal para dúvidas, solicitações e assistência técnica. Cada caso é avaliado pela OUZ conforme o contrato, o manual do proprietário e
          os prazos de garantia contados do habite-se. Abrir um chamado não significa que o atendimento esteja coberto pela garantia. Em emergências (por exemplo,
          vazamento, curto-circuito ou cheiro de gás), procure primeiro os serviços de emergência e a administração do condomínio.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Regras para corretores">
        <LegalList
          items={[
            "Informar dados verdadeiros no cadastro e mantê-los atualizados, inclusive a situação no CRECI.",
            "Registrar propostas e reservas apenas com autorização do comprador, informando os dados dele corretamente e tratando-os conforme a LGPD.",
            "Usar materiais, tabelas e informações restritas somente para a venda dos empreendimentos OUZ, sem repassá-los a terceiros nem divulgá-los fora das regras da OUZ.",
            "Seguir as políticas comerciais vigentes. Propostas e reservas dependem de análise e aprovação da OUZ e não geram direito à unidade enquanto não aprovadas.",
          ]}
        />
      </LegalSection>

      <LegalSection n={7} title="Uso permitido">
        <p>É proibido:</p>
        <LegalList
          items={[
            "acessar dados de outras pessoas ou tentar burlar a segurança do OUZ Experience;",
            "usar o sistema para fins ilegais, ofensivos ou diferentes dos previstos nestes termos;",
            "enviar arquivos com vírus ou conteúdo que não seja seu ou que você não tenha direito de compartilhar;",
            "copiar, extrair em massa ou revender conteúdos e dados do OUZ Experience.",
          ]}
        />
        <p>O descumprimento pode levar à suspensão ou ao cancelamento do acesso, sem prejuízo das medidas legais.</p>
      </LegalSection>

      <LegalSection n={8} title="Propriedade intelectual">
        <p>
          Marcas, logotipos, imagens, textos, projetos e materiais do OUZ Experience pertencem à OUZ ou a seus parceiros e são protegidos por lei. O uso do
          app não transfere nenhum direito sobre eles.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Disponibilidade">
        <p>
          A OUZ se esforça para manter o OUZ Experience disponível e seguro, mas ele pode passar por manutenções ou ficar fora do ar por motivos técnicos.
          Recursos podem ser incluídos, alterados ou retirados. Nada nestes termos limita direitos garantidos pelo Código de Defesa do Consumidor.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Alterações dos termos">
        <p>
          Estes termos podem ser atualizados. A versão e a data ficam no topo da página. Quando a mudança for relevante, avisaremos no app ou por e-mail e, quando
          necessário, pediremos um novo aceite.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Lei aplicável e foro">
        <p>
          Estes termos seguem a legislação brasileira. Para clientes consumidores, vale o foro do seu domicílio. Nos demais casos, fica eleito o foro da comarca
          de <Fill value={COMPANY.forum} />.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contato">
        <p>
          Dúvidas sobre estes termos: {email ? <a href={`mailto:${email}`} className="underline">{email}</a> : <Fill value="" />}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
