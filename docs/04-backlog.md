# Backlog priorizado

Legenda: ✅ feito · 🔨 em andamento · ⬜ a fazer

## Etapa 1 — Fundação
| P | Item | Status |
|---|---|---|
| 1 | Inspeção do ambiente, arquitetura, fluxos, modelo de dados, premissas | ✅ |
| 2 | Esquema SQL da fundação com RLS (perfis, staff, corretores, empreendimentos, clientes, auditoria, outbox, consentimentos) | ✅ |
| 3 | Políticas de Storage (buckets privados) | ✅ |
| 4 | Seed demonstrativo identificado (SOHO, MAUI, UMAN) | ✅ |
| 5 | Projeto Next.js + TypeScript + Tailwind + lint + testes | ✅ |
| 6 | Design system: tokens, tipografia, botões, campos, cartões, estados (carregando/vazio/erro/sucesso/restrito) | ✅ |
| 7 | Autenticação: cadastro, verificação de e-mail, login, recuperação, MFA TOTP p/ staff | ✅ |
| 8 | Guardas no servidor (`requireStaff(perm)`, `requireBroker`, `requireClient`) + seletor de contexto | ✅ |
| 9 | Área pública: home, OUZ, empreendimentos, diferenciais, novidades, eventos, interesse | ✅ |
| 10 | Cadastro de corretor (validações CPF/CNPJ/CRECI, documentos, aceite) | ✅ |
| 11 | Admin: convites de staff, permissões, análise de corretores com histórico | ✅ |
| 12 | Admin: empreendimentos, conteúdo público, teaser, conteúdo restrito, modos de acesso | ✅ |
| 13 | Admin: grupos de corretores e concessões por empreendimento | ✅ |
| 14 | Admin: clientes, unidades, vínculo e convite | ✅ |
| 15 | Portal do corretor: status, empreendimentos (completo × teaser) | ✅ |
| 16 | Portal do cliente: minhas unidades (básico) | ✅ |
| 17 | Outbox de notificações + provedor `log`/Resend + cron | ✅ |
| 18 | Testes: isolamento de clientes, UMAN restrito, bloqueio de cadastro administrativo (banco/RLS) | ✅ |
| 20 | Testes E2E (Playwright) contra o Supabase de desenvolvimento: público (desktop e celular), corretor, cliente, admin com MFA, acessibilidade WCAG AA (axe) | ✅ |
| 19 | PWA: manifesto com atalhos, ícones oficiais (Android, iPhone, maskable), service worker sem dados privados, página sem conexão, aviso de queda de rede, convite para instalar, áreas seguras do iPhone | ✅ |

## Etapa 2 — Comercial
| Item | Status |
|---|---|
| Validação de CPF/CNPJ e hash de documento no banco (anti-fraude de duplicidade) | ✅ |
| Configuração comercial por empreendimento (modo de venda, prazos, previsão de chaves, exibição da posição) | ✅ |
| Tabelas de preço versionadas e imutáveis após publicação (com importação colada de planilha) | ✅ |
| Políticas de venda versionadas por empreendimento/tipologia/unidade | ✅ |
| Propostas com snapshot, avaliação automática, análise e decisão da OUZ | ✅ |
| Fila por unidade com lock, prioridade manual auditada e reavaliação na promoção | ✅ |
| Reserva com prazo configurável (48 h), checklist PF/PJ, envio, conferência, pendências, prorrogação, cancelamento, venda | ✅ |
| Rotina de prazos no pg_cron (a cada minuto) | ✅ |
| Pré-lançamento: campanhas, registros, duplicidade, ondas, janelas e propostas | ✅ |
| Testes: 48 h, documentação no prazo, expiração e avanço, versões, duplicidade, notificações, pré-lançamento | ✅ |
| Teste de concorrência real (duas propostas simultâneas no Supabase) — `scripts/testar-concorrencia.mjs` | ✅ |

