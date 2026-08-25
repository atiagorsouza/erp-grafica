/**
 * ====================================================================
 *  MOTOR DE PRECIFICAÇÃO — Gráfica Rápida & Papelaria Personalizada
 * ====================================================================
 *
 *  Fluxo do motor:
 *
 *    Categoria (Laser / Jato de Tinta / Térmica / 3D / Sublimação / DTF)
 *        │  possui lógica de custo por página (consumíveis + custo fixo)
 *        ▼
 *    Impressora (Konica C284-e, L18050...)  → herda a categoria, com fator
 *        │
 *        ▼
 *    PRODUTO =  Impressão  +  Material/Insumo  +  Acabamento  +  Serviço
 *               ───────────────────────────────────────────────────────
 *               custo base  →  margem  →  preço de venda
 *                            →  impostos  →  taxa de maquininha  →  preço final
 *
 *  Tudo é decomposto (breakdown) para total transparência na calculadora.
 * ==================================================================== */

/** Tabela de preços (DTF UV, DTF Textil, Lona, Adesivo) */
export interface PricingTableRow {
  id: number;
  type: string;         // dtf_uv, dtf_textil, lona, adesivo
  label: string;
  unitCost: string | number | null;
  unit?: string | null;
}

/**
 * Para categorias Térmica: o cálculo é diferente.
 * Ribbon (custo por metro consumido) + rolo de etiqueta (custo por unidade).
 * ribbonLengthMeters = 76m padrão, labelMetersPerUnit = metros de ribbon usados por etiqueta
 */
export function thermalCostPerLabel(
  ribbonCost: number,
  ribbonLengthMeters: number,   // ex: 76m
  labelRollCost: number,        // custo do rolo de etiquetas (ex: R$60)
  labelRollQty: number,         // quantidade de etiquetas no rolo (ex: 1000)
  labelsPerMeter: number        // etiquetas por metro de ribbon (ex: 50x50mm ~20/m)
): number {
  const ribbonCostPerMeter = ribbonCost / ribbonLengthMeters;
  const ribbonCostPerLabel = ribbonCostPerMeter / labelsPerMeter;
  const labelCostEach = labelRollCost / labelRollQty;
  return ribbonCostPerLabel + labelCostEach;
}

/** Tipos estruturais mínimos — desacoplados do schema (duck typing). */
export interface ConsumableLike {
  unitCost?: string | number | null;
  yieldPages?: string | number | null;
  appliesTo?: string | null;
  /** colorant = toner/tinta/resina; mechanical = cilindro/fusora/manutenção */
  costRole?: string | null;
}
export interface CategoryLike {
  fixedCostPerPage?: string | number | null;
  wasteFactor?: string | number | null;
  measureMode?: string | null;
  unitLabel?: string | null;
  referenceCoverage?: string | number | null;
}
export interface PrinterLike {
  costMultiplier?: string | number | null;
  /** valor da hora de máquina — 3D/recorte cobram tempo (v3.39.0) */
  hourlyRate?: string | number | null;
}
export interface MaterialLike {
  name?: string | null;
  unit?: string | null;
  unitCost: string | number | null;
}
/** Linha de tabela terceirizada usada como insumo do produto (v3.42.0). */
export interface PricingTableLike {
  label?: string | null;
  unit?: string | null;
  unitCost: string | number | null;
  minQty?: string | number | null;
  widthCm?: string | number | null;
  heightCm?: string | number | null;
  /** DTF: peças que cabem na folha comprada */
  piecesPerSheet?: string | number | null;
  /** piso de cobrança em R$ por peça (lona/vinil) */
  minCharge?: string | number | null;
}
export interface FinishingLike {
  name?: string | null;
  unit?: string | null;
  unitCost: string | number | null;
}
export interface ServiceLike {
  name?: string | null;
  baseCost: string | number | null;
  type?: string | null;
  /** Horas de trabalho do serviço. Vira custo quando combinada com
   *  `laborHourlyRate` — ver `serviceTotal()` (v3.46.0). */
  estimatedHours?: string | number | null;
}


const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Custo de um serviço = custo fixo + (horas × valor da hora).
 *
 * Até a v3.45.1 o campo "Horas estimadas" era gravado e exibido na tela,
 * mas NUNCA entrava em cálculo nenhum: só o `baseCost` contava. Quem
 * cadastrava "Arte final — 2h" via o campo aceitar o valor e supunha que
 * as 2 horas seriam cobradas. Não eram.
 *
 * Agora as horas viram dinheiro, usando o valor-hora do Painel de
 * Controle (`labor_hourly_rate`). Com a taxa em 0 — que é o default —
 * o resultado é idêntico ao de antes, então nenhum produto já cadastrado
 * muda de preço sozinho.
 *
 * Mesma ideia do tempo de máquina da v3.39.0, mas para mão de obra:
 * lá é a impressora ocupada, aqui é a pessoa trabalhando.
 */
