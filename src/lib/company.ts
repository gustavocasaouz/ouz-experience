/**
 * Dados da empresa usados na política de privacidade, nos termos de uso e na página de suporte.
 * Campo vazio: a página mostra "a preencher" e o aviso de texto em revisão.
 */
export const COMPANY = {
  /** Razão social da controladora dos dados (quem decide sobre o tratamento). */
  legalName: "OUZ Administradora e Construção LTDA",
  cnpj: "31.347.931/0001-94",
  address: "Rod. José Carlos Daux, 5500, sala 210, Torre Lagoa B, Saco Grande, Florianópolis/SC, CEP 88032-005",
  /** Canal do titular e do encarregado (LGPD, art. 41). */
  privacyEmail: "contato@ouzgroup.com.br",
  /** Encarregado pelo tratamento de dados pessoais (DPO): nome ou "Equipe de privacidade OUZ". */
  dpoName: "Equipe de Privacidade OUZ",
  /** Atendimento geral (suporte do app). */
  supportEmail: "contato@ouzgroup.com.br",
  /** Celular com DDD, só dígitos (vira link de ligação e de WhatsApp). */
  supportPhone: "48991682087",
  /** Comarca de eleição para quem não é consumidor (ex.: corretores). */
  forum: "Florianópolis/SC",
  /** Data da versão vigente dos textos legais, AAAA-MM-DD. */
  legalUpdatedOn: "2026-11-03",
};

/** Todos os campos dos textos legais preenchidos (sem isso, as páginas avisam que estão em revisão). */
export const legalComplete = [COMPANY.legalName, COMPANY.cnpj, COMPANY.address, COMPANY.privacyEmail, COMPANY.dpoName, COMPANY.forum, COMPANY.legalUpdatedOn]
  .every((v) => v.trim() !== "");
