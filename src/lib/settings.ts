import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  isValidCNPJ,
  isValidCPF,
  onlyDigits,
} from "@/lib/validators";

export interface PricingDefaults {
  taxRate: number; // imposto sobre venda (fração 0-1)
  operationalRate: number; // custo operacional global para markup divisor (fração)
  cardFeeRate: number; // taxa maquininha débito (fração)
  cardFeeCreditRate: number; // taxa maquininha crédito (fração)
  company_name: string;
  company_legal_name: string;
  company_trade_name: string;
  company_document: string;
  company_email: string;
  company_phone: string;
  company_phone2: string;
  company_whatsapp: string;
  company_address: string;
  company_street: string;
  company_number: string;
  company_district: string;
  company_city: string;
  company_state: string;
  company_cep: string;
  company_website: string;
  pix_key: string;
  fiscal_environment: string;
  fiscal_tax_regime: string;
  /* PDV */
  pdv_seller_default: string;
  pdv_delivery_default: string;
  pdv_allow_negative_stock: boolean;
  pdv_require_customer: boolean;
  pdv_require_open_cash: boolean;
  pdv_receipt_footer: string;
  /* peso da fonte no cupom impresso (400–800): compensa cabeça térmica
     gasta ou bobina de baixa sensibilidade */
  pdv_receipt_boldness: number;
  /* Emitente — exigidos na NF-e (v3.21.0) */
  company_ie: string;
  company_im: string;
  company_tax_regime: string;
  company_cnae: string;
  company_city_code: string;
  company_complement: string;
  company_crt: string;
  /* Precificação (v3.27.0) */
  paymentCostRate: number;   // pior meio de pagamento aceito (fração)
  pixDiscountRate: number;   // desconto à vista (fração)
  installmentMin: number;    // valor mínimo para parcelar (R$)
  installmentMax: number;    // máximo de parcelas sem juros
  minMarginRate: number;     // piso de margem (fração)
  /** Valor da hora de mão de obra (R$). Multiplica `estimatedHours` do
   *  serviço e entra como custo. 0 = não cobra por hora (v3.46.0). */
  laborHourlyRate: number;
}

/**
 * Os campos `company_*` e `pix_key` nascem VAZIOS de propósito.
 *
 * Até a v3.17.0 eles vinham com os dados da VTDIGITAL fixos no código.
 * Consequência: campo apagado no Painel continuava sendo impresso em
 * cupom, orçamento e OS — o operador limpava e nada mudava — e uma
 * instalação em outra gráfica sairia com dados que não são dela.
 *
 * Campo vazio deve sumir do documento, nunca ser "completado" por um
 * exemplo. Os valores reais vêm do Painel de Controle → Identidade da
 * empresa (tabela `settings`).
 */
const DEFAULTS: PricingDefaults = {
  taxRate: 0.06,
  operationalRate: 0.15,
  cardFeeRate: 0.0199,
  cardFeeCreditRate: 0.0499,
  company_name: "",
  company_legal_name: "",
  company_trade_name: "",
  company_document: "",
  company_email: "",
  company_phone: "",
  company_phone2: "",
  company_whatsapp: "",
  company_address: "",
  company_street: "",
  company_number: "",
  company_district: "",
  company_city: "",
  company_state: "",
  company_cep: "",
  company_website: "",
  pix_key: "",
  fiscal_environment: "homologacao",
  fiscal_tax_regime: "simples",
  pdv_seller_default: "OPERADOR",
  pdv_delivery_default: "Retirada no balcão",
  pdv_allow_negative_stock: false,
  pdv_require_customer: false,
  pdv_require_open_cash: true,
  pdv_receipt_footer: "Agradecemos a preferência! Volte sempre.",
  pdv_receipt_boldness: 600,
  company_ie: "",
  company_im: "",
  company_tax_regime: "simples",
  company_cnae: "",
  company_city_code: "",
  company_complement: "",
  company_crt: "1",
  paymentCostRate: 0.0612,
  pixDiscountRate: 0.0612,
  installmentMin: 150,
  installmentMax: 3,
  minMarginRate: 0.4,
  laborHourlyRate: 0,
};

