# Publicação na App Store

Ficha do app **OUZ Experience** (`br.com.ouzgroup.experience`) para o App Store Connect, aba **Distribuição › 1.0 Preparar para envio**. Os textos já respeitam os limites de caracteres da Apple.

## Antes de enviar para revisão (pendências da OUZ)

| Pendência | Por quê | Status |
|---|---|---|
| Política de privacidade em `/privacidade` | A Apple exige uma política real | ✅ Redigida com os dados da OUZ; revisão do jurídico recomendada |
| Termos de uso em `/termos` | O cadastro pede o aceite dos termos | ✅ Redigidos; revisão do jurídico recomendada |
| Página de suporte (`/suporte`) com contato da OUZ | Campo obrigatório "URL de suporte" | ✅ Criada |
| Versão dos textos na Vercel (`NEXT_PUBLIC_PRIVACY_VERSION` e `NEXT_PUBLIC_TERMS_VERSION`) | Hoje aparece "rascunho-2026-10" e fica registrada em cada aceite | ⏳ Trocar para `2026-11-03` |
| Virada para produção (`docs/05-configuracao.md` §7) | Hoje `ouz.app.br` é homologação. Sem a virada, clientes reais entrariam no banco de teste | ⏳ Antes de **liberar** o app |
| Conta de teste para a Apple no banco que estiver no ar | A revisão entra com ela. Depois da virada, precisa existir na produção | ⏳ |

Dá para enviar para revisão antes da virada, escolhendo **"Liberar esta versão manualmente"**. A Apple aprova, e o app só fica disponível quando a OUZ clicar em liberar, depois da virada.

## Informações do app (aba "Informações do app")

- **Nome:** OUZ Experience
- **Subtítulo (29/30):** Área do cliente e do corretor
- **Categoria principal:** Estilo de vida
- **Categoria secundária:** Negócios
- **Classificação etária:** responder "Nenhum" em todas as perguntas → **4+**. O app não tem conteúdo gerado por usuários públicos: as mensagens de chamados são só entre o cliente e a OUZ.
- **Direitos autorais:** © 2026 OUZ
- **URL da política de privacidade:** https://ouz.app.br/privacidade

## Versão 1.0

**Texto promocional (147/170):**

> Acompanhe sua unidade OUZ: evolução da obra, documentos, parcelas, chamados e avisos no celular. Para corretores: lançamentos, tabelas e propostas.

**Descrição:**

> O OUZ Experience é o aplicativo de relacionamento da OUZ com clientes e corretores. Tudo sobre o seu imóvel, num só lugar.
>
> PARA CLIENTES OUZ
> • Suas unidades: acompanhe cada apartamento, com a evolução física da obra, fotos e marcos.
> • Documentos, projetos e memorial descritivo da unidade e do empreendimento, sempre na versão mais recente.
> • Financeiro: parcelas, vencimentos, pagamentos e envio de comprovantes.
> • Chamados: fale com a OUZ, tire dúvidas e acompanhe as respostas, inclusive a assistência técnica dentro da garantia.
> • Personalização: veja o padrão OUZ e solicite opções da sua unidade.
> • Entrega e garantia: vistoria, manual do proprietário e prazos de garantia contados do habite-se.
> • Concierge e agenda: serviços, agendamentos e eventos.
> • Avisos no celular quando houver resposta, documento novo ou novidade da obra.
>
> PARA CORRETORES PARCEIROS
> • Lançamentos e empreendimentos liberados para você, com materiais comerciais.
> • Tabelas de vendas vigentes e políticas comerciais.
> • Propostas e reservas acompanhadas em tempo real.
>
> MAIS PRATICIDADE
> • Entre com Face ID, sem digitar a senha.
> • Navegação pensada para o iPhone.
>
> O acesso de cliente é liberado por convite da OUZ, enviado ao e-mail cadastrado no contrato. Corretores fazem o cadastro profissional pelo app e passam por análise da OUZ.

**Palavras-chave (93/100):**

```
construtora,apartamento,obra,imóvel,cliente,corretor,florianópolis,jurerê,praia mole,garantia
```

- **URL de suporte:** https://ouz.app.br/suporte
- **URL de marketing (opcional):** https://ouz.app.br

## Capturas de tela

