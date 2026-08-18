/**
 * ANÁLISE DE FORMA DE PAGAMENTO
 *
 * Responde a pergunta "vale a pena 3x sem juros?" com número, não com
 * intuição. Dado um preço de venda e o custo direto, calcula quanto
 * sobra em cada forma de pagamento depois de imposto e taxa.
 *
 * A premissa que torna o 3x viável: o preço de tabela embute o PIOR
 * meio aceito. Assim toda venda respeita a margem mínima, e quem paga
 * PIX gera folga — é dela que sai o desconto à vista, sem tirar do
 * lucro.
 *
 * Taxas de referência: InfinitePay, faixa até R$ 20 mil/mês. Mudam com
 * o faturamento, por isso o custo embutido é configurável no painel.
 */

export type PaymentMethodKey =
  | "pix"
  | "dinheiro"
  | "debito"
  | "credito_1x"
  | "credito_2x"
  | "credito_3x";

export type PaymentOption = {
  key: PaymentMethodKey;
  label: string;
  /** taxa da adquirente sobre o valor da venda (fração) */
  feeRate: number;
  /** em quantas vezes o cliente paga */
  installments: number;
};

/** Tabela de referência. `feeRate` vem do painel quando disponível. */
export const PAYMENT_OPTIONS: PaymentOption[] = [
  { key: "pix", label: "PIX", feeRate: 0, installments: 1 },
  { key: "dinheiro", label: "Dinheiro", feeRate: 0, installments: 1 },
  { key: "debito", label: "Débito", feeRate: 0.0137, installments: 1 },
  { key: "credito_1x", label: "Crédito à vista", feeRate: 0.0315, installments: 1 },
  { key: "credito_2x", label: "Crédito 2x", feeRate: 0.0539, installments: 2 },
  { key: "credito_3x", label: "Crédito 3x", feeRate: 0.0612, installments: 3 },
];

export type PaymentAnalysis = {
  key: PaymentMethodKey;
  label: string;
  installments: number;
  /** o que o cliente paga */
  customerPays: number;
  /** valor de cada parcela */
  perInstallment: number;
  feeRate: number;
  feeAmount: number;
  taxAmount: number;
  /** o que sobra na conta da empresa */
  netReceived: number;
  profit: number;
  /** margem sobre o que o cliente pagou (fração) */
  marginRate: number;
  /** respeita o piso configurado? */
  meetsMinimum: boolean;
  /** disponível para este valor? (regra do parcelamento mínimo) */
  available: boolean;
  unavailableReason?: string;
};

export type AnalyzeInput = {
  /** preço de tabela, já com margem, imposto e custo de pagamento */
  price: number;
  /** custo direto de produção */
  directCost: number;
  taxRate: number;
  minMarginRate: number;
  /** valor mínimo para oferecer parcelamento sem juros */
  installmentMin: number;
  /** máximo de parcelas sem juros */
  installmentMax: number;
  /** desconto aplicado quando o cliente paga à vista sem cartão */
  pixDiscountRate?: number;
  options?: PaymentOption[];
};

/**
 * Calcula a margem real de cada forma de pagamento.
 *
 * O desconto do PIX reduz o que o cliente paga, então a análise usa o
 * valor efetivamente cobrado em cada linha — não o preço de tabela.
 */
export function analyzePaymentMethods(input: AnalyzeInput): PaymentAnalysis[] {
  const price = Math.max(Number(input.price) || 0, 0);
  const directCost = Math.max(Number(input.directCost) || 0, 0);
  const taxRate = Math.max(Number(input.taxRate) || 0, 0);
  const minMargin = Math.max(Number(input.minMarginRate) || 0, 0);
  const pixDiscount = Math.max(Number(input.pixDiscountRate) || 0, 0);
  const options = input.options?.length ? input.options : PAYMENT_OPTIONS;

  return options.map((opt) => {
    /* PIX e dinheiro não passam por adquirente: o desconto à vista
       devolve ao cliente o custo que a empresa não teve. */
    const semTaxa = opt.feeRate === 0;
    const customerPays = semTaxa ? price * (1 - pixDiscount) : price;

    const feeAmount = customerPays * opt.feeRate;
    const taxAmount = customerPays * taxRate;
    const netReceived = customerPays - feeAmount - taxAmount;
    const profit = netReceived - directCost;
    const marginRate = customerPays > 0 ? profit / customerPays : 0;

    const parcelado = opt.installments > 1;
    const abaixoDoMinimo = parcelado && customerPays < input.installmentMin;
    const acimaDoMaximo = opt.installments > input.installmentMax;

    return {
      key: opt.key,
      label: opt.label,
      installments: opt.installments,
      customerPays,
      perInstallment: opt.installments > 0 ? customerPays / opt.installments : customerPays,
      feeRate: opt.feeRate,
      feeAmount,
      taxAmount,
      netReceived,
      profit,
      marginRate,
      meetsMinimum: marginRate >= minMargin - 1e-9,
      available: !abaixoDoMinimo && !acimaDoMaximo,
      unavailableReason: acimaDoMaximo
        ? `Acima de ${input.installmentMax}x sem juros`
        : abaixoDoMinimo
          ? `Mínimo de ${formatBRL(input.installmentMin)} para parcelar`
          : undefined,
    };
  });
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Preço de tabela que garante a margem mínima no pior meio aceito.
 * Mesma fórmula do motor — exposta para simulação sem recalcular receita.
 */
export function priceForMinimumMargin(
  directCost: number,
  minMarginRate: number,
  taxRate: number,
  paymentCostRate: number
): number {
  const cost = Math.max(Number(directCost) || 0, 0);
  const total =
    Math.max(minMarginRate, 0) + Math.max(taxRate, 0) + Math.max(paymentCostRate, 0);
  const divisor = 1 - Math.min(total, 0.99);
  return cost > 0 ? cost / divisor : 0;
}