export function serviceTotal(
  service: ServiceLike | null | undefined,
  laborHourlyRate = 0
): { total: number; base: number; labor: number; hours: number } {
  if (!service) return { total: 0, base: 0, labor: 0, hours: 0 };
  const base = num(service.baseCost);
  const hours = Math.max(num(service.estimatedHours), 0);
  const rate = Math.max(num(laborHourlyRate), 0);
  const labor = hours * rate;
  return { total: base + labor, base, labor, hours };
}

export type ColorMode = "mono" | "color";

/** Custo de um único consumível por página/impressão. */
export function consumableCostPerPage(c: ConsumableLike): number {
  const yieldPages = num(c.yieldPages, 0);
  if (yieldPages <= 0) return 0;
  return num(c.unitCost) / yieldPages;
}

/**
 * Custo de página da CATEGORIA.
 *  mono  = soma consumíveis mono/both  + custo fixo
 *  color = soma consumíveis color/both + custo fixo
 * Aplica fator de perda (waste) — resíduos/prova.
 */
export function categoryCostPerPage(
  category: CategoryLike,
  consumables: ConsumableLike[],
  mode: ColorMode = "color"
): number {
  const consumableTotal = consumables
    .filter((c) => {
      if (mode === "mono") return c.appliesTo === "mono" || c.appliesTo === "both";
      return c.appliesTo === "color" || c.appliesTo === "both";
    })
    .reduce((sum, c) => sum + consumableCostPerPage(c), 0);

  const fixed = num(category.fixedCostPerPage);
  const waste = num(category.wasteFactor); // ex: 0.05 = 5%
  return (consumableTotal + fixed) * (1 + waste);
}

/**
 * Custo de página de uma IMPRESSORA.
 * Herda a lógica da categoria e aplica um fator multiplicador
 * (máquina mais velha/insumo importado etc.).
 */
export function printerCostPerPage(
  printer: PrinterLike,
  category: CategoryLike,
  consumables: ConsumableLike[],
  mode: ColorMode = "color"
): number {
  const base = categoryCostPerPage(category, consumables, mode);
  return base * num(printer.costMultiplier, 1);
}

export interface FinishingLine {
  finishing?: FinishingLike;
  quantity: number;
}
export interface MaterialLine {
  material?: MaterialLike;
  quantity: number;
}

export interface ProductCalcInput {
  category?: CategoryLike | null;
  consumables: ConsumableLike[];
  printer?: PrinterLike | null;
  /* --------------------------------------------------------------
   * FORMATO NO MODO UNIT (v3.31.0)
   *
   * Até a v3.30.0 o modo unit ignorava o formato: chamava
   * `printerCostPerPage`, que não conhece cobertura nem área. Na
   * prática o select "Formato" da tela de produto era decorativo —
   * uma foto 10x15 com 100% de cobertura era custeada com a mesma
   * tinta de um texto 5%, e o A3 custava igual ao A4.
   *
   * Agora unit e batch usam o MESMO motor (`computePrintSheetCost`),
   * então cobertura, área e override valem nos dois modos.
   * ------------------------------------------------------------- */
  format?: PrintFormatLike | null;
  colorMode: ColorMode;
  pagesPerUnit: number; // páginas/impressões por unidade de produto
  /* Peças que saem de uma folha. Quando maior que 1, o produto é
     fracionado e o clique se divide entre as peças. */
  piecesPerSheet?: number | string | null;
  copies: number; // vias/copias por unidade
  /** minutos de máquina por unidade; com `printer.hourlyRate` vira custo */
  machineMinutes?: number;
  baseMaterial?: MaterialLike | null;
  baseMaterialQty: number;
  /** linha de tabela (DTF UV, Lona...) como custo do produto */
  basePricingTable?: PricingTableLike | null;
  basePricingTableQty?: number;
  /** peças deste produto por folha; 0 = usa a referência da tabela */
  basePricingTablePieces?: number;
  finishings: FinishingLine[];
  extraMaterials: MaterialLine[];
  service?: ServiceLike | null;
  /** valor da hora de mão de obra (R$); multiplica `service.estimatedHours` */
  laborHourlyRate?: number;
  margin: number; // margem sobre o preço (0..1)
  taxRate: number; // impostos sobre venda (0..1)
  cardFeeRate: number; // taxa maquininha (0..1)
}

export interface BreakdownLine {
  label: string;
  detail?: string;
  amount: number;
}

export interface ProductCalcResult {
  lines: BreakdownLine[];
  printing: number;
  materials: number;
  finishing: number;
  service: number;
  baseCost: number;
  marginAmount: number;
  sellPrice: number; // preço de venda (com margem, antes de taxas extras)
  taxAmount: number;
  cardFeeAmount: number;
  finalPrice: number; // preço final ao cliente
  unitPrice: number;
}

