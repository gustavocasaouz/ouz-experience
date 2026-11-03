-- OUZ Experience — categoria de chamado "Solicitação geral" (03/11/2026).
-- Em arquivo próprio: um valor novo de enum só pode ser usado depois que a transação que o criou termina.

alter type public.ticket_category add value if not exists 'solicitacao_geral' before 'concierge';
