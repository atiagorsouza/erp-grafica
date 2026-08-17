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
}
export interface MaterialLike {
  name?: string | null;
  unit?: string | null;
  unitCost: string | number | null;
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
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

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
  colorMode: ColorMode;
  pagesPerUnit: number; // páginas/impressões por unidade de produto
  copies: number; // vias/copias por unidade
  baseMaterial?: MaterialLike | null;
  baseMaterialQty: number;
  finishings: FinishingLine[];
  extraMaterials: MaterialLine[];
  service?: ServiceLike | null;
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

  // 1) IMPRESSÃO -----------------------------------------------------
  let printing = 0;
  if (input.printer && input.category) {
    const perPage = printerCostPerPage(
      input.printer,
      input.category,
      input.consumables,
      input.colorMode
    );
    printing = perPage * num(input.pagesPerUnit) * num(input.copies);
    lines.push({
      label: "Impressão",
      detail: `${num(input.copies)} via(s) × ${num(input.pagesPerUnit)} pg × ${formatMoney(
        perPage
      )}/pg (${input.colorMode === "color" ? "colorido" : "P&B"})`,
      amount: printing,
    });
  } else if (input.category) {
    const perPage = categoryCostPerPage(
      input.category,
      input.consumables,
      input.colorMode
    );
    printing = perPage * num(input.pagesPerUnit) * num(input.copies);
    lines.push({
      label: "Impressão (categoria)",
      detail: `${num(input.copies)} via(s) × ${num(input.pagesPerUnit)} pg × ${formatMoney(
        perPage
      )}/pg`,
      amount: printing,
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
    serviceCost = num(input.service.baseCost);
    lines.push({
      label: `Serviço: ${input.service.name}`,
      detail: input.service.type === "terceirizado" ? "Terceirizado" : "Próprio",
      amount: serviceCost,
    });
  }

  const baseCost = printing + materials + finishing + serviceCost;

  // 6) MARGEM -------------------------------------------------------
  // preço de venda = baseCost / (1 - margin)
  const margin = Math.min(Math.max(num(input.margin), 0), 0.99);
  const sellPrice = baseCost > 0 ? baseCost / (1 - margin) : 0;
  const marginAmount = sellPrice - baseCost;

  // 7) IMPOSTOS + TAXA DE MAQUININHA (sobre o preço de venda) -------
  const taxAmount = sellPrice * num(input.taxRate);
  const cardFeeAmount = sellPrice * num(input.cardFeeRate);
  const finalPrice = sellPrice + taxAmount + cardFeeAmount;

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

/** Arredonda preço comercial para cima no degrau informado. */
export function roundCommercialPrice(value: number, step = 0.01): number {
  const safeStep = Math.max(num(step, 0.01), 0.01);
  return Math.ceil((value - 1e-9) / safeStep) * safeStep;
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
  const sheetsByWaste = Math.ceil(baseSheets * (1 + Math.max(num(input.wastePercent), 0)));
  const sheetsBySetup = baseSheets + Math.max(Math.floor(num(input.setupSheets)), 0);
  const finalSheets = Math.max(sheetsByWaste, sheetsBySetup);
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
  if (printing > 0 || finalSheets > 0) {
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

  const service = input.service ? num(input.service.baseCost) : 0;
  if (input.service && service > 0) {
    lines.push({
      label: `Serviço: ${input.service.name}`,
      detail: "Custo fixo do lote",
      amount: service,
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

export function formatMoney(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(v) ? v : 0);
}