/**
 * Calculadora real do produto.
 * Decomposição completa — cada centavo é justificado.
 */
export function computeProduct(input: ProductCalcInput): ProductCalcResult {
  const lines: BreakdownLine[] = [];

  /* Quantas peças saem de uma folha.
   *
   * Quando o produto é fracionado — 4 panfletos numa A4, 10 cartões,
   * 9 polaroids — a folha inteira é impressa de uma vez e o clique
   * precisa ser dividido entre as peças. Cobrar o clique cheio em
   * cada panfleto multiplica o custo da impressão por quatro.
   *
   * O modo batch já fazia isso (`computeBatchProduct`); o modo unit
   * não fazia, e era o modo usado por panfleto, cartão e copo. */
  const pieces = Math.max(num(input.piecesPerSheet, 1), 1);

  // 1) IMPRESSÃO -----------------------------------------------------
  /* 3D (grama): sem linha de impressão — o filamento entra pela linha
     "Material" e a máquina pela linha "Tempo de máquina". */
  const grama = input.category?.measureMode === "grama";
  let printing = 0;
  if (input.printer && input.category && !grama) {
    /* Mesmo motor do modo batch: respeita cobertura do formato, fator
       de área e `printCostOverride`. `printSides` fica em 1 porque no
       modo unit as faces já são contadas em `pagesPerUnit`. */
    const perPage = computePrintSheetCost({
      printer: input.printer,
      category: input.category,
      consumables: input.consumables,
      format: input.format,
      colorMode: input.colorMode,
      printSides: 1,
    });
    printing = (perPage * num(input.pagesPerUnit) * num(input.copies)) / pieces;
    const fmt = input.format?.name ? ` · ${input.format.name}` : "";
    const frac = pieces > 1 ? ` ÷ ${pieces} por folha` : "";
    lines.push({
      label: "Impressão",
      detail: `${num(input.copies)} via(s) × ${num(input.pagesPerUnit)} pg × ${formatMoney(
        perPage
      )}/pg (${input.colorMode === "color" ? "colorido" : "P&B"}${fmt})${frac}`,
      amount: printing,
    });
  } else if (input.category && !grama) {
    const perPage = categoryCostPerPage(
      input.category,
      input.consumables,
      input.colorMode
    );
    printing = (perPage * num(input.pagesPerUnit) * num(input.copies)) / pieces;
    lines.push({
      label: "Impressão (categoria)",
      detail: `${num(input.copies)} via(s) × ${num(input.pagesPerUnit)} pg × ${formatMoney(
        perPage
      )}/pg${pieces > 1 ? ` ÷ ${pieces} por folha` : ""}`,
      amount: printing,
    });
  }

  /* 1b) TEMPO DE MÁQUINA -------------------------------------------
     Em 3D e recorte o insumo é barato e a ocupação é o custo real.
     Só entra quando a impressora tem valor-hora E o produto declara
     minutos — assim nenhuma impressora por página é afetada. */
  const hourlyRate = num(input.printer?.hourlyRate, 0);
  const machineMinutes = num(input.machineMinutes, 0);
  if (hourlyRate > 0 && machineMinutes > 0) {
    const timeCost = (machineMinutes / 60) * hourlyRate * num(input.copies, 1);
    printing += timeCost;
    const h = Math.floor(machineMinutes / 60);
    const m = Math.round(machineMinutes % 60);
    lines.push({
      label: "Tempo de máquina",
      detail: `${h > 0 ? `${h}h` : ""}${m > 0 ? `${m}min` : ""} × ${formatMoney(hourlyRate)}/h`,
      amount: timeCost,
    });
  }

  // 2) MATERIAL / INSUMO BASE --------------------------------------
  let materials = 0;
  if (input.baseMaterial) {
    const m = num(input.baseMaterial.unitCost) * num(input.baseMaterialQty);
    materials += m;
    lines.push({
      label: `Material: ${input.baseMaterial.name}`,
      detail: `${num(input.baseMaterialQty)} ${input.baseMaterial.unit} × ${formatMoney(
        num(input.baseMaterial.unitCost)
      )}`,
      amount: m,
    });
  }

  // 3) ACABAMENTOS --------------------------------------------------
  let finishing = 0;
  for (const fl of input.finishings) {
    if (!fl.finishing) continue;
    const v = num(fl.finishing.unitCost) * num(fl.quantity);
    finishing += v;
    lines.push({
      label: `Acabamento: ${fl.finishing.name}`,
      detail: `${num(fl.quantity)} ${fl.finishing.unit} × ${formatMoney(
        num(fl.finishing.unitCost)
      )}`,
      amount: v,
    });
  }

  /* 3b) TABELA TERCEIRIZADA ----------------------------------------
     Caneca na UV, camisa têxtil: o custo vem da tabela do fornecedor
     e a margem do produto é aplicada por cima. Usa `unitCost`, nunca
     `sellPrice` — senão a margem entraria duas vezes. */
  if (input.basePricingTable) {
    const t = input.basePricingTable;
    const qty = num(input.basePricingTableQty, 1);
    const unit = String(t.unit || "unidade");
    const tableCost = num(t.unitCost);
    const minCharge = num(t.minCharge, 0);
    let v = 0;
    let detail = "";

    if (unit === "m2") {
      /* Lona/Vinil: área da peça × preço do m², com piso em reais.
         Banner 1,20×0,90 = 1,08 m²; adesivo 30×30 cai no mínimo. */
      const area = (num(t.widthCm) * num(t.heightCm)) / 10000;
      const perPiece = Math.max(area * tableCost, minCharge);
      v = perPiece * qty;
      const noMin = area * tableCost;
      detail =
        minCharge > 0 && noMin < minCharge
          ? `${area.toFixed(3)} m² × ${formatMoney(tableCost)} = ${formatMoney(noMin)} → mínimo ${formatMoney(minCharge)}`
          : `${area.toFixed(3)} m² × ${formatMoney(tableCost)}`;
    } else {
      /* DTF: a folha é indivisível. `basePricingTableQty` aqui é
         quantas PEÇAS do produto saem por folha comprada — a caneca
         usa 1/6 de uma folha 20×28, então o custo dela é a folha
         dividida pelo que cabe. */
      /* O override do produto manda: quantas peças cabem depende da
         ESTAMPA (6 canecas ou 30 chaveiros na mesma folha), não da
         folha. Sem override, cai na referência da tabela. */
      const override = num(input.basePricingTablePieces, 0);
      const perSheet = override > 0 ? override : num(t.piecesPerSheet, 1);
      if (perSheet > 1) {
        v = (tableCost / perSheet) * qty;
        detail = `${formatMoney(tableCost)} ÷ ${perSheet} por folha × ${qty}`;
      } else {
        v = Math.max(tableCost * qty, minCharge);
        detail = `${qty} ${unit} × ${formatMoney(tableCost)}`;
      }
    }

    materials += v;
    lines.push({
      label: `Tabela: ${t.label || "terceirizado"}`,
      detail,
      amount: v,
    });
  }

  // 4) MATERIAIS EXTRAS --------------------------------------------
  for (const ml of input.extraMaterials) {
    if (!ml.material) continue;
    const v = num(ml.material.unitCost) * num(ml.quantity);
    materials += v;
    lines.push({
      label: `Insumo: ${ml.material.name}`,
      detail: `${num(ml.quantity)} ${ml.material.unit} × ${formatMoney(
        num(ml.material.unitCost)
      )}`,
      amount: v,
    });
  }

  // 5) SERVIÇO ------------------------------------------------------
  let serviceCost = 0;
  if (input.service) {
    const svc = serviceTotal(input.service, input.laborHourlyRate);
    serviceCost = svc.total;
    lines.push({
      label: `Serviço: ${input.service.name}`,
      detail: input.service.type === "terceirizado" ? "Terceirizado" : "Próprio",
      amount: svc.base,
    });
    if (svc.labor > 0) {
      lines.push({
        label: `Mão de obra: ${input.service.name}`,
        detail: `${svc.hours}h × ${formatMoney(num(input.laborHourlyRate))}/h`,
        amount: svc.labor,
      });
    }
  }

  const baseCost = printing + materials + finishing + serviceCost;

  /* 6/7) MARGEM + IMPOSTO + CUSTO DE PAGAMENTO ----------------------
   *
   * Tudo num divisor único, igual ao modo tiragem.
   *
   * Antes a margem usava divisor e as taxas eram SOMADAS por fora:
   *
   *     sell  = custo / (1 - margem)
   *     final = sell + sell*imposto + sell*taxa
   *
   * O erro: imposto e maquininha incidem sobre o valor efetivamente
   * cobrado (o final), não sobre o subtotal. Com custo 100, margem 40%,
   * imposto 6% e cartão 4,99%, o preço saía R$ 184,98 e sobravam
   * R$ 164,65 — margem real de 39,27%, não os 40% pedidos. Pior: o modo
   * tiragem, que sempre usou divisor, dava R$ 204,04 no mesmo produto.
   * Dez por cento de diferença dependendo do modo escolhido.
   *
   * Com o divisor, a margem informada é o piso REAL sobre a receita:
   *
   *     final = custo / (1 - margem - imposto - pagamento)
   *
   * `paymentRate` deve trazer o PIOR meio de pagamento aceito (ex.: 3x
   * sem juros). Assim toda venda respeita a margem mínima, e quem paga
   * PIX gera a folga que banca o desconto à vista.
   */
  const margin = Math.max(num(input.margin), 0);
  const taxRate = Math.max(num(input.taxRate), 0);
  const paymentRate = Math.max(num(input.cardFeeRate), 0);
  const rateTotal = margin + taxRate + paymentRate;

  /* Acima de 99% o divisor zera ou inverte o sinal: sem trava, um
     cadastro errado geraria preço negativo ou absurdo. */
  const divisor = 1 - Math.min(rateTotal, 0.99);
  const finalPrice = baseCost > 0 ? baseCost / divisor : 0;

  const taxAmount = finalPrice * taxRate;
  const cardFeeAmount = finalPrice * paymentRate;
  /* o que sobra depois de custo, imposto e taxa — o lucro de verdade */
  const marginAmount = finalPrice - baseCost - taxAmount - cardFeeAmount;
  /* mantido para compatibilidade: receita antes das deduções variáveis */
  const sellPrice = finalPrice - taxAmount - cardFeeAmount;

  return {
    lines,
    printing,
    materials,
    finishing,
    service: serviceCost,
    baseCost,
    marginAmount,
    sellPrice,
    taxAmount,
    cardFeeAmount,
    finalPrice,
    unitPrice: finalPrice,
  };
}

