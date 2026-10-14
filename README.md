# OUZ Experience

Aplicativo de relacionamento da OUZ com futuros clientes, clientes e corretores.
Projeto independente (não inclui o OUZ Gestão).

Documentação:
- [Arquitetura](docs/01-arquitetura.md)
- [Fluxos e modelo de dados](docs/02-fluxos-e-modelo-de-dados.md)
- [Premissas e decisões pendentes](docs/03-premissas-e-pendencias.md)
- [Backlog](docs/04-backlog.md)
- [Configuração dos ambientes](docs/05-configuracao.md)

Banco: `supabase/migrations` (RLS em todas as tabelas) e `supabase/seed.sql` (dados demonstrativos, só desenvolvimento).

## Primeiro administrador
Após criar a conta e verificar o e-mail, execute no SQL Editor do Supabase (service role):

    select public.bootstrap_first_admin('email@ouz.com.br');

Os demais operadores/administradores entram apenas por convite.

## Publicação
- Cada envio para `main` no GitHub publica automaticamente na Vercel (projeto `ouz-experience`, equipe OUZ Experience).
- Hoje `ouz.app.br` é **homologação** (banco de desenvolvimento, e-mails em modo de teste, fora do Google).
- Antes da produção: Supabase de produção em São Paulo, plano Pro da Vercel e liberação de e-mails (ver `docs/05-configuracao.md`).