## Etapa 3 — Experiência do cliente
| Item | Status |
|---|---|
| Linha do tempo com previsões e histórico de alterações (motivo obrigatório) | ✅ |
| Atualizações com fotos, vídeos (arquivo ou link) e texto; evolução física por etapa; comunicados por empreendimento ou unidade | ✅ |
| Personalização: solicitação, orçamento da OUZ, aprovação do cliente | ✅ |
| Agenda de vistoria e entrega de chaves (um horário por unidade, reagendamento), pendências com aceite/contestação, registro de entrega | ✅ |
| Documentos privados com versões imutáveis, autor e controle arquivo a arquivo; manuais do empreendimento | ✅ |
| Financeiro: contratado, pago, a pagar, vencidas, a vencer, histórico, demonstrativo, última atualização; original/atualização/juros/multa/atualizado separados | ✅ |
| Comprovante sem baixa automática; baixa só por validação autorizada (auditada) | ✅ |
| Lançamento manual e importação CSV validada (tudo ou nada) | ✅ |
| Pedido de esclarecimento financeiro | ✅ |
| Chamados: categorias, anexos, mensagens, nota interna, responsável, prioridade, agendamento, prazo, avaliação de garantia manual (oculta ao cliente), nota do atendimento | ✅ |
| Eventos: públicos (geral, clientes, corretores/grupo, empreendimento, convidados), presença, capacidade, lista de espera com promoção, lembretes automáticos, participantes sigilosos | ✅ |
| Central de notificações (aplicativo) e e-mails sem duplicidade | ✅ |
| Testes: isolamento entre clientes e perfis, documentos ocultos, baixa, importação, chamados, eventos | ✅ |

## Migração da base ativa
| Item | Status |
|---|---|
| Financeiro corrigido pelo CUB-SC: CUB mensal, CUB-base, CUBs por parcela, estimativa visível ao cliente, parcela das chaves sem data | ✅ |
| Importação da planilha "Fluxo de Pagamentos Clientes" (simulação + gravação tudo ou nada, conferência com os totais da planilha) | ✅ |
| Importação do MAUI (13 clientes) — conferida com os ajustes da OUZ (`importacao/maui-ajustes.json`); gravação em produção só após o plano Pro | ⬜ |
| Unidades oficiais: SOHO 12 aptos + 4 lojas (101 à venda), MAUI 26 aptos (101, 108, 109, 111, 113 à venda) — `supabase/seed-unidades-oficiais.sql` | ✅ (dev; produção na virada) |
| Tabela de vendas Out/2026 do MAUI (101, 108, 109, 111, 113) e SOHO 101 (R$ 5.550.000, 210,82 m², 4 suítes, 3 vagas) como rascunho; vagas por unidade; edição dos dados da unidade | ✅ (dev; publicar após revisão) |
| Proprietários do SOHO e do MAUI fora da planilha (7 investidores + Apto 205) | ⬜ (aguardando lista) |
| Corretores ativos: modelo de planilha (`scripts/gerar-modelo-corretores.mjs`) | ✅ |
| Corretores ativos: importação com convite e pré-aprovação | ⬜ (aguardando planilha preenchida) |
| Convites aos clientes em lotes, quando a OUZ decidir | ⬜ |

## Etapa 4 — Concierge
| Item | Status |
|---|---|
| Catálogo administrável por empreendimento (flores, passeio com cachorro, compras, limpeza, lavanderia, manutenção, recebimento de entregas, outros) | ✅ |
| Prestadores (internos, ocultos ao cliente), com categorias atendidas | ✅ |
| Solicitação → análise → orçamento com valor do serviço e taxa OUZ → aprovação do cliente → agendamento → execução → conclusão → avaliação | ✅ |
| Nada automático: sem contratação, cobrança ou confirmação pelo sistema; agendamento exige aprovação (salvo serviço sem orçamento) | ✅ |
| Cancelamentos (cliente e OUZ, com motivo), ocorrências internas ou visíveis, orçamento com validade | ✅ |
| Separado da assistência técnica (chamados) | ✅ |
| Testes: fluxo completo, isolamento, prestador oculto, orçamento vencido | ✅ |