export type FinishingChargeMode =
  | "fixed_lot"
  | "per_piece"
  | "per_sheet"
  | "per_kit"
  | "per_meter"
  | "per_m2";

export interface PrintFormatLike {
  name?: string | null;
  areaFactor?: string | number | null;
  inkCoverage?: string | number | null;
  printCostOverride?: string | number | null;
}

export interface BatchFinishingLine {
  finishing?: FinishingLike;
  quantity: number;
  chargeMode?: FinishingChargeMode | string | null;
  batchSize?: number;
}

export interface BatchCalcInput {
  printer?: PrinterLike | null;
  category?: CategoryLike | null;
  consumables: ConsumableLike[];
  format?: PrintFormatLike | null;
  colorMode: ColorMode;
  /** quantidade efetivamente vendida / solicitada */
  requestedQuantity: number;
  /** quantas peças aproveitáveis cabem em uma folha cheia */
  piecesPerSheet: number;
  /** 1 para frente; 2 para frente e verso */
  printSides: number;
  /** perda técnica em decimal: 0.05 = 5% */
  wastePercent: number;
  /** folhas de setup/prova; o motor usa o maior entre perda e setup */
  setupSheets: number;
  /** folhas/material por folha impressa — normalmente 1 */
  materialSheetsPerPrintedSheet: number;
  baseMaterial?: MaterialLike | null;
  extraMaterials: MaterialLine[];
  finishings: BatchFinishingLine[];
  service?: ServiceLike | null;
  /** valor da hora de mão de obra (R$); multiplica `service.estimatedHours` */
  laborHourlyRate?: number;
  /** matriz de marginalização / markup divisor */
  operationalRate: number;
  taxRate: number;
  paymentRate: number;
  profitRate: number;
  roundingStep?: number;
}

