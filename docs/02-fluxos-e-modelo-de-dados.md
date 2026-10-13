# OUZ Experience — Fluxos e modelo de dados

Convenções: `uuid` como chave, `timestamptz` em UTC, valores `numeric(14,2)` em BRL,
`created_at/updated_at` em todas as tabelas, `is_demo` onde houver dado demonstrativo,
`data_source`/`external_ref` onde houver integração futura.

## 1. Fluxos de acesso

### 1.1 Cadastro público
```
visitante → /entrar/cadastro (nome, e-mail, senha, aceite) → e-mail de verificação
         → profile criado (sem papel) → pode: virar corretor (formulário) | aceitar convite de cliente
```
Nenhum caminho público cria `staff_members`. A tabela não tem policy de INSERT para `authenticated`.

### 1.2 Convite de operador/administrador
```
admin (perm administracao, aal2) → staff_invitations (e-mail, papel, permissões, token_hash, expira em 72 h)
→ e-mail com link /entrar/convite/{token}
→ usuário entra/cria conta com o MESMO e-mail verificado
→ função accept_staff_invitation(token) [security definer]: confere hash, validade, e-mail; cria staff_members + permissões; audita
→ obrigatório cadastrar TOTP antes de acessar /admin
```

### 1.3 Corretor
```
cadastro → broker_profiles(status = pendente) + documentos + consentimentos
pendente ──aprovar──▶ aprovado ──suspender──▶ suspenso ──reativar──▶ aprovado
   │  └─solicitar ajustes─▶ ajustes_solicitados ──reenviar──▶ pendente
   └──recusar──▶ recusado            aprovado/suspenso ──revogar──▶ revogado
```
Toda transição grava `broker_status_history` (de, para, motivo, autor) e auditoria.
Aprovar **não** libera empreendimentos: ver 1.4.

### 1.4 Acesso do corretor por empreendimento
`developments.broker_access_mode`:
| modo | corretor aprovado sem concessão | corretor aprovado com concessão (individual ou grupo) |
|---|---|---|
| `aberto` | conteúdo completo | conteúdo completo |
| `restrito` | **apenas teaser** | conteúdo completo |
| `teaser` | apenas teaser | apenas teaser |
| `oculto` | nada | nada |

Implementação: função `broker_can_access_development(dev_id)` usada nas policies de todas as tabelas restritas (`development_broker_content`, `units`, `price_tables`, `sales_policies`, materiais no Storage). O teaser é a tabela `development_teasers`, separada. Concessões em `development_broker_grants` (corretor **ou** grupo), com `revoked_at` e auditoria.

### 1.5 Cliente e unidade
```
staff (perm clientes) cadastra clients (nome, e-mail, CPF opcional) e client_units (unidade, papel)
→ client_invitations (token_hash, expira) → e-mail
→ pessoa entra com o e-mail convidado → accept_client_invitation(token) liga clients.user_id
```
CPF nunca é critério de acesso. Não existe busca por CPF exposta ao cliente.

## 2. Fluxo comercial (Etapa 2 — regras definidas agora)

### 2.1 Proposta
Estados: `rascunho` → `enviada` → (`apta_aprovacao_automatica` | `em_analise`) → `aprovada` | `reprovada` | `retirada` | `expirada` | `substituida`.

- Sem nome **e** CPF/CNPJ válido: só `rascunho`; não entra na fila.
- Ao enviar: grava snapshot imutável `price_table_version_id`, `sales_policy_version_id`, valores e resultado da avaliação (`policy_evaluation jsonb` com cada critério: atendido/não atendido).
- Dentro da política → apta à aprovação automática (sujeita à disponibilidade e à fila).
- Fora → lista os critérios não atendidos; corretor pode enviar para análise da OUZ.
- Aprovação comercial ≠ contrato.

### 2.2 Fila da unidade
- `unit_queue_entries(unit_id, proposal_id, position_seq bigserial, queued_at, status)`; ordem = `queued_at, position_seq` gravados pelo servidor.
- **Uma reserva ativa por unidade**: índice único parcial `reservations(unit_id) WHERE status IN ('aguardando_documentos','documentacao_enviada','aguardando_conferencia','pendencias_documentacao','documentacao_validada')`.
- Proposta na fila não tem prazo de 48 h.
- Mudança manual de prioridade: perm `comercial` + justificativa + auditoria.
- Promoção: quando a reserva termina (expirada, desistência, reprovação), `promote_next_in_queue(unit_id)` percorre a fila em ordem, **reavalia** cada proposta (tabela vigente, política, validade dos dados, cliente duplicado) e entrega a reserva à primeira elegível. Inelegíveis vão para `em_analise` ou saem da fila com motivo.
- Tudo em uma transação com `SELECT … FROM units WHERE id = $1 FOR UPDATE`. Duas propostas simultâneas: a segunda espera o lock, vê a reserva ativa e entra na fila. O índice único é a última barreira.
- Idempotência: `proposals.idempotency_key` único por corretor.