/**
 * Aplica máscara de CNPJ/CPF no documento da empresa.
 *
 * O Painel aceita o número digitado como vier; sem isto, um CNPJ salvo
 * como "07978674738" saía cru no cupom, orçamento e OS. Se a contagem
 * de dígitos não for de CPF (11) nem de CNPJ (14), devolve o texto
 * original — pode ser inscrição estrangeira ou algo em digitação.
 */
/* MÁSCARAS NA SAÍDA (v3.60.0)

   O banco guarda só dígitos; a máscara é aplicada aqui, na leitura.
   Antes só o CNPJ era formatado — telefone, CEP e IE saíam crus no
   cupom impresso: "2120383504" em vez de "(21) 2038-3504". Está na
   foto que o dono mandou em 20/08/2026.

   Aplicar na saída (e não ao gravar) tem duas vantagens: o dado no
   banco continua comparável (telefone × WhatsApp, busca por CNPJ) e
   cadastros antigos, salvos com pontuação, são normalizados na hora
   de exibir — sem precisar migrar nada. */
function mascarar(raw: string, fn: (v: string) => string): string {
  const v = String(raw || "").trim();
  return v ? fn(v) : v;
}

/* CPF/CNPJ só é mascarado se for VÁLIDO.

   Mascarar às cegas inventa documento: "3189224000154" (13 dígitos —
   o CNPJ da VTDIGITAL com o zero inicial perdido) virava
   "31.892.240/0015-4", que não existe e ainda por cima PARECE certo no
   cupom do cliente. Documento inválido sai como está, sem disfarce,
   para o erro ficar visível e ser corrigido no Painel. */
function mascararDocumento(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return v;
  const d = onlyDigits(v);
  if (d.length === 11 && isValidCPF(d)) return formatCPF(d);
  if (d.length === 14 && isValidCNPJ(d)) return formatCNPJ(d);
  /* 13 dígitos quase sempre é CNPJ que perdeu o zero à esquerda em
     algum campo numérico. Recuperamos e conferimos. */
  if (d.length === 13 && isValidCNPJ("0" + d)) return formatCNPJ("0" + d);
  return v;
}

let cache: PricingDefaults | null = null;

/**
 * Lê configurações do Painel de Controle com fallback para defaults.
 * Cache em memória por processo (invalidado via clearSettingsCache).
 */
