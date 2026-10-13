export type DevelopmentStage = "pre_lancamento" | "lancamento" | "em_obra" | "em_entrega" | "entregue";
export const STAGE_LABELS: Record<DevelopmentStage, string> = {
  pre_lancamento: "Pré-lançamento",
  lancamento: "Lançamento",
  em_obra: "Em obra",
  em_entrega: "Em fase de entrega",
  entregue: "Entregue",
};

export type BrokerAccessMode = "aberto" | "restrito" | "teaser" | "oculto";
export const ACCESS_MODE_LABELS: Record<BrokerAccessMode, { label: string; description: string }> = {
  aberto: { label: "Aberto", description: "Todos os corretores aprovados veem o conteúdo completo." },
  restrito: { label: "Restrito", description: "Só corretores ou grupos autorizados; os demais veem o teaser." },
  teaser: { label: "Somente teaser", description: "Todos os aprovados veem apenas o teaser “Em breve”." },
  oculto: { label: "Oculto", description: "Não aparece no portal do corretor." },
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  vendida: "Vendida",
  bloqueada: "Bloqueada",
  indisponivel: "Indisponível",
};

export const CLIENT_RELATION_LABELS: Record<string, string> = {
  titular: "Titular",
  cotitular: "Cotitular",
  procurador: "Procurador",
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_analise: "Em análise pela OUZ",
  na_fila: "Na fila da unidade",
  reservada: "Com reserva",
  reprovada: "Não aprovada",
  retirada: "Retirada",
  expirada: "Expirada",
  substituida: "Substituída",
  concluida: "Venda concluída",
};
export const PROPOSAL_STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "accent"> = {
  rascunho: "neutral",
  em_analise: "warning",
  na_fila: "info",
  reservada: "success",
  reprovada: "danger",
  retirada: "neutral",
  expirada: "danger",
  substituida: "neutral",
  concluida: "accent",
};

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  aguardando_documentos: "Aguardando documentos",
  documentacao_enviada: "Documentação completa enviada",
  aguardando_conferencia: "Aguardando conferência",
  documentacao_validada: "Documentação validada",
  pendencias_documentacao: "Pendências de documentação",
  expirada: "Expirada",
  cancelada: "Cancelada",
  convertida: "Venda concluída",
};
export const ACTIVE_RESERVATION_STATUSES = [
  "aguardando_documentos",
  "documentacao_enviada",
  "aguardando_conferencia",
  "documentacao_validada",
  "pendencias_documentacao",
] as const;

export const ITEM_STATUS_LABELS: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", aprovado: "Aprovado", recusado: "Recusado" };

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  entrada: "Entrada",
  parcela: "Parcelas",
  reforco: "Reforços",
  chaves: "Saldo nas chaves",
  permuta: "Permuta",
};

export const SALES_MODE_LABELS: Record<string, { label: string; description: string }> = {
  fechado: { label: "Fechado", description: "Não recebe propostas." },
  pre_lancamento: { label: "Pré-lançamento", description: "Registro de interesse; propostas só nas janelas liberadas por onda." },
  aberto: { label: "Aberto", description: "Corretores autorizados enviam propostas." },
};

export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  registrado: "Registrado",
  em_analise_duplicidade: "Em análise pela OUZ",
  em_onda: "Selecionado para onda",
  convidado: "Janela de proposta aberta",
  proposta_enviada: "Proposta enviada",
  janela_encerrada: "Janela encerrada",
  cancelado: "Cancelado",
};

export const ANALYSIS_REASON_LABELS: Record<string, string> = {
  fora_da_politica: "Fora da política",
  duplicidade_cliente: "Cliente com outra proposta ativa (verificação)",
  reavaliacao_fila: "Reavaliada na fila",
};