export interface BatchCalcResult {
  lines: BreakdownLine[];
  requestedQuantity: number;
  baseSheets: number;
  sheetsByWaste: number;
  sheetsBySetup: number;
  finalSheets: number;
  printCostPerSheet: number;
  printing: number;
  materials: number;
  finishing: number;
  service: number;
  directCost: number;
  operationalAmount: number;
  taxAmount: number;
  paymentAmount: number;
  profitAmount: number;
  rateTotal: number;
  divisor: number;
  finalPrice: number;
  unitPrice: number;
  valid: boolean;
  error?: string;
}

/**
 * Custo de uma folha impressa para uma receita de tiragem.
 *
 * Prioridade:
 *  1. `printCostOverride` no formato: tabela comercial interna A4/A3/A3+.
 *  2. Cálculo técnico: colorantes escalados pela cobertura + mecânica por
 *     folha, multiplicados pela área e pelo número de faces.
 */
export function computePrintSheetCost({
  printer,
  category,
  consumables,
  format,
  colorMode,
  printSides = 1,
}: {
  printer?: PrinterLike | null;
  category?: CategoryLike | null;
  consumables: ConsumableLike[];
  format?: PrintFormatLike | null;
  colorMode: ColorMode;
  printSides?: number;
}): number {
  if (!category) return 0;
  /* 3D (modo "grama") não tem custo por "página": o filamento é
     MATERIAL do estoque (entra pela linha "Material" do produto) e a
     máquina se paga pelas horas (linha "Tempo de máquina"). Sem este
     zero, o filamento cadastrado como consumível era cobrado aqui E
     de novo na linha do material — preço em dobro. */
  if (category.measureMode === "grama") return 0;
  const sides = Math.max(1, num(printSides, 1));
  const override = num(format?.printCostOverride);
  if (override > 0) return override * sides * num(printer?.costMultiplier, 1);

  const applicable = consumables.filter((c) =>
    colorMode === "mono"
      ? c.appliesTo === "mono" || c.appliesTo === "both"
      : c.appliesTo === "color" || c.appliesTo === "both"
  );
  const baseCoverage = Math.max(num(category.referenceCoverage, 0.05), 0.0001);
  const coverage = Math.max(num(format?.inkCoverage, baseCoverage), 0);
  const coverageFactor = coverage / baseCoverage;
  const areaFactor = Math.max(num(format?.areaFactor, 1), 0);

  const colorant = applicable
    .filter((c) => (c.costRole || "colorant") === "colorant")
    .reduce((sum, c) => sum + consumableCostPerPage(c), 0);
  const mechanical = applicable
    .filter((c) => (c.costRole || "colorant") !== "colorant")
    .reduce((sum, c) => sum + consumableCostPerPage(c), 0);

  const raw = (colorant * coverageFactor + mechanical + num(category.fixedCostPerPage)) * areaFactor * sides;
  return raw * (1 + num(category.wasteFactor)) * num(printer?.costMultiplier, 1);
}

