# Premissas e decisões pendentes

## Premissas adotadas (podem ser revistas)

1. Projeto Supabase próprio da OUZ, com projetos separados para desenvolvimento e produção. Nenhum recurso do Fragata ou de outro projeto é reutilizado.
2. Sem banco compartilhado com o OUZ Gestão; integração futura por API autenticada.
3. Login por e-mail + senha (com verificação de e-mail) e link de recuperação. Login social fica fora.
4. MFA TOTP obrigatório para operadores e administradores; opcional para clientes e corretores.
5. CPF/CNPJ armazenados em texto normalizado em colunas protegidas por RLS + hash HMAC calculado **pelo próprio banco** (pepper em esquema privado), para detectar duplicidades sem expor o número e sem confiar em valor enviado pelo cliente. Dígitos verificadores também são checados no banco. Criptografia em nível de coluna avaliada depois.
6. Validação de CPF/CNPJ por dígito verificador e de CRECI apenas por formato + UF. A interface deixa claro que isso **não** comprova identidade nem regularidade no CRECI.
7. SOHO, MAUI e UMAN entram como referências editáveis, marcadas `is_demo` no seed de desenvolvimento, sem preços, prazos, áreas ou disponibilidade reais.
8. Fotografias: até o envio do acervo da OUZ, a interface usa espaços reservados neutros (sem imagens de terceiros apresentadas como obras da OUZ).
9. Fuso exibido sempre `America/Sao_Paulo`; o Brasil não tem horário de verão desde 2019, mas usamos a base IANA mesmo assim.
10. E-mails de desenvolvimento nunca saem (`EMAIL_MODE=log`).
11. Vercel Cron exige plano Pro para frequência menor que diária; a rotina crítica (reservas) roda no `pg_cron` do Supabase para não depender disso.

## Decisões tomadas pela OUZ

- **13/10/2026 — Domínio:** app em `ouz.app.br`; `ouzgroup.com.br` só para o site institucional.
- **13/10/2026 — Regras comerciais ocultas do corretor:** o corretor não vê limites, percentuais nem critérios da política. Ao enviar, sabe apenas se a proposta está dentro ou fora da política e pode pedir análise da OUZ. Reforçado no banco: snapshot das regras e avaliação detalhada não são legíveis pela API do corretor; a prévia detalhada é exclusiva da OUZ. (Substitui o item do escopo original que previa mostrar os critérios não atendidos.)
- **14/10/2026 — Branding e textos públicos:** extraídos de ouzgroup.com.br (missão, visão, valores, manifesto, SOHO e MAUI). UMAN aparece só no app, como “Em breve”. Divergência a confirmar: o site indica MAUI em “Início de obras”; no app está “Em fase de entrega”, conforme o pedido original.
- **14/10/2026 — Hospedagem:** ouz.app.br em homologação na Vercel (equipe OUZ Experience, plano Hobby) usando o Supabase de desenvolvimento; Pro necessário antes de uso comercial.
- **14/10/2026 — Revisão de segurança (correções aplicadas):** limite de propostas ativas por corretor por empreendimento (padrão 3) e carência de 7 dias para o mesmo corretor reservar de novo a mesma unidade (ambos configuráveis); limites de envio também nas chamadas diretas à API; arquivos de corretor e mídias de cliente liberados arquivo a arquivo (rascunhos, tabelas e plantas respeitam publicação e liberação de preço); dados pessoais (chamados, concierge, personalizações, comprovantes, esclarecimentos) isolados por cliente — contrato, parcelas e documentos da unidade seguem compartilhados entre titulares/cotitulares ativos; contas da equipe não aceitam convite de cliente e vínculos adicionais em unidade avisam a administração; corretor não descobre duplicidade de cliente; exclusões exigem a mesma permissão da gravação; redirecionamento seguro após login.
- **Pendente (revenda):** hoje o financeiro é por unidade. Em revenda, cadastrar novo contrato e encerrar o vínculo anterior; um modelo de contrato por cliente fica para quando houver o primeiro caso.
- **13/10/2026 — Proposta:** condições podem ser digitadas em reais ou em % do valor ofertado.
- **13/10/2026 — Fila sigilosa:** o corretor não sabe quantas propostas existem em cada unidade nem a sua posição na fila (opção de posição removida). A quantidade e a fila completa são exclusivas da OUZ (permissão Comercial).
- **13/10/2026 — “Reservada” só após a documentação:** a unidade aparece como *Disponível* para os corretores enquanto a reserva aguarda documentos; passa a *Reservada* quando o corretor da reserva envia a documentação completa. A reserva de 48 h e a fila valem desde a aprovação (uma reserva ativa por unidade). Consequência: um corretor pode fazer proposta numa unidade “disponível” e ela entrar na fila; ele vê apenas o status “Na fila da unidade”.

## Decisões pendentes da OUZ

| # | Tema | Pergunta | Padrão provisório |
|---|---|---|---|
| 1 | Branding | ~~Logotipo, tipografia e paleta oficiais~~ **Decidido (14/10/2026):** identidade de ouzgroup.com.br — logotipo e símbolo vetoriais, animação de abertura, General Sans + Albert Sans, off-white #F2F0EB, preto e grafite #262626, fotos oficiais do SOHO e do MAUI. | — |
| 2 | Domínio | ~~Domínio do Experience e remetente de e-mail~~ **Decidido (13/10/2026):** o app fica em `ouz.app.br`; o site institucional continua em `ouzgroup.com.br`, com um botão que leva ao app. E-mails do app saem de `ouz.app.br` (verificado no Resend); `ouzgroup.com.br` não é usado pelo app. | `EMAIL_FROM=OUZ Experience <nao-responda@ouz.app.br>` |
| 3 | Regularização | Prazo para corrigir documento recusado na reserva | 24 h, configurável por empreendimento |
| 4 | Análise | Prazo máximo de uma proposta em análise segurando a fila | 24 h úteis, configurável |
| 5 | Duplicidade | Critério de desempate entre corretores com o mesmo cliente | Primeiro envio válido + análise da OUZ |
| 7 | Checklist | Documentos exigidos para PF e PJ | Modelo editável, sem itens obrigatórios pré-definidos |
| 8 | Pré-lançamento | Limite de registros por cliente e critério de prioridade | 1 por cliente; ordem cronológica |
| 9 | Retenção | Prazos (LGPD) para leads, documentos de corretores recusados, logs | A definir com o jurídico; rotina pronta e desligada |
| 10 | Captcha | Ativar Turnstile no cadastro/interesse? | Desligado; rate limit ativo |
| 11 | Termos | Texto de termos de uso e política de privacidade | Placeholders versionados |
| 12 | Financeiro | Formato de importação (planilha do Granatum?) | Cadastro manual controlado primeiro |
| 13 | Hospedagem | Região da Vercel/Supabase | `gru1` / `sa-east-1` (São Paulo) |
