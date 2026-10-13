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
