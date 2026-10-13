# Configuração dos ambientes

Nada aqui foi criado automaticamente: as contas e projetos são da OUZ. Use **dois projetos Supabase** (desenvolvimento e produção) e nunca reutilize credenciais de outros projetos.

## 1. Supabase (fazer em cada projeto)

1. **Criar o projeto** na região `South America (São Paulo)`.
2. **Extensões** (Database › Extensions): habilitar `pg_cron`. (`pgcrypto` já vem habilitada.)
3. **Aplicar as migrações**, em ordem, de `supabase/migrations/` — pelo SQL Editor (colar e executar cada arquivo) ou pela CLI: `supabase link` + `supabase db push`.
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
| `DOCUMENT_HASH_PEPPER` | gerar: `openssl rand -hex 32` | diferente por ambiente; não trocar depois de ter dados |
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