/**
 * Arredonda preço comercial para cima no degrau informado.
 *
 * `Math.ceil(v / step) * step` reintroduz erro binário na multiplicação
 * final — `roundCommercialPrice(1.15, 0.1)` devolvia `1.2000000000000002`.
 * O valor sujo circulava no `unitPrice` e no detalhamento mostrado ao
 * cliente (o banco escapava por causa do `round2` na gravação).
 *
 * A conta passa a ser feita em centavos inteiros, e o resultado é
 * normalizado para 2 casas — preço não tem fração de centavo.
 */
export function roundCommercialPrice(value: number, step = 0.01): number {
  const safeStep = Math.max(num(step, 0.01), 0.01);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const stepCents = Math.max(1, Math.round(safeStep * 100));
  const valueCents = Math.round(value * 100);
  const rounded = Math.ceil(valueCents / stepCents) * stepCents;
  return rounded / 100;
}

/**
 * MOTOR DE TIRAGEM / APROVEITAMENTO DE FOLHA
 *
 * Etapas:
 *  1. ceil(qtd / peças_por_folha) — nunca fraciona a folha;
 *  2. aplica maior entre perda percentual e setup em folhas;
 *  3. soma impressão + material + acabamentos por regra + serviço;
 *  4. usa markup divisor: CD / (1 - operação - imposto - pagamento - lucro).
 */
