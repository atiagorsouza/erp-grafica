/**
 * Identidade da empresa emitente, como as telas de impressão a consomem.
 *
 * Por que este arquivo existe: o mesmo tipo estava declarado três vezes
 * — em `PosClient.tsx`, `OrdersClient.tsx` e `QuotesClient.tsx`. Quando a
 * v3.23.0 acrescentou a inscrição estadual, ela foi parar em apenas uma
 * das cópias, e a IE aparecia no cupom do PDV mas sumia na OS. Só o
 * typecheck flagrou. Uma declaração única evita a próxima ocorrência.
 *
 * Não é o mesmo que `PricingDefaults` (`lib/settings.ts`): lá ficam
 * dezenas de chaves de configuração, aqui só o que um documento impresso
 * precisa mostrar sobre o emitente.
 */

export type CompanyIdentity = {
  /** nome fantasia — o que o cliente reconhece */
  name: string;
  /** razão social, para documentos formais */
  legalName: string;
  /** CNPJ já formatado */
  document: string;
  email: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  /** endereço em uma linha, montado a partir dos campos estruturados */
  address: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  website: string;
  pixKey: string;
  /** rodapé configurável do cupom (só o PDV usa) */
  receiptFooter?: string;
  /** inscrição estadual do emitente (v3.23.0) */
  stateRegistration?: string;
};

/**
 * Alias histórico. O nome "PosCompany" nasceu no PDV e vazou para
 * Pedidos e Orçamentos, que não são ponto de venda. Mantido para não
 * quebrar imports existentes.
 */
export type PosCompany = CompanyIdentity;