iPhone 6,9" (1320 × 2868), de 3 a 10 imagens. Prontas em `docs/app-store/`, nesta ordem:

1. `01-inicio.png`: início do app (MAUI, fachada)
2. `02-unidades.png`: "Olá, Ana" com a unidade MAUI 214
3. `03-obra.png`: evolução física da obra e manual do proprietário
4. `04-financeiro.png`: valor contratado, pago e a pagar
5. `05-chamado.png`: chamado respondido pela OUZ
6. `06-avisos.png`: avisos do app

Feitas no simulador iPhone 18 Pro Max (barra de status 9:41), com o site local ligado ao banco de homologação e `APP_ENV=production`, só para esconder a faixa de homologação. Os dados são da cliente fictícia **Ana Souza** (`demo.cliente@teste.ouz.app.br`, MAUI 214), criada por `scripts/demo-app-store.mjs criar` e removível com `remover`. A evolução física (94,51%) é a informada para o MAUI.

O iPad não é necessário: o app é só para iPhone.

## Privacidade do app (aba "Privacidade do app")

**"Você ou seus parceiros coletam dados deste app?"** → **Sim**.

Para **todos** os tipos abaixo: **vinculados à identidade do usuário: Sim**; **usados para rastreamento: Não**; finalidade: **Funcionalidade do app** (e, onde indicado, **Suporte ao cliente**).

| Categoria na Apple | Tipo | O que é no OUZ Experience |
|---|---|---|
| Informações de contato | Nome | Perfil, cliente e corretor |
| Informações de contato | Endereço de e-mail | Login e avisos por e-mail |
| Informações de contato | Número de telefone | Perfil e cadastro do corretor |
| Informações de contato | Endereço físico | Cadastro do corretor (opcional) |
| Informações financeiras | Outras informações financeiras | Parcelas, pagamentos e comprovantes enviados |
| Conteúdo do usuário | Fotos ou vídeos | Anexos de chamados e comprovantes |
| Conteúdo do usuário | Outro conteúdo do usuário | Mensagens de chamados, solicitações, documentos do corretor (+ Suporte ao cliente) |
| Identificadores | ID do usuário | Conta (ID interno) |
| Outros dados | Outros tipos de dados | CPF (cadastro do corretor e contrato) |

**Não** coletados: localização, contatos, histórico de navegação, histórico de busca, dados de uso, diagnóstico, compras, dados de saúde, identificadores de publicidade. O app não usa ferramentas de análise nem anúncios.

## Informações para a revisão da Apple

- **Login obrigatório:** Sim.
- **Conta de teste (cliente):** `demo.cliente@teste.ouz.app.br` (Ana Souza, MAUI 214, com parcelas, chamados e avisos). A senha está em `contas-teste.local.txt`, fora do Git. A conta precisa existir no banco que estiver no ar na data do envio; depois da virada, recrie com o script no banco de produção, ou use outra conta de demonstração.
- **Conta de teste (corretor, opcional):** corretor aprovado de `contas-teste.local.txt`.
- **Notas para o revisor:**

> O OUZ Experience é o portal de relacionamento da construtora OUZ para clientes que compraram unidades e para corretores parceiros. O acesso de cliente é liberado por convite da OUZ. Use a conta de demonstração acima (cliente fictícia com uma unidade do empreendimento MAUI).
>
> Recursos nativos: entrar com Face ID (Minha conta › Entrar com Face ID), avisos no celular (Minha conta › Avisos no iPhone), gesto de voltar pela borda e links externos abertos dentro do app.
>
> Excluir conta: Minha conta › Excluir conta.
>
> O app não tem compras nem assinaturas.

## Conformidade de exportação

O app só usa a criptografia padrão do sistema (HTTPS). O `Info.plist` já declara `ITSAppUsesNonExemptEncryption = NO`, então o App Store Connect não pergunta mais a cada build.

## Envio

1. Escolher o build (o mais recente, por exemplo 1.0 (4)) na seção **Build** da versão.
2. Em **Liberação da versão**, marcar **Liberar esta versão manualmente**.
3. **Adicionar para revisão** e depois **Enviar para revisão do app**.
4. A revisão costuma levar de 1 a 3 dias. Se a Apple pedir algo, a resposta chega na **Central de resoluções** do App Store Connect.
