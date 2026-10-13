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
| 20 | Testes E2E (Playwright) contra o Supabase de desenvolvimento | ⬜ (depende do projeto Supabase) |
| 19 | PWA (manifest, ícone provisório; service worker offline fica para depois) | ✅ |

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
Linha do tempo e atualizações · evolução física · comunicados · previsões com histórico · personalização · vistoria · pendências · chaves · manuais · documentos versionados · financeiro (manual + importação validada) · comprovantes sem baixa automática · esclarecimentos · chamados · eventos com capacidade/lista de espera/lembretes · central de notificações.

## Etapa 4 — Concierge
Catálogo por empreendimento · prestadores · solicitações · orçamento e taxa OUZ · aprovação do cliente · agendamento · execução · conclusão e avaliação · cancelamentos e ocorrências.
