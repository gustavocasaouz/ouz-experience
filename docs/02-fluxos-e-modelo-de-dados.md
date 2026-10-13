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

## 2. Fluxo comercial (Etapa 2 — implementado)

Fonte única das regras: funções SQL em `supabase/migrations/20261014000300_propostas_reservas_fila.sql`. As telas apenas chamam essas funções.

### 2.1 Proposta
Estados: `rascunho` → `em_analise` | `na_fila` | `reservada` → `reprovada` | `retirada` | `expirada` | `substituida` | `concluida`.

- Rascunhos podem ficar incompletos. Sem nome **e** CPF/CNPJ válido (dígitos conferidos no banco), o envio é recusado: a proposta não entra na fila.
- No envio a proposta é avaliada por `evaluate_terms` contra a **tabela vigente** e a **política vigente** (resolvida por empreendimento → tipologia → unidade). Ficam gravados: `price_table_id`, `table_price`, `sales_policy_id`, `policy_rules` (snapshot resolvido) e `evaluation` (critério a critério).
- Dentro da política → apta à aprovação automática: recebe reserva se a unidade estiver livre **e** sem fila; senão entra na fila.
- Fora da política → nada muda e o corretor vê os critérios não atendidos; ele pode reenviar pedindo análise (`em_analise`).
- A OUZ aprova (→ reserva ou fila) ou reprova, com justificativa. Aprovação comercial ≠ contrato.
- Critérios avaliados: estrutura (soma = valor ofertado, datas futuras), preço de tabela existente, preço mínimo, desconto máximo, entrada mínima, % até as chaves (exige previsão de chaves informada pela OUZ; sem ela o critério fica "não avaliável" e a proposta vai para análise), prazo máximo, nº máximo de parcelas e reforços, permuta (permitida/máxima) e condições que sempre exigem análise (permuta, PJ, todas).
- Permuta entra no total, mas não conta como pagamento "até as chaves".

### 2.2 Fila da unidade
- Ordem registrada no servidor: `queue_priority desc, queue_entered_at, queue_seq` (sequência do banco).
- Uma única reserva ativa por unidade: índice único parcial `reservations_one_active_per_unit` (última barreira) + lock da unidade (`SELECT … FOR UPDATE`) em toda função que cria/encerra reserva. Duas propostas simultâneas se serializam no lock: a segunda vê a reserva e entra na fila.
- Proposta na fila **não** tem prazo de 48 h.
- Sigilo: o corretor não vê quantas propostas há na fila nem a sua posição; vê apenas o próprio status. A unidade só aparece como “Reservada” aos corretores depois do envio da documentação completa da reserva (antes disso, “Disponível”). A OUZ vê a situação real em `admin_units_overview`.
- Prioridade manual: só `comercial`, com justificativa (≥ 5 caracteres) e auditoria.
- Promoção (`promote_next_in_queue`): ao encerrar uma reserva, percorre a fila em ordem e **reavalia** cada proposta com a tabela/política vigentes, o cadastro do corretor e a situação da unidade. A primeira elegível recebe a reserva com prazo novo; as inelegíveis vão para `em_analise` (motivo `reavaliacao_fila`) e saem da fila, com aviso ao corretor e à OUZ.
- Idempotência: rascunho com a mesma `idempotency_key` devolve a mesma proposta; reenviar uma proposta já enviada não altera nada.

### 2.3 Reserva e documentação
```
reserva criada (prazo = agora + reservation_hours, padrão 48 h)
  aguardando_documentos ──envio completo no prazo──▶ documentacao_enviada ──OUZ inicia──▶ aguardando_conferencia
        │ prazo vence                                     (não expira mais)                │
        ▼                                                                      ┌──────────┴──────────┐
     expirada → fila avança                                         documentacao_validada   pendencias_documentacao
                                                                         │ venda registrada        │ prazo = regularization_hours
                                                                         ▼                         │ reenvio completo → documentacao_enviada
                                                                     convertida (unidade vendida)  ▼ vence (se configurado) → expirada → fila avança
```
- Checklist PF/PJ configurável por empreendimento (ou global); é copiado para a reserva no momento em que ela nasce.
- Extensão de prazo: só `comercial`, motivo obrigatório, registro em `reservation_extensions` e auditoria.
- `regularization_expires = false` faz a pendência não expirar sozinha (a OUZ decide).
- Rotina `process_reservation_deadlines()` via **pg_cron a cada minuto**, com `FOR UPDATE SKIP LOCKED`, idempotente; também encerra janelas de pré-lançamento vencidas.

### 2.4 Casos tratados
| Caso | Regra implementada |
|---|---|
| Proposta sob análise | **Não ocupa posição na fila.** Entra na fila (ou recebe a reserva) no momento da aprovação da OUZ. Assim, nenhuma análise bloqueia a unidade. Se a OUZ quiser respeitar a ordem original, usa a prioridade manual (com justificativa). |
| Desistência | Corretor retira a proposta. Com reserva: a reserva é cancelada e a fila avança na mesma transação. Na fila: sai da fila. |
| Reprovação | `reprovada` com justificativa visível ao corretor; sai de qualquer fila. |
| Mudança de tabela | Propostas já enviadas mantêm o snapshot. Na promoção, quem está na fila é reavaliado na tabela nova; aprovações manuais da OUZ só continuam válidas se a tabela não mudou desde a aprovação. |
| Mesmo cliente por corretores diferentes | Detectado pelo hash do CPF/CNPJ calculado no banco. A nova proposta vai para análise (motivo "verificação de cadastro"), sem revelar ao corretor a existência ou os dados do outro. Mesmo corretor, mesmo cliente e mesma unidade com proposta ativa: envio recusado. |
| Alteração relevante após a fila | "Alterar condições" marca a proposta como `substituida` (sai da fila) e cria um rascunho novo; ao reenviar, entra no fim da fila. Observações podem mudar sem perder posição. |
| Venda concluída | `convertida`: unidade `vendida`, propostas restantes da fila encerradas com aviso. |

### 2.5 Pré-lançamento (UMAN)
- Modo de venda `pre_lancamento`: corretores registram interesse (cliente, CPF/CNPJ, preferências) — não é proposta nem reserva, não há cobrança nem promessa.
- Limite de registros por cliente (configurável) para o mesmo corretor; cliente já registrado por **outro** corretor → `em_analise_duplicidade` para a OUZ decidir.
- A OUZ cria ondas, inclui os próximos N registros (ordem: rank manual, depois cronológica) e abre a **janela**: preços e unidades passam a ser visíveis só para os corretores convidados, que podem enviar proposta para o **mesmo cliente** do registro, no fluxo normal (avaliação, fila, reserva).
- Janela vencida sem proposta → `janela_encerrada` (rotina agendada).

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