### 2.3 Reserva de 48 h e documentação
```
aprovada + unidade livre → reservations(status=aguardando_documentos, starts_at=now(), expires_at=now()+48h)
  → notifica corretor e OUZ (outbox, dedupe)
  → corretor envia itens do checklist (PF ou PJ, configurável)
  → todos os obrigatórios enviados antes de expires_at → documentacao_enviada → aguardando_conferencia
      (a partir daqui o prazo de 48 h NÃO se aplica: não expira por demora da OUZ)
  → OUZ confere → documentacao_validada | pendencias_documentacao
      pendencias: prazo de regularização configurável (regularization_hours por empreendimento; padrão sugerido 24 h — pendente de decisão)
  → prazo vencido em aguardando_documentos ou pendencias → expirada → promote_next_in_queue
```
- `expires_at` é calculado no servidor no momento da criação da reserva (não no da proposta, nem da fila).
- Extensão: perm `comercial`, motivo obrigatório, registra `reservation_extensions` + auditoria.
- `process_reservation_deadlines()` roda via pg_cron a cada minuto, com `FOR UPDATE SKIP LOCKED`, idempotente.

### 2.4 Casos tratados
| Caso | Regra |
|---|---|
| Proposta sob análise na frente da fila | Mantém posição por até `analysis_hold_hours` (configurável). A unidade fica livre para reserva? **Não**: a próxima só é promovida se a análise reprovar ou expirar. Para não bloquear indefinidamente, a análise tem prazo; ao vencer, volta para OUZ como alerta e a fila avança. |
| Desistência | Corretor retira; se tinha reserva → encerra e promove o próximo; se estava na fila → sai da fila. |
| Reprovação | Sai da fila com motivo; corretor vê só o próprio status. |
| Mudança de tabela | Propostas já aprovadas mantêm o snapshot. Propostas na fila são reavaliadas contra a tabela vigente na promoção; se não atenderem, vão para análise. |
| Mesmo cliente por corretores diferentes | Chave `client_document_hash` (hash do CPF/CNPJ normalizado). Ao enviar, se houver outra proposta ativa para o mesmo cliente/empreendimento por outro corretor → status `em_analise` com motivo `duplicidade_cliente`; nenhum corretor vê dados do outro. Regra de desempate: decisão da OUZ (primeiro envio válido é o padrão sugerido — pendente). |
| Alteração relevante após entrar na fila | Valor, condições, unidade ou cliente alterados → nova versão da proposta, sai da posição e reentra no fim da fila. Observações não alteram posição. |
| Proposta incompleta | Rascunho não entra na fila; reserva sem documentação expira; análise tem prazo. Nada bloqueia indefinidamente. |

### 2.5 Pré-lançamento (UMAN)
`prelaunch_campaigns` (aberta/encerrada, limite por cliente), `prelaunch_waves`, `prelaunch_registrations` (cliente, corretor, documento hash, preferências, criado em, status, critério de prioridade, histórico). Liberar preços para uma onda cria uma janela (`window_starts_at/ends_at`) em que as propostas daquela onda são aceitas no fluxo normal. Registro ≠ proposta ≠ reserva; nada é cobrado nem prometido.

## 3. Modelo de dados — Etapa 1 (implementado em `supabase/migrations`)

```
auth.users 1─1 profiles
profiles 1─1 staff_members ─< staff_permissions
staff_invitations
profiles 1─1 broker_profiles ─< broker_status_history
                          └─< broker_documents
broker_groups ─< broker_group_members >─ broker_profiles
developments ─1 development_public_content   (público)
            ─1 development_teasers            (público, separado)
            ─1 development_broker_content     (restrito)
            ─< development_broker_grants (corretor | grupo)
            ─< units
clients ─< client_units >─ units
clients ─< client_invitations
news_posts, public_events (público)
leads (formulário de interesse)
consents, audit_log, notifications, notification_outbox, rate_limits, retention_policies
```

## 4. Modelo de dados — Etapas 2 a 4 (planejado)

- **Comercial**: `price_tables`, `price_table_versions`, `price_table_items(unit_id, price)`, `sales_policies`, `sales_policy_versions(rules jsonb, scope: empreendimento|tipologia|unidade)`, `proposals`, `proposal_versions`, `proposal_payment_terms`, `unit_queue_entries`, `reservations`, `reservation_extensions`, `document_checklists`, `document_checklist_items`, `reservation_documents`, `prelaunch_*`.
- **Cliente**: `construction_timelines`, `construction_updates(+media)`, `progress_reports`, `announcements`, `forecast_changes`, `customization_requests`, `inspection_slots`, `inspection_bookings`, `punch_list_items`, `key_handovers`, `documents`, `document_versions`, `financial_contracts`, `financial_installments(original, atualização, juros, multa, atualizado, status, source, updated_at)`, `payment_receipts(status: enviado|validado|recusado)`, `financial_inquiries`, `tickets`, `ticket_messages`, `ticket_attachments`, `event_*`.
- **Concierge**: `concierge_services(development_id)`, `concierge_providers`, `concierge_requests` (estados: solicitada → em_analise → orcamento_enviado → aprovada_cliente → agendada → em_execucao → concluida | cancelada), `concierge_quotes(valor_servico, taxa_ouz)`, `concierge_occurrences`, `concierge_ratings`.
