# OUZ Experience — Arquitetura

> Documento vivo. Escopo: **somente o OUZ Experience**. O OUZ Gestão é outro projeto,
> em outro repositório, com banco próprio ou não — decisão futura (ver `03-premissas-e-pendencias.md`).

## 1. Visão geral

```
┌──────────────────────────── Vercel ────────────────────────────┐
│  Next.js (App Router, TypeScript, React Server Components)      │
│                                                                 │
│  (public)   /            área pública (SSG/ISR, só dados públicos)
│  /entrar    auth: login, cadastro, verificação, recuperação, MFA│
│  /cliente   portal do cliente      ┐                            │
│  /corretor  portal do corretor     ├ Server Components + Server │
│  /admin     administração          ┘ Actions (autorização aqui) │
│  /api/cron  rotinas agendadas (protegidas por CRON_SECRET)      │
│  /api/webhooks (futuro: OUZ Gestão, assinatura eletrônica)      │
└───────────────┬─────────────────────────────────────────────────┘
                │ supabase-js (sessão do usuário → RLS)
                │ service role SOMENTE em módulos server-only específicos
┌───────────────▼──────────── Supabase ───────────────────────────┐
│ Postgres  · RLS em todas as tabelas expostas                    │
│           · funções transacionais (reserva, fila, aprovação)    │
│           · pg_cron: expiração de reservas e avanço da fila     │
│ Auth      · e-mail + senha, verificação, recuperação, TOTP MFA  │
│ Storage   · buckets privados + URLs assinadas de curta duração  │
└───────────────┬─────────────────────────────────────────────────┘
                │ outbox de notificações (dedupe_key único)
┌───────────────▼───────┐
│ Resend (e-mail)       │  EMAIL_MODE=log em dev/teste: nada é enviado
└───────────────────────┘
```

## 2. Stack e versões

| Item | Escolha | Observação |
|---|---|---|
| Runtime | Node.js 22 LTS | Suportado por Next 15/16 e pela Vercel |
| Framework | Next.js 16 (App Router) | React 19. Versão exata travada no `package-lock.json` no primeiro `npm install`, após `npm view` |
| Linguagem | TypeScript strict | |
| Supabase | `@supabase/supabase-js` 2.x + `@supabase/ssr` | cookies via `@supabase/ssr` (padrão atual para App Router) |
| Validação | Zod | mesmos esquemas no cliente e no servidor |
| E-mail | `resend` SDK + React Email (opcional) | envio só pelo worker de outbox |
| Estilo | Tailwind CSS 4 + tokens CSS | design system em `src/design-system` |
| Testes | Vitest (unidade/regras), PGlite ou Postgres do Supabase para testes de SQL/RLS, Playwright (E2E) | |
| PWA | `manifest.webmanifest` + service worker mínimo | sem cache de dados privados |

A compatibilidade exata será conferida com `npm view <pacote> peerDependencies` no momento da instalação; nada de `latest` solto no `package.json`.

## 3. Princípios

1. **Autorização em três camadas**: Server Action / Route Handler verifica o perfil → RLS no Postgres → políticas do Storage. Esconder botão é apenas UX.
2. **Dado público e dado restrito vivem em tabelas diferentes.** A página pública e o teaser só leem tabelas públicas; o navegador de quem não tem acesso nunca recebe preço, planta, tabela ou arquivo restrito.
3. **Regras de negócio críticas no banco** (reserva, fila, prazo de 48 h, aprovação automática) em funções SQL transacionais com `SELECT … FOR UPDATE` e índices únicos parciais. O Next chama essas funções; não reimplementa a regra.
4. **Idempotência**: toda ação que cria algo relevante aceita `idempotency_key`; notificações usam `dedupe_key` único.
5. **UTC no banco** (`timestamptz`), exibição em `America/Sao_Paulo`, formatação `pt-BR`, moeda `BRL`, valores em `numeric(14,2)`.
6. **Origem do dado**: tabelas de negócio têm `data_source` (`experience`, `importacao`, `ouz_gestao`, `granatum`, …) e `external_ref` para integração futura.
7. **Sem segredos no código.** `.env.example` documenta; valores reais só na Vercel/Supabase da OUZ.
8. **Dados fictícios** só com `is_demo = true` e somente pelo `supabase/seed.sql` em ambiente de desenvolvimento.

## 4. Estrutura de pastas

```
src/
  app/
    (public)/              home, empreendimentos, novidades, eventos, interesse
    entrar/                login, cadastro, recuperar, mfa, convite/[token]
    cliente/               portal do cliente (layout exige contexto cliente)
    corretor/              portal do corretor (layout exige corretor; aprovado p/ conteúdo)
    admin/                 administração (layout exige staff + aal2)
    api/cron/              rotinas agendadas (fallback do pg_cron / processamento da outbox)
  design-system/           tokens, componentes base, estados (loading/vazio/erro/sucesso/restrito)
  domain/                  regras puras e testáveis (CPF/CNPJ/CRECI, políticas, formatação)
  server/
    auth/                  getSession, requireStaff(perm), requireBroker, requireClient
    db/                    clientes supabase (user / service-role server-only)
    actions/               server actions por módulo
    notifications/         outbox + provedores (log, resend)
    audit/                 registro de auditoria
  integrations/            pontos de integração futura (ouz-gestao, granatum, drive, trimble) — só interfaces
supabase/
  migrations/              SQL versionado
  seed.sql                 dados demonstrativos identificados (dev)
  tests/                   testes SQL de RLS e concorrência
docs/
```