export function computeBatchProduct(input: BatchCalcInput): BatchCalcResult {
  const qty = Math.max(num(input.requestedQuantity), 0);
  const pieces = Math.max(num(input.piecesPerSheet, 1), 1);
  const baseSheets = qty > 0 ? Math.ceil(qty / pieces) : 0;

  /* Acerto e refugo são custos INDEPENDENTES e somam.
   *
   * Antes: `Math.max(sheetsByWaste, sheetsBySetup)` — pegava o maior,
   * o que não corresponde a nada que acontece na máquina. Numa tiragem
   * de 1000 peças (4/folha, acerto 10, perda 5%) cobrava 263 folhas
   * enquanto a produção consumia 273. Em tiragem pequena era pior: o
   * refugo era simplesmente descartado quando o setup fosse maior.
   *
   *   setup  = folhas queimadas até a cor entrar no registro.
   *            FIXO por serviço — independe do tamanho da tiragem.
   *   waste  = refugo ao longo da rodagem (puxada dupla, corte torto).
   *            PROPORCIONAL ao volume.
   *
   * O refugo incide sobre as folhas efetivamente rodadas, o que inclui
   * as de acerto: elas também passam pela máquina.
   */
  const setupSheets = Math.max(Math.floor(num(input.setupSheets)), 0);
  const wastePercent = Math.max(num(input.wastePercent), 0);
  const sheetsBySetup = baseSheets + setupSheets;
  const sheetsByWaste = Math.ceil(sheetsBySetup * wastePercent);
  const finalSheets = baseSheets > 0 ? sheetsBySetup + sheetsByWaste : 0;
  const lines: BreakdownLine[] = [];

  const printCostPerSheet = computePrintSheetCost({
    printer: input.printer,
    category: input.category,
    consumables: input.consumables,
    format: input.format,
    colorMode: input.colorMode,
    printSides: input.printSides,
  });
  const printing = finalSheets * printCostPerSheet;
  /* 3D: sem "folhas × R$ 0,00" no detalhamento (material + tempo only). */
  if ((printing > 0 || finalSheets > 0) && input.category?.measureMode !== "grama") {
    lines.push({
      label: "Impressão da tiragem",
      detail: `${finalSheets} folha(s) × ${formatMoney(printCostPerSheet)}/folha${input.printSides > 1 ? ` × ${input.printSides} faces` : ""}`,
      amount: printing,
    });
  }

  let materials = 0;
  if (input.baseMaterial) {
    const sheetQty = finalSheets * Math.max(num(input.materialSheetsPerPrintedSheet, 1), 0);
    const cost = sheetQty * num(input.baseMaterial.unitCost);
    materials += cost;
    lines.push({
      label: `Material: ${input.baseMaterial.name}`,
      detail: `${sheetQty} ${input.baseMaterial.unit || "folha"}(s) × ${formatMoney(num(input.baseMaterial.unitCost))}`,
      amount: cost,
    });
  }
  for (const materialLine of input.extraMaterials) {
    if (!materialLine.material) continue;
    const cost = num(materialLine.material.unitCost) * num(materialLine.quantity) * qty;
    materials += cost;
    lines.push({
      label: `Insumo por peça: ${materialLine.material.name}`,
      detail: `${qty} peça(s) × ${num(materialLine.quantity)} ${materialLine.material.unit || "un"} × ${formatMoney(num(materialLine.material.unitCost))}`,
      amount: cost,
    });
  }

  let finishing = 0;
  for (const line of input.finishings) {
    if (!line.finishing) continue;
    const mode = (line.chargeMode || "per_piece") as FinishingChargeMode;
    const multiplier = Math.max(num(line.quantity, 1), 0);
    const unitCost = num(line.finishing.unitCost);
    const batchSize = Math.max(num(line.batchSize, 1), 1);
    let units = qty;
    if (mode === "fixed_lot") units = 1;
    if (mode === "per_sheet") units = finalSheets;
    if (mode === "per_kit") units = qty > 0 ? Math.ceil(qty / batchSize) : 0;
    // per_meter e per_m2: `quantity` representa o consumo por unidade vendida
    const cost = unitCost * multiplier * units;
    finishing += cost;
    const modeLabel: Record<FinishingChargeMode, string> = {
      fixed_lot: "fixo por lote",
      per_piece: "por peça",
      per_sheet: "por folha",
      per_kit: "por kit",
      per_meter: "por metro",
      per_m2: "por m²",
    };
    lines.push({
      label: `Acabamento: ${line.finishing.name}`,
      detail: `${modeLabel[mode]} · ${units} × ${multiplier} × ${formatMoney(unitCost)}`,
      amount: cost,
    });
  }

  const svc = serviceTotal(input.service, input.laborHourlyRate);
  const service = svc.total;
  if (input.service && svc.base > 0) {
    lines.push({
      label: `Serviço: ${input.service.name}`,
      detail: "Custo fixo do lote",
      amount: svc.base,
    });
  }
  // Linha própria: o operador precisa ver quanto do preço é mão de obra.
  if (input.service && svc.labor > 0) {
    lines.push({
      label: `Mão de obra: ${input.service.name}`,
      detail: `${svc.hours}h × ${formatMoney(num(input.laborHourlyRate))}/h`,
      amount: svc.labor,
    });
  }

  const directCost = printing + materials + finishing + service;
  const operationalRate = Math.max(num(input.operationalRate), 0);
  const taxRate = Math.max(num(input.taxRate), 0);
  const paymentRate = Math.max(num(input.paymentRate), 0);
  const profitRate = Math.max(num(input.profitRate), 0);
  const rateTotal = operationalRate + taxRate + paymentRate + profitRate;
  const divisor = 1 - rateTotal;
  if (divisor <= 0.01) {
    return {
      lines,
      requestedQuantity: qty,
      baseSheets,
      sheetsByWaste,
      sheetsBySetup,
      finalSheets,
      printCostPerSheet,
      printing,
      materials,
      finishing,
      service,
      directCost,
      operationalAmount: 0,
      taxAmount: 0,
      paymentAmount: 0,
      profitAmount: 0,
      rateTotal,
      divisor,
      finalPrice: 0,
      unitPrice: 0,
      valid: false,
      error: "A soma de operação, imposto, pagamento e lucro precisa ser menor que 99%.",
    };
  }

  const rawFinal = directCost / divisor;
  const finalPrice = roundCommercialPrice(rawFinal, input.roundingStep);
  return {
    lines,
    requestedQuantity: qty,
    baseSheets,
    sheetsByWaste,
    sheetsBySetup,
    finalSheets,
    printCostPerSheet,
    printing,
    materials,
    finishing,
    service,
    directCost,
    operationalAmount: finalPrice * operationalRate,
    taxAmount: finalPrice * taxRate,
    paymentAmount: finalPrice * paymentRate,
    profitAmount: finalPrice * profitRate,
    rateTotal,
    divisor,
    finalPrice,
    unitPrice: qty > 0 ? finalPrice / qty : 0,
    valid: true,
  };
}

/* ------------------------------------------------------------------ */
/*  FAIXAS DE PREÇO POR QUANTIDADE                                     */
/* ------------------------------------------------------------------ */

