export const STAFF_PERMISSIONS = [
  "atendimento",
  "clientes",
  "corretores",
  "comercial",
  "politicas",
  "documentos",
  "financeiro",
  "conteudo",
  "eventos",
  "concierge",
  "notificacoes",
  "auditoria",
  "administracao",
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<StaffPermission, { label: string; description: string }> = {
  atendimento: { label: "Atendimento", description: "Chamados e contato com clientes. Não inclui financeiro nem documentos pessoais." },
  clientes: { label: "Clientes", description: "Cadastro de clientes, documentos de identificação e vínculo com unidades." },
  corretores: { label: "Corretores", description: "Análise de cadastros, aprovação, suspensão e revogação." },
  comercial: { label: "Comercial", description: "Unidades, acesso por empreendimento, propostas, reservas e filas." },
  politicas: { label: "Tabelas e políticas", description: "Tabelas de preço e políticas de venda." },
  documentos: { label: "Documentos", description: "Contratos e documentos privados de clientes e reservas." },
  financeiro: { label: "Financeiro do cliente", description: "Parcelas, pagamentos e comprovantes de clientes." },
  conteudo: { label: "Conteúdo", description: "Área pública, empreendimentos, teasers e atualizações." },
  eventos: { label: "Eventos", description: "Agenda, convidados e presença." },
  concierge: { label: "Concierge", description: "Catálogo, prestadores e solicitações." },
  notificacoes: { label: "Notificações", description: "Fila de envio e reprocessamento." },
  auditoria: { label: "Auditoria", description: "Consulta ao registro de auditoria." },
  administracao: { label: "Administração", description: "Convites de equipe e permissões." },
};

export type StaffRole = "operador" | "administrador";
export type BrokerStatus = "pendente" | "ajustes_solicitados" | "aprovado" | "recusado" | "suspenso" | "revogado";

export const BROKER_STATUS_LABELS: Record<BrokerStatus, string> = {
  pendente: "Em análise",
  ajustes_solicitados: "Ajustes solicitados",
  aprovado: "Aprovado",
  recusado: "Não aprovado",
  suspenso: "Suspenso",
  revogado: "Revogado",
};
