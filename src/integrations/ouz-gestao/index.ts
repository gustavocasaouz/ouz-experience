/**
 * Ponto de integração futura com o OUZ Gestão (projeto separado).
 * NÃO implementado nesta fase. Nenhum banco compartilhado é pressuposto.
 *
 * Desenho previsto:
 * - Autenticação de serviço (OAuth2 client credentials ou HMAC assinado), com escopos e auditoria.
 * - O Gestão poderá publicar: unidades, andamento de obra, parcelas financeiras e contratos.
 * - Registros recebidos gravam data_source = 'ouz_gestao' e external_ref = ID no Gestão.
 * Os mesmos princípios valem para Granatum (financeiro), Trimble (obra) e Google Drive (documentos).
 */
export type ExternalSource = "ouz_gestao" | "granatum" | "trimble" | "google_drive";

export interface OuzGestaoClient {
  readonly enabled: boolean;
}

export const ouzGestao: OuzGestaoClient = { enabled: false };
