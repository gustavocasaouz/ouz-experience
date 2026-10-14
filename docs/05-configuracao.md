# Configuração dos ambientes

Nada aqui foi criado automaticamente: as contas e projetos são da OUZ. Use **dois projetos Supabase** (desenvolvimento e produção) e nunca reutilize credenciais de outros projetos.

## 1. Supabase (fazer em cada projeto)

1. **Criar o projeto** na região `South America (São Paulo)` — obrigatório para produção (dados no Brasil e menor latência). A região não pode ser mudada depois. O projeto de desenvolvimento atual está em `us-east-2`, o que é aceitável só para desenvolvimento.
2. **Extensões** (Database › Extensions): habilitar `pg_cron`. (`pgcrypto` já vem habilitada.)
3. **Aplicar as migrações** de `supabase/migrations/`:
   - Desenvolvimento: `node --env-file=.env.local scripts/migrar.mjs` (usa `SUPABASE_DB_URL`, string de conexão *Session pooler*; registra o histórico em `supabase_migrations.schema_migrations`, compatível com a Supabase CLI). `--status` lista pendências.
   - Produção: somente com autorização explícita da OUZ, em janela combinada (`--confirmo-producao` com a URL de produção em um arquivo separado, ou `supabase db push`).
4. **Dados demonstrativos** (SOMENTE no projeto de desenvolvimento): executar `supabase/seed.sql`.
5. **Auth › Providers › Email**: manter "Confirm email" ligado. Senha mínima 10.
6. **Auth › Multi-Factor**: habilitar **TOTP**.
7. **Auth › URL Configuration**:
   - Site URL: a URL do ambiente (produção: `https://ouz.app.br`; desenvolvimento: `http://localhost:3000`).
   - Redirect URLs: `<site>/auth/confirm**`.
8. **Auth › Email Templates** (recomendado — o link funciona mesmo se aberto em outro aparelho):
   - *Confirm signup*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   - *Reset password*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
   - *Change email*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change`
9. **Auth › SMTP**: em produção, configurar o SMTP do Resend para os e-mails de autenticação. Em desenvolvimento, o SMTP padrão do Supabase (limitado) basta.
10. **Primeiro administrador**: criar a conta pelo site, confirmar o e-mail e executar no SQL Editor:
    ```sql
    select public.bootstrap_first_admin('email@ouz.com.br');
    ```
    Depois, entrar em `/admin`, configurar a verificação em duas etapas e convidar o restante da equipe por `/admin/equipe`.

## 2. Variáveis de ambiente

Ver `.env.example`. Em desenvolvimento, copie para `.env.local`.

| Variável | Onde obter | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › API | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | idem (publishable / anon) | pode ir ao navegador |
| `SUPABASE_SECRET_KEY` | idem (secret / service_role) | **somente servidor** |
| `CRON_SECRET` | gerar: `openssl rand -hex 32` | |
| `EMAIL_MODE` | `log` ou `resend` | e-mail real só com `resend` **e** `APP_ENV=production` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend, após verificar o domínio | |
| `APP_ENV` | `development` / `preview` / `production` | controla faixa de ambiente, e-mail e robots |

## 3. Vercel

1. Importar o repositório `ouz-experience` do GitHub.
2. Domains: adicionar `ouz.app.br` (e `www.ouz.app.br` redirecionando para ele) e apontar o DNS conforme a Vercel indicar.
3. Configurar as variáveis por ambiente: **Production** → Supabase de produção; **Preview** e **Development** → Supabase de desenvolvimento, `EMAIL_MODE=log`.
4. Plano **Pro** (uso comercial e cron a cada 10 min em `vercel.json`). No plano Hobby o cron precisa ser diário.
5. Região das funções: `gru1` (São Paulo), já definida em `vercel.json`.

## 4. Resend

Domínio decidido: **`ouz.app.br`** (o domínio institucional `ouzgroup.com.br` fica só com o site da OUZ).

1. Resend › Domains › Add domain: `ouz.app.br`, região São Paulo (`sa-east-1`) se disponível.
2. Criar no DNS de `ouz.app.br` os registros que o Resend mostrar (SPF/MX do subdomínio de envio, DKIM e, recomendado, DMARC).
3. Após verificado: `EMAIL_FROM=OUZ Experience <nao-responda@ouz.app.br>`.
4. Supabase › Authentication › SMTP: host `smtp.resend.com`, porta `465`, usuário `resend`, senha = uma API key do Resend, remetente `nao-responda@ouz.app.br`. Assim os e-mails de confirmação e recuperação também saem pelo domínio do app, para qualquer destinatário.

Nenhum e-mail transacional do app é enviado de verdade fora de produção (`EMAIL_MODE=log`).

## 5. Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # regras de domínio + testes de banco (PGlite, sem Docker)
npm run typecheck && npm run lint && npm run build
```

## 6. Contas de teste (somente desenvolvimento)