export async function getPricingDefaults(): Promise<PricingDefaults> {
  if (cache) return cache;
  try {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const legalName = map.get("company_legal_name") || map.get("company_name") || DEFAULTS.company_legal_name;
    const tradeName = map.get("company_trade_name") || map.get("company_name") || legalName;
    const street = map.get("company_street") || DEFAULTS.company_street;
    const number = map.get("company_number") || "";
    const streetFull = [street, number].filter(Boolean).join(", ");
    const district = map.get("company_district") || DEFAULTS.company_district;
    const city = map.get("company_city") || DEFAULTS.company_city;
    const state = map.get("company_state") || DEFAULTS.company_state;
    const cep = map.get("company_cep") || DEFAULTS.company_cep;

    const structuredAddress = [
      streetFull,
      map.get("company_complement"),
      district,
      [city, state].filter(Boolean).join(" / "),
      /* O endereço de uma linha é montado ANTES do bloco que aplica as
         máscaras, e usava o CEP cru: saía "CEP 21860005" no cabeçalho
         do orçamento em A4 (foto do dono, 20/08/2026). */
      cep && `CEP ${formatCEP(cep)}`,
    ]
      .filter(Boolean)
      .join(" — ");

    cache = {
      taxRate: percentToRate(map.get("tax_rate"), DEFAULTS.taxRate),
      operationalRate: percentToRate(map.get("operational_rate"), DEFAULTS.operationalRate),
      cardFeeRate: percentToRate(map.get("card_fee_debit"), DEFAULTS.cardFeeRate),
      cardFeeCreditRate: percentToRate(map.get("card_fee_credit"), DEFAULTS.cardFeeCreditRate),
      company_name: tradeName,
      company_legal_name: legalName,
      company_trade_name: tradeName,
      company_document: mascararDocumento(
        map.get("company_cnpj") || map.get("company_document") || DEFAULTS.company_document
      ),
      company_email: map.get("company_email") || DEFAULTS.company_email,
      company_phone: mascarar(map.get("company_phone") || DEFAULTS.company_phone, formatPhone),
      company_phone2: mascarar(
        map.get("company_phone2") || map.get("company_whatsapp") || DEFAULTS.company_phone2,
        formatPhone
      ),
      company_whatsapp: mascarar(map.get("company_whatsapp") || DEFAULTS.company_whatsapp, formatPhone),
      company_address: structuredAddress || map.get("company_address") || DEFAULTS.company_address,
      company_street: streetFull,
      company_number: number,
      company_district: district,
      company_city: city,
      company_state: state,
      company_cep: mascarar(cep, formatCEP),
      company_website: map.get("company_website") || DEFAULTS.company_website,
      pix_key: map.get("pix_key") || DEFAULTS.pix_key,
      fiscal_environment: map.get("fiscal_environment") || DEFAULTS.fiscal_environment,
      fiscal_tax_regime: map.get("fiscal_tax_regime") || DEFAULTS.fiscal_tax_regime,
      pdv_seller_default: map.get("pdv_seller_default") || DEFAULTS.pdv_seller_default,
      pdv_delivery_default: map.get("pdv_delivery_default") || DEFAULTS.pdv_delivery_default,
      pdv_allow_negative_stock: isSettingEnabled(map.get("pdv_allow_negative_stock")),
      pdv_require_customer: isSettingEnabled(map.get("pdv_require_customer")),
      pdv_require_open_cash:
        map.get("pdv_require_open_cash") == null
          ? DEFAULTS.pdv_require_open_cash
          : isSettingEnabled(map.get("pdv_require_open_cash")),
      pdv_receipt_footer: map.get("pdv_receipt_footer") || DEFAULTS.pdv_receipt_footer,
      pdv_receipt_boldness: (() => {
        const raw = Number(map.get("pdv_receipt_boldness"));
        /* fora de 400–800 o navegador ignora o valor: melhor cair no padrão */
        return Number.isFinite(raw) && raw >= 400 && raw <= 800
          ? raw
          : DEFAULTS.pdv_receipt_boldness;
      })(),
      /* IE fica como foi digitada.

         `formatStateRegistration` descarta tudo que não é dígito — e há
         IE com letras (e o próprio "ISENTO"). Como o formato varia por
         estado e não existe máscara única, aqui o valor sai como está;
         a limpeza acontece só na tela, ao digitar. */
      company_ie: (map.get("company_ie") || DEFAULTS.company_ie).trim(),
      company_im: map.get("company_im") || DEFAULTS.company_im,
      company_tax_regime: map.get("company_tax_regime") || DEFAULTS.company_tax_regime,
      company_cnae: map.get("company_cnae") || DEFAULTS.company_cnae,
      company_city_code: map.get("company_city_code") || DEFAULTS.company_city_code,
      company_complement: map.get("company_complement") || DEFAULTS.company_complement,
      company_crt: map.get("company_crt") || DEFAULTS.company_crt,
      paymentCostRate: percentToRate(map.get("pricing_payment_cost"), DEFAULTS.paymentCostRate),
      pixDiscountRate: percentToRate(map.get("pricing_pix_discount"), DEFAULTS.pixDiscountRate),
      installmentMin: Number(map.get("pricing_installment_min")) || DEFAULTS.installmentMin,
      laborHourlyRate: Number(map.get("labor_hourly_rate")) || DEFAULTS.laborHourlyRate,
      installmentMax: Number(map.get("pricing_installment_max")) || DEFAULTS.installmentMax,
      minMarginRate: percentToRate(map.get("pricing_min_margin"), DEFAULTS.minMarginRate),
    };
    return cache;
  } catch {
    return { ...DEFAULTS };
  }
}

export function clearSettingsCache() {
  cache = null;
}

/** Utilitário helper para verificar se uma chave de configuração está ativa. */
export function isSettingEnabled(value: string | null | undefined): boolean {
  if (value == null) return false;
  const lower = String(value).toLowerCase().trim();
  return lower === "true" || lower === "1" || lower === "sim" || lower === "yes" || lower === "ativo";
}

/** Converte valor salvo em % ("6", "1.99") para fração (0.06, 0.0199). */
const percentToRate = (v: string | null | undefined, fallback: number): number => {
  if (v == null || String(v).trim() === "") return fallback;
  const n = parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  // se já veio como fração (< 1 e não é zero intencional de config), aceita
  if (n > 0 && n < 1) return n;
  return n / 100;
};