/** Normaliza para 2 casas sem herdar erro binário da multiplicação. */
function money2(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/* ------------------------------------------------------------------ */
/*  TÉRMICA — rendimento do ribbon por formato                         */
/* ------------------------------------------------------------------ */

/**
 * Quantas etiquetas um ribbon imprime, dada a geometria do rolo.
 *
 * O ribbon avança o COMPRIMENTO da etiqueta mais o gap entre elas; a
 * largura não importa (o ribbon é mais largo que a etiqueta). Rolos com
 * várias colunas imprimem N etiquetas no mesmo avanço, multiplicando o
 * rendimento.
 *
 *   76 m, etiqueta 100×30 (avanço 32 mm), 3 colunas → 7.125 etiquetas
 *   76 m, etiqueta 100×150 (avanço 152 mm), 1 coluna →   500 etiquetas
 *
 * 14× de diferença: por isso o rendimento não pode morar na categoria.
 */
export function ribbonLabelYield(
  ribbonMeters: number,
  feedMm: number,
  columns = 1
): number {
  const mm = num(ribbonMeters, 0) * 1000;
  const feed = num(feedMm, 0);
  const cols = Math.max(Math.floor(num(columns, 1)), 1);
  if (mm <= 0 || feed <= 0) return 0;
  return Math.floor((mm / feed) * cols);
}

/**
 * Custo de ribbon por etiqueta.
 *
 * Devolve 0 quando falta geometria — o motor então cai no
 * comportamento antigo (consumível da categoria escalado por
 * `areaFactor`), preservando o cadastro legado.
 */
export function ribbonCostPerLabel(input: {
  ribbonCost: number;
  ribbonMeters: number;
  feedMm: number;
  columns?: number;
}): number {
  const yieldLabels = ribbonLabelYield(input.ribbonMeters, input.feedMm, input.columns);
  if (yieldLabels <= 0) return 0;
  return num(input.ribbonCost, 0) / yieldLabels;
}

export interface PriceTierLike {
  minQuantity: string | number;
  unitPrice: string | number;
  label?: string | null;
}

export interface TierResolution {
  /** preço unitário da faixa aplicada */
  unitPrice: number;
  /** total da venda: unitário × quantidade */
  total: number;
  /** faixa escolhida, ou null quando caiu no preço padrão do produto */
  tier: PriceTierLike | null;
  /** quantidade mínima da menor faixa — abaixo disso a venda é recusada */
  minQuantity: number;
  /** true quando a quantidade pedida está abaixo do mínimo vendável */
  belowMinimum: boolean;
}

/**
 * Escolhe a faixa de preço para a quantidade pedida.
 *
 * Regra: vale a MAIOR faixa cujo mínimo é menor ou igual à quantidade.
 * Com faixas 50/100/250, pedir 180 aplica a de 100 — não a de 250, que
 * o cliente ainda não alcançou.
 *
 * `belowMinimum` sinaliza pedido abaixo da menor faixa (ex.: 20 un num
 * produto que só sai a partir de 50). Quem chama decide se recusa ou
 * cobra o mínimo; o motor não inventa preço nesse caso, porque vender
 * 20 etiquetas ao unitário de 1.000 é prejuízo garantido.
 *
 * Sem faixas cadastradas devolve o `fallbackUnitPrice` — todo produto
 * que já existia continua funcionando igual.
 */
export function resolvePriceTier(
  tiers: PriceTierLike[],
  quantity: number,
  fallbackUnitPrice: number
): TierResolution {
  const qty = Math.max(num(quantity, 0), 0);
  const sorted = [...tiers]
    .filter((t) => num(t.minQuantity, 0) > 0)
    .sort((a, b) => num(a.minQuantity) - num(b.minQuantity));

  if (sorted.length === 0) {
    return {
      unitPrice: fallbackUnitPrice,
      total: money2(fallbackUnitPrice * qty),
      tier: null,
      minQuantity: 0,
      belowMinimum: false,
    };
  }

  const minQuantity = num(sorted[0].minQuantity);
  /* `reduce` em vez de `findLast`: a lista já está ordenada, então o
     último que couber é o correto, e evitamos depender de lib nova. */
  const applicable = sorted.reduce<PriceTierLike | null>(
    (acc, t) => (qty >= num(t.minQuantity) ? t : acc),
    null
  );

  if (!applicable) {
    /* Abaixo do mínimo: devolvemos o preço da menor faixa para a tela
       ter o que mostrar, mas com a flag ligada. */
    return {
      unitPrice: num(sorted[0].unitPrice),
      total: money2(num(sorted[0].unitPrice) * qty),
      tier: sorted[0],
      minQuantity,
      belowMinimum: true,
    };
  }

  const unitPrice = num(applicable.unitPrice);
  return {
    unitPrice,
    total: money2(unitPrice * qty),
    tier: applicable,
    minQuantity,
    belowMinimum: false,
  };
}

export function formatMoney(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(v) ? v : 0);
}
