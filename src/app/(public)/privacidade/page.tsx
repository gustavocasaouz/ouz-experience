import Link from "next/link";
import { publicEnv } from "@/lib/env";
import { COMPANY } from "@/lib/company";
import { Fill, LegalList, LegalPage, LegalSection } from "@/components/legal";

export const metadata = { title: "Política de privacidade" };

/*
 * Redigida a partir do que o OUZ Experience trata de fato (banco, app iOS, e-mail e avisos).
 * Ao mudar o tratamento de dados, atualize esta página, a "Privacidade do app" na App Store (docs/06-app-store.md)
 * e a versão NEXT_PUBLIC_PRIVACY_VERSION.
 */
export default function PrivacyPage() {
  const email = COMPANY.privacyEmail ? <a href={`mailto:${COMPANY.privacyEmail}`} className="underline">{COMPANY.privacyEmail}</a> : <Fill value="" />;
  return (
    <LegalPage title="Política de privacidade" version={publicEnv.privacyVersion}>
      <p>
        Esta política explica como a OUZ trata os dados pessoais de quem usa o OUZ Experience, no site ouz.app.br e no aplicativo para
        iPhone, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).
      </p>

      <LegalSection n={1} title="Quem é responsável pelos seus dados">
        <p>
          A controladora dos dados é <Fill value={COMPANY.legalName} />, CNPJ <Fill value={COMPANY.cnpj} />, com sede em <Fill value={COMPANY.address} /> (&quot;OUZ&quot;).
        </p>
        <p>
          Encarregado pelo tratamento de dados pessoais: <Fill value={COMPANY.dpoName} />, pelo e-mail {email}. Esse também é o canal para dúvidas,
          pedidos e reclamações sobre os seus dados.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Quais dados tratamos">
        <p>Tratamos apenas os dados necessários para cada tipo de uso:</p>
        <LegalList
          items={[
            <><strong>Conta de acesso:</strong> nome, e-mail, telefone (opcional) e senha. A senha é guardada de forma criptografada e a OUZ não tem acesso a ela.</>,
            <><strong>Clientes:</strong> dados do contrato e da unidade (empreendimento, unidade, CPF ou CNPJ), parcelas, pagamentos e comprovantes enviados, documentos da unidade, chamados e suas mensagens e anexos, solicitações de personalização, agendamentos, vistoria e entrega, confirmações de presença em eventos e pedidos ao concierge.</>,
            <><strong>Corretores:</strong> nome, CPF, número e estado do CRECI, e-mail, telefone, cidade, região, endereço (opcional), imobiliária e CNPJ (opcionais), documentos enviados para análise e o histórico do cadastro. Nas propostas e reservas, também os dados do comprador informados pelo corretor (nome, CPF ou CNPJ e contato).</>,
            <><strong>Interessados:</strong> nome, e-mail, telefone, empreendimento de interesse e mensagem enviados em formulários de contato.</>,
            <><strong>Uso e segurança:</strong> registros de acesso e de ações importantes (por exemplo, alterações feitas pela equipe), e um código cifrado derivado do endereço IP, usado só para limitar tentativas repetidas de login e de envio.</>,
            <><strong>Aparelho:</strong> no app para iPhone, o código do aparelho para receber avisos (se você permitir) e o modelo de biometria disponível. Veja a seção 4.</>,
          ]}
        />
        <p>Não tratamos dados de localização, contatos da agenda, histórico de navegação, dados de saúde nem identificadores de publicidade.</p>
      </LegalSection>

      <LegalSection n={3} title="Para que usamos e com qual base legal">
        <LegalList
          items={[
            <><strong>Executar o contrato e prestar o atendimento</strong> (LGPD, art. 7º, V): mostrar sua unidade, a obra, os documentos e o financeiro; receber comprovantes; responder chamados; agendar vistoria e entrega; acompanhar a garantia.</>,
            <><strong>Relação com corretores parceiros</strong> (art. 7º, V): analisar o cadastro, liberar empreendimentos e materiais, registrar propostas e reservas.</>,
            <><strong>Cumprir obrigações legais e regulatórias</strong> (art. 7º, II): guardar contratos, registros financeiros e fiscais e responder a autoridades.</>,
            <><strong>Exercer direitos</strong> em processos judiciais, administrativos ou arbitrais (art. 7º, VI).</>,
            <><strong>Legítimo interesse</strong> (art. 7º, IX): segurança da conta, prevenção a fraudes e abusos, e melhoria do atendimento, sempre respeitando os seus direitos e expectativas.</>,
            <><strong>Consentimento</strong> (art. 7º, I): comunicações de marketing e novidades, quando você optar por recebê-las. Você pode retirar o consentimento a qualquer momento.</>,
          ]}
        />
        <p>Avisos por e-mail e no app sobre a sua unidade, seus chamados e o seu cadastro fazem parte do atendimento e não são marketing.</p>
      </LegalSection>

      <LegalSection n={4} title="Recursos do aplicativo">
        <LegalList
          items={[
            <><strong>Face ID:</strong> a biometria é conferida pelo próprio iPhone. A OUZ não recebe nem guarda sua imagem ou dados biométricos. O app guarda no aparelho, protegida pelo Face ID, apenas uma chave de acesso, apagada se a biometria do iPhone mudar ou se você desligar o recurso em Minha conta.</>,
            <><strong>Avisos no iPhone:</strong> com a sua permissão, o aparelho recebe um código da Apple para os avisos, que guardamos ligado à sua conta. Ao sair da conta no app, os avisos daquele aparelho são desligados. Você também pode desligá-los nos Ajustes do iPhone.</>,
            <><strong>Links para outros sites</strong> abrem numa janela do navegador dentro do app. O que você fizer nesses sites segue as regras de privacidade de cada um.</>,
          ]}
        />
      </LegalSection>

      <LegalSection n={5} title="Cookies e armazenamento no aparelho">
        <p>
          Usamos apenas cookies essenciais, para manter você conectado com segurança, e guardamos no aparelho algumas preferências simples (por
          exemplo, se você já respondeu à oferta do Face ID). Não usamos cookies de publicidade nem ferramentas de análise de terceiros.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Com quem compartilhamos">
        <p>A OUZ não vende dados pessoais. Compartilhamos somente o necessário com:</p>
        <LegalList
          items={[
            <><strong>Fornecedores de tecnologia</strong> que tratam os dados em nome da OUZ, sob contrato e com segurança: hospedagem do site e das funções (Vercel), banco de dados, autenticação e arquivos (Supabase), envio de e-mails (Resend) e entrega de avisos no iPhone (Apple).</>,
            <><strong>Corretores parceiros</strong>, quanto aos dados da proposta ou reserva em que atuam.</>,
            <><strong>Prestadores de serviço do concierge</strong>, quando você pede um serviço, apenas o necessário para atendê-lo.</>,
            <><strong>Autoridades públicas</strong>, quando houver obrigação legal ou ordem judicial.</>,
          ]}
        />
      </LegalSection>

      <LegalSection n={7} title="Transferência internacional">
        <p>
          Alguns fornecedores podem armazenar ou processar dados fora do Brasil, por exemplo nos Estados Unidos. Nesses casos, a transferência
          segue o art. 33 da LGPD, com fornecedores que adotam garantias contratuais e padrões de segurança compatíveis com a lei brasileira.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Como protegemos os dados">
        <p>
          Os dados trafegam criptografados (HTTPS). Cada pessoa vê apenas o que lhe diz respeito: o cliente vê as próprias unidades, o corretor vê o
          próprio cadastro e as próprias propostas, e a equipe OUZ acessa só o necessário para a sua função, com verificação em duas etapas. Ações
          importantes ficam registradas para auditoria. Nenhum sistema é totalmente imune a incidentes; se algum ocorrer com risco relevante, a OUZ
          comunicará os titulares e a ANPD conforme a lei.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Por quanto tempo guardamos">
        <p>
          Guardamos os dados enquanto a sua conta estiver ativa ou enquanto houver relação com a OUZ. Depois disso, mantemos apenas o que for
          necessário para cumprir obrigações legais, contratuais e regulatórias (como contratos, registros financeiros e garantia da obra) e para o
          exercício de direitos, pelos prazos que a lei exige. Dados de interessados são guardados por até dois anos sem novo contato. Encerrados os
          prazos, os dados são excluídos ou anonimizados.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Seus direitos">
        <p>Conforme o art. 18 da LGPD, você pode pedir a qualquer momento:</p>
        <LegalList
          items={[
            "confirmação de que tratamos seus dados e acesso a eles;",
            "correção de dados incompletos, inexatos ou desatualizados;",
            "anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;",
            "portabilidade dos dados a outro fornecedor;",
            "eliminação dos dados tratados com base no consentimento e informação sobre a possibilidade de não consentir;",
            "informação sobre com quem compartilhamos os dados;",
            "revogação do consentimento e revisão de decisões tomadas apenas com base em tratamento automatizado.",
          ]}
        />
        <p>
          Para exercer esses direitos, escreva para {email}. Você também pode <strong>excluir a sua conta pelo próprio app</strong>, em{" "}
          <Link href="/conta/excluir" className="underline">Minha conta › Excluir conta</Link>: o acesso e os dados do perfil são apagados na hora, e a OUZ
          mantém apenas o que a lei exige guardar (seção 9). Se não ficar satisfeito com a resposta, você pode procurar a Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection n={11} title="Menores de idade">
        <p>O OUZ Experience é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes.</p>
      </LegalSection>

      <LegalSection n={12} title="Alterações desta política">
        <p>
          Podemos atualizar esta política. A versão e a data ficam no topo da página. Quando a mudança for relevante, avisaremos no app ou por e-mail e,
          quando necessário, pediremos um novo aceite.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