## 5. Identidade, perfis e contextos

- `auth.users` (Supabase) → `profiles` (1:1, criado por trigger, **sem nenhum papel**).
- Papéis são derivados de tabelas específicas, nunca de metadados editáveis pelo usuário:
  - **Cliente**: existe `clients.user_id = auth.uid()` com vínculo ativo em `client_units`.
  - **Corretor pendente/aprovado**: `broker_profiles.status`.
  - **Operador/Administrador**: `staff_members` (só inserido por convite aceito ou por administrador; nenhuma policy permite INSERT pelo próprio usuário).
- Uma pessoa pode ter vários contextos; o seletor de contexto troca entre `/cliente` e `/corretor` (e `/admin` para staff). O contexto ativo é só navegação — a autorização é sempre recalculada.
- **MFA**: staff precisa de TOTP. As funções `has_staff_permission()` exigem `aal2` no JWT; o layout `/admin` redireciona para inscrição/desafio MFA.
- **Permissões granulares de staff** (`staff_permission`): `atendimento`, `clientes`, `corretores`, `comercial`, `politicas`, `documentos`, `financeiro`, `conteudo`, `eventos`, `concierge`, `notificacoes`, `auditoria`, `administracao`. Administrador tem todas; operador tem só as concedidas. Atendimento **não** implica financeiro, documentos pessoais ou políticas.

## 6. Arquivos (Storage)

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `public-media` | imagens da área pública e teasers | leitura pública; escrita staff `conteudo` |
| `broker-content` | plantas, materiais, tabelas | só via URL assinada gerada no servidor após checar acesso ao empreendimento |
| `broker-documents` | documentos do cadastro do corretor | dono + staff `corretores` |
| `client-documents` | contratos, aditivos, comprovantes, manuais | cliente vinculado à unidade + staff `documentos` |
| `proposal-documents` | documentação da reserva | corretor autor + staff `comercial` |
| `tickets` | anexos de chamados | partes do chamado + staff `atendimento` |

Caminhos começam com o ID da entidade dona (`{development_id}/…`, `{broker_user_id}/…`, `{unit_id}/…`) para que as policies de `storage.objects` façam a checagem. URLs assinadas expiram em 60–300 s. Versões: tabela de metadados (`documents` + `document_versions`) com autor e data; o arquivo físico nunca é sobrescrito.

## 7. Rotinas agendadas

| Rotina | Onde | Frequência |
|---|---|---|
| `process_reservation_deadlines()` — expira reservas sem documentação completa e promove o próximo da fila | `pg_cron` (primário) | 1 min |
| Processar outbox de notificações (e-mail) | Vercel Cron → `/api/cron/notifications` (com `CRON_SECRET`) | 1–5 min (plano Pro) |
| Lembretes de eventos | `pg_cron` gera itens na outbox | 15 min |
| Retenção (apaga/anonimiza conforme política) | `pg_cron` | diária |

O processamento independe de usuário conectado. Todas as rotinas são idempotentes e podem ser reexecutadas.

## 8. Notificações

`notification_outbox(dedupe_key UNIQUE, channel, template, payload, status, attempts, next_attempt_at, sent_at, provider_message_id)`.
- Quem gera evento insere com `ON CONFLICT (dedupe_key) DO NOTHING` (ex.: `reserva:{id}:criada:corretor`).
- O worker trava lotes com `FOR UPDATE SKIP LOCKED`, envia, marca `sent`. Falhas voltam com backoff; administrador pode reprocessar.
- Resend recebe `Idempotency-Key = dedupe_key`.
- `EMAIL_MODE=log` (padrão fora de produção): grava o e-mail renderizado no log da outbox, não envia.
- Notificação in-app (`notifications`) é gravada na mesma transação, também com dedupe.

## 9. Segurança e operação

- Rate limit por IP/usuário em cadastro, login, formulário de interesse, convite e upload (tabela `rate_limits` + função atômica; trocável por Upstash depois).
- Captcha: ponto de extensão (Turnstile) desativado por padrão — decisão pendente.
- Logs: nunca CPF completo, documento ou token. Auditoria grava IDs, ação e diferenças de campos não sensíveis; CPF aparece mascarado (`***.456.789-**`).
- Consentimentos versionados (`consents`): termos de uso, privacidade, comunicações.
- Retenção configurável por categoria (`retention_policies`).
- Ambientes: projetos Supabase separados para desenvolvimento e produção; Vercel Preview aponta para dev; `APP_ENV` controla seed, e-mail e banners de "ambiente demonstrativo".

## 10. Integração futura com o OUZ Gestão

Não construída agora. Preparado:
- `src/integrations/ouz-gestao/` com interface (`OuzGestaoClient`) e implementação nula.
- Colunas `data_source` / `external_ref` nas tabelas que poderão ser alimentadas pelo Gestão (unidades, financeiro do cliente, contratos, andamento de obra).
- Autenticação prevista: credencial de serviço (OAuth2 client credentials ou HMAC assinado) contra `/api/integrations/ouz-gestao/*`, com escopos e auditoria. **Não** se pressupõe banco compartilhado.
- Mesmos pontos para Granatum (financeiro), Trimble (obra) e Google Drive (documentos).