```bash
node --env-file=.env.local scripts/criar-contas-teste.mjs   # cria/atualiza 5 contas fictícias (inclui equipe com MFA); senhas em contas-teste.local.txt (fora do Git)
node --env-file=.env.local scripts/testar-acessos.mjs       # entra com cada conta e confere o isolamento no Supabase real
node --env-file=.env.local scripts/verificar-supabase.mjs   # confere conexão, bloqueios do visitante e buckets
node --env-file=.env.local scripts/testar-concorrencia.mjs  # duas propostas simultâneas na mesma unidade: só uma reserva
node --env-file=.env.local scripts/aplicar-seed.mjs supabase/seed-etapa3.sql  # dados demonstrativos da Etapa 3 (idempotente)
node --env-file=.env.local scripts/aplicar-seed.mjs supabase/seed-etapa4.sql  # catálogo de concierge demonstrativo (idempotente)
```

O script de criação recusa rodar se `APP_ENV` não for `development`, devolve as contas ao estado-base (desfaz aprovações e concessões feitas manualmente) e gera senhas novas a cada execução.

### Testes no navegador (Playwright)

```bash
npx playwright install chromium   # uma vez
npm run test:e2e                  # sobe o `npm run dev` se necessário e roda tudo no Chromium (desktop e celular)
npx playwright show-report e2e-report
```

Cobrem: área pública (desktop e celular), bloqueio de áreas restritas, portal do corretor, portal do cliente (unidade, acompanhamento, financeiro), administração com MFA e verificação automática de acessibilidade WCAG AA (axe). Usam somente as contas de teste e o banco de desenvolvimento; antes de rodar, execute `criar-contas-teste.mjs`. Nenhum e-mail real é enviado (`EMAIL_MODE=log`).

## 6.1 Importação da base ativa (planilha "Fluxo de Pagamentos Clientes")

Uma vez por empreendimento. Cria unidades (vendidas), clientes, vínculos, contratos corrigidos pelo CUB-SC, parcelas (pagas até a fórmula "Total já pago") e o histórico do CUB. **Não** envia convites e **não** guarda CPF/CNPJ nem endereço.

```bash
node --env-file=.env.local scripts/importar-fluxo-cub.mjs "arquivo.xlsx" --empreendimento maui           # simulação: confere tudo e desfaz
node --env-file=.env.local scripts/importar-fluxo-cub.mjs "arquivo.xlsx" --empreendimento maui --gravar  # grava (tudo ou nada)
```

- Correções informadas pela OUZ que não estão na planilha (e-mail, valor de parcela, parcela das chaves, parcela não paga, valor pago a mais, dia de vencimento) vão num arquivo de ajustes, passado com `--ajustes importacao/<empreendimento>-ajustes.json`. A pasta `importacao/` fica fora do Git (contém dados de clientes). Cada ajuste precisa encontrar o que corrigir; senão, a importação é recusada.
- Se o "Total já pago" da planilha estiver desatualizado, use `"padrao": { "pagas_ate": "AAAA-MM-DD" }` (parcelas vencidas até a data entram como pagas, pelo CUB do mês) e liste as exceções em `nao_pagas` da unidade.
- Encargos de atraso dos contratos importados vêm do arquivo de ajustes: `"encargos_atraso": { "juros_ao_mes": 1, "multa": 2 }`. A simulação lista as parcelas vencidas em aberto com juros e multa do dia — confira antes de gravar.
- A simulação mostra, por apartamento, parcelas, pagas, contrato, total pago e saldo calculado × saldo da planilha, além de avisos (diferenças) e erros (ex.: e-mail inválido). Com erro, nada é gravado.
- Em produção exige `--confirmo-producao`, e só depois do plano Pro do Supabase (backup).
- A planilha real nunca entra no projeto: `*.xlsx` está no `.gitignore`.
- Depois da importação, o CUB do mês é cadastrado em **Administração → Financeiro → CUB-SC mensal**, e as baixas na ficha da unidade.

## 7. Produção (estado em 14/10/2026)

- Supabase **OUZ Experience Produção** criado em São Paulo; 23 migrações aplicadas; `seed-producao.sql` + `seed-conteudo-oficial.sql` (sem dados demonstrativos); vendas fechadas.
- Credenciais só em `.env.producao.local` (fora do Git). Migrações em produção: `node --env-file=.env.producao.local scripts/migrar.mjs --confirmo-producao` — **somente com autorização da OUZ**.
- `ouz.app.br` continua apontando para a homologação até a virada.

### Checklist da virada para produção
1. Supabase produção › Authentication: Confirm email ligado; Multi-Factor TOTP ligado; Site URL `https://ouz.app.br`; Redirect URLs `https://ouz.app.br/auth/confirm**`; templates de e-mail com `token_hash` (seção 1); SMTP do Resend.
2. Plano Pro na Vercel e no Supabase.
3. Vercel › variáveis de Production trocadas para as do Supabase de produção; `APP_ENV=production`; `EMAIL_MODE=resend`; novo `CRON_SECRET`.
4. Primeiro administrador: criar a conta em ouz.app.br, confirmar o e-mail e executar `bootstrap_first_admin` no banco de produção.
5. OUZ cadastra unidades, tabela, política, checklist e abre as vendas na administração.
6. Homologação passa a usar um endereço próprio (ex.: `homologacao.ouz.app.br`) com o Supabase de desenvolvimento.
