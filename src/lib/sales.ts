import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  sales,
  products,
  productMaterials,
  productPriceTiers,
  pricingTables,
  materials,
  stockMovements,
  transactions,
  cashSessions,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { upsertAutoTransaction } from "@/lib/finance";
import { todayISO, toLocalISODate } from "@/lib/period";
import { getPricingDefaults } from "@/lib/settings";
import {
  applyDiscount,
  cardFeeAmount,
  round2,
  toDecimalString,
  toNumber,
  toPositive,
} from "@/lib/money";
import { resolvePriceTier } from "@/lib/pricing";
import { estimatePricingTableCost } from "@/lib/pricing-tables";

/* ==================================================================
 *  VALIDAÇÃO (Zod)
 * ================================================================== */

const finiteNumber = z.coerce.number().finite();

export const saleItemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  /* Linha de tabela de preço (DTF UV, Lona...) vendida direto no
     balcão. Como o `productId`, o servidor resolve o valor no banco —
     o preço que vem do cliente é ignorado. */
  pricingTableId: z.coerce.number().int().positive().nullable().optional(),
  /* Quantas peças cabem na folha NESTA venda. Depende do tamanho da
     estampa, não da folha: 6 canecas ou 30 chaveiros na mesma 20×28.
     Zerado, usa a referência cadastrada na linha da tabela. */
  piecesPerSheet: z.coerce.number().finite().min(0).max(1_000_000).optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(200),
  quantity: finiteNumber
    .min(0.001, "Quantidade deve ser de ao menos 0,001")
    .max(1_000_000),
  unitPrice: finiteNumber.min(0, "Preço não pode ser negativo").max(10_000_000),
});

export const paymentSchema = z.object({
  method: z.string().trim().min(1).max(40),
  amount: finiteNumber.min(0).max(10_000_000),
});

export const saleInputSchema = z.object({
  clientRef: z.string().trim().min(8).max(64).optional(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  type: z.enum(["produto", "servico", "mixto"]).default("produto"),
  items: z.array(saleItemSchema).min(1, "Carrinho vazio"),
  discount: finiteNumber.min(0).default(0),
  discountMode: z.enum(["value", "percent"]).default("value"),
  /* frete cotado na SuperFrete (v3.12.0) */
  shippingFee: finiteNumber.min(0).max(100_000).default(0),
  shippingService: z.string().trim().max(80).nullable().optional(),
  shippingServiceId: z.coerce.number().int().positive().nullable().optional(),
  paymentMethod: z.string().trim().max(40).nullable().optional(),
  payments: z.array(paymentSchema).optional(),
  receivedAmount: finiteNumber.min(0).optional(),
  cashSessionId: z.coerce.number().int().positive().nullable().optional(),
  allowNegativeStock: z.boolean().default(false),
  sellerName: z.string().trim().max(100).optional(),
  /* Vendedor cadastrado: é o que liga a venda ao extrato de comissão.
     Opcional porque venda de balcão sem vendedor definido continua
     válida — nem toda venda tem comissão. */
  sellerId: z.coerce.number().int().positive().nullable().optional(),
  deliveryMode: z.string().trim().max(100).optional(),
  deliveryDate: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type SaleInput = z.infer<typeof saleInputSchema>;
export type SaleError = { error: string; status: number; details?: unknown };

/** Estoque acabou entre a conferência e a gravação (corrida). */
class StockConflict extends Error {
  constructor(public shortages: { name: string; available: number; required: number }[]) {
    super("Estoque insuficiente");
    this.name = "StockConflict";
  }
}

const CARD_METHODS = new Set(["Débito", "Crédito"]);
const KNOWN_METHODS = new Set(["PIX", "Dinheiro", "Débito", "Crédito"]);

type ProductRow = typeof products.$inferSelect;

type ResolvedLine = {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  product?: ProductRow;
};

/* ==================================================================
 *  CRIAÇÃO DE VENDA
 * ================================================================== */

export async function createSale(raw: unknown) {
  const parsed = saleInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
      status: 400,
      details: parsed.error.flatten(),
    } satisfies SaleError;
  }
  const input = parsed.data;
  const defaults = await getPricingDefaults();

  /* ---------- 1. políticas do PDV ---------- */
  if (defaults.pdv_require_customer && !input.customerId) {
    return {
      error: "Identifique o cliente antes de finalizar a venda",
      status: 422,
    } satisfies SaleError;
  }

  /* ---------- 2. idempotência ---------- */
  if (input.clientRef) {
    const [existing] = await db.select().from(sales).where(eq(sales.clientRef, input.clientRef));
    if (existing) return { ok: true as const, row: existing, duplicated: true };
  }

  /* ---------- 3. preço vem do BANCO ---------- */
  const productIds = [
    ...new Set(input.items.map((i) => i.productId).filter((id): id is number => !!id)),
  ];
  const productMap = new Map<number, ProductRow>();
  const tierMap = new Map<number, { minQuantity: string; unitPrice: string }[]>();
  if (productIds.length > 0) {
    const rows = await db.select().from(products).where(inArray(products.id, productIds));
    for (const row of rows) productMap.set(row.id, row);

    /* Faixas por quantidade (v3.34.0): etiqueta e brinde são vendidos em
       lote, e o unitário cai conforme a quantidade. Sem isso o PDV
       cobrava o preço de 50 un numa venda de 1.000. */
    const tierRows = await db
      .select()
      .from(productPriceTiers)
      .where(inArray(productPriceTiers.productId, productIds));
    for (const t of tierRows) {
      const list = tierMap.get(t.productId) || [];
      list.push({ minQuantity: t.minQuantity, unitPrice: t.unitPrice });
      tierMap.set(t.productId, list);
    }
  }

  /* Linhas de tabela referenciadas na venda: preço vem do banco. */
  const tableIds = [
    ...new Set(input.items.map((i) => i.pricingTableId).filter((id): id is number => !!id)),
  ];
  const tableMap = new Map<number, typeof pricingTables.$inferSelect>();
  if (tableIds.length > 0) {
    const rows = await db.select().from(pricingTables).where(inArray(pricingTables.id, tableIds));
    for (const row of rows) tableMap.set(row.id, row);
  }

  const validLines: ResolvedLine[] = [];
  let hasProduct = false;
  let hasServiceLike = false;

  for (const item of input.items) {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    if (item.productId && !product) {
      return { error: `Produto ${item.productId} não encontrado`, status: 422 } satisfies SaleError;
    }
    if (product && product.active === false) {
      return { error: `Produto "${product.name}" está inativo`, status: 422 } satisfies SaleError;
    }

    /* Linha de tabela: resolve preço de VENDA no servidor. */
    const tableRow = item.pricingTableId ? tableMap.get(item.pricingTableId) : undefined;
    if (item.pricingTableId && !tableRow) {
      return { error: `Linha de tabela ${item.pricingTableId} não encontrada`, status: 422 } satisfies SaleError;
    }
    if (tableRow && tableRow.active === false) {
      return { error: `"${tableRow.label}" está arquivada`, status: 422 } satisfies SaleError;
    }
    if (tableRow && toNumber(tableRow.sellPrice, 0) <= 0) {
      return {
        error: `"${tableRow.label}" não tem preço de venda definido — use apenas para compor produtos`,
        status: 422,
      } satisfies SaleError;
    }

    const quantityForTier = toPositive(item.quantity);
    const productTiers = product ? tierMap.get(product.id) || [] : [];
    /* A faixa manda sobre o `finalPrice` quando existe: o preço de
       tabela do produto é o do lote mínimo. */
    const tierResult = product && productTiers.length > 0
      ? resolvePriceTier(productTiers, quantityForTier, toNumber(product.finalPrice, 0))
      : null;

    if (tierResult?.belowMinimum) {
      return {
        error: `Produto "${product!.name}" tem venda mínima de ${tierResult.minQuantity} un (pedido: ${quantityForTier})`,
        status: 422,
      } satisfies SaleError;
    }

    /* Em m² o total depende da ÁREA, não só da quantidade — então o
       unitário é derivado do total calculado pelo motor da tabela. */
    let tableUnitPrice = 0;
    if (tableRow) {
      const qty = toPositive(item.quantity);
      const effective = item.piecesPerSheet && item.piecesPerSheet > 0
        ? { ...tableRow, piecesPerSheet: String(item.piecesPerSheet) }
        : tableRow;
      const total = estimatePricingTableCost(effective, qty, undefined, undefined, "sell");
      tableUnitPrice = qty > 0 ? total / qty : 0;
    }

    const unitPrice = tableRow
      ? tableUnitPrice
      : tierResult
        ? tierResult.unitPrice
        : product
          ? toNumber(product.finalPrice, 0)
          : toPositive(item.unitPrice);
    if (product && unitPrice <= 0) {
      return {
        error: `Produto "${product.name}" está sem preço final definido`,
        status: 422,
      } satisfies SaleError;
    }
    if (!product && !tableRow && unitPrice <= 0) {
      return { error: `Item "${item.description}" sem preço`, status: 422 } satisfies SaleError;
    }

    const quantity = toPositive(item.quantity);
    if (product) hasProduct = true;
    else hasServiceLike = true;

    validLines.push({
      productId: item.productId ?? null,
      description: product ? String(product.name) : tableRow ? String(tableRow.label) : item.description,
      quantity,
      unitPrice: round2(unitPrice),
      total: round2(unitPrice * quantity),
      product,
    });
  }

  const saleType =
    hasProduct && hasServiceLike ? "mixto" : hasServiceLike ? "servico" : input.type || "produto";

  /* ---------- 4. totais no servidor ---------- */
  const subtotal = round2(validLines.reduce((sum, l) => sum + l.total, 0));
  const discount = applyDiscount(subtotal, input.discount, input.discountMode);
  /* O frete entra no líquido: o cliente paga produto + entrega, e a taxa
     de cartão incide sobre o valor realmente cobrado. */
  const shippingFee = round2(toPositive(input.shippingFee));
  const net = round2(subtotal - discount + shippingFee);

  const payments =
    input.payments && input.payments.length > 0
      ? input.payments
          .map((p) => ({ method: p.method.trim(), amount: round2(toPositive(p.amount)) }))
          .filter((p) => p.method && p.amount > 0)
      : [
          {
            method: (input.paymentMethod || "PIX").trim() || "PIX",
            amount: net, // taxa de cartão é adicionada depois
          },
        ];

  if (payments.length === 0) {
    return { error: "Informe ao menos uma forma de pagamento", status: 422 } satisfies SaleError;
  }

  for (const p of payments) {
    if (!KNOWN_METHODS.has(p.method)) {
      return { error: `Forma de pagamento inválida: ${p.method}`, status: 422 } satisfies SaleError;
    }
  }

  const methods = payments.map((p) => p.method);

  /* taxa de maquininha só sobre a parcela em cartão, com gross-up */
  let fee = 0;
  const pricedPayments = payments.map((p) => {
    if (!CARD_METHODS.has(p.method)) return { ...p };
    const rate = p.method === "Crédito" ? defaults.cardFeeCreditRate : defaults.cardFeeRate;
    const lineFee = rate > 0 ? cardFeeAmount(p.amount, rate) : 0;
    fee = round2(fee + lineFee);
    return { method: p.method, amount: round2(p.amount + lineFee) };
  });

  /* se pagamento único sem split explícito, base da taxa é o líquido */
  if (!input.payments?.length && CARD_METHODS.has(methods[0])) {
    const rate = methods[0] === "Crédito" ? defaults.cardFeeCreditRate : defaults.cardFeeRate;
    fee = rate > 0 ? cardFeeAmount(net, rate) : 0;
    pricedPayments[0] = { method: methods[0], amount: round2(net + fee) };
  } else if (input.payments?.length) {
    const paySum = round2(payments.reduce((s, p) => s + p.amount, 0));
    if (Math.abs(paySum - net) > 0.05) {
      return {
        error: `Soma dos pagamentos (${paySum.toFixed(2)}) difere do líquido (${net.toFixed(2)})`,
        status: 422,
      } satisfies SaleError;
    }
  }

  const total = round2(net + fee);

  /* Venda de R$ 0,00 não é venda: polui o caixa, o ticket médio e o
     Financeiro com lançamentos vazios. Antes da v3.14.0 um desconto
     maior que o subtotal (ou quantidade 0,0001) gerava cupom zerado. */
  if (total <= 0) {
    return {
      error:
        discount >= subtotal && subtotal > 0
          ? "Desconto não pode zerar a venda. Para brinde ou bonificação, use um lançamento próprio."
          : "O total da venda precisa ser maior que zero",
      status: 422,
    } satisfies SaleError;
  }

  /* imposto por dentro — apenas registro, não soma no total */
  const taxRate = toNumber(defaults.taxRate, 0);
  const taxes = taxRate > 0 && taxRate < 1 ? round2(net - net / (1 + taxRate)) : 0;

  /* ---------- 5. troco ---------- */
  const isCash = methods.includes("Dinheiro");
  const cashPortion = pricedPayments
    .filter((p) => p.method === "Dinheiro")
    .reduce((s, p) => s + p.amount, 0);
  /* Dinheiro exige valor recebido explícito do operador (para troco). */
  const received = input.receivedAmount !== undefined ? toPositive(input.receivedAmount) : null;

  if (isCash) {
    if (received == null || received <= 0) {
      return { error: "Informe o valor recebido em dinheiro", status: 422 } satisfies SaleError;
    }
    if (received + 0.001 < cashPortion) {
      return {
        error: `Valor recebido (${received.toFixed(2)}) é menor que a parcela em dinheiro (${cashPortion.toFixed(2)})`,
        status: 422,
      } satisfies SaleError;
    }
  }
  const change = isCash && received != null ? round2(Math.max(0, received - cashPortion)) : null;

  /* ---------- 6. estoque ---------- */
  const allowOversell = input.allowNegativeStock || defaults.pdv_allow_negative_stock;
  const shortages = await checkStock(validLines);
  if (shortages.length > 0 && !allowOversell) {
    return {
      error: `Estoque insuficiente: ${shortages
        .map((s) => `${s.name} (tem ${s.available}, precisa de ${s.required})`)
        .join("; ")}`,
      status: 409,
      details: { shortages },
    } satisfies SaleError;
  }

  /* ---------- 7. sessão de caixa ---------- */
  let cashSessionId = input.cashSessionId ?? null;
  if (cashSessionId) {
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.id, cashSessionId), eq(cashSessions.status, "aberto")))
      .limit(1);
    if (!session) {
      return { error: "Sessão de caixa inválida ou já fechada", status: 409 } satisfies SaleError;
    }
  } else {
    const [open] = await db
      .select()
      .from(cashSessions)
      .where(eq(cashSessions.status, "aberto"))
      .limit(1);
    cashSessionId = open?.id ?? null;
  }

  if (defaults.pdv_require_open_cash && !cashSessionId) {
    return {
      error: "Abra o caixa antes de registrar vendas",
      status: 409,
      details: { code: "CASH_CLOSED" },
    } satisfies SaleError;
  }

  /* ---------- 8. gravação atômica ---------- */
  const number = await nextDocumentNumber("sale");

  try {
    const row = await db.transaction(async (tx) => {
      /* trava e reconfere: entre o check inicial e este ponto outra
         venda pode ter consumido o saldo */
      if (!allowOversell) {
        const locked = await assertStockLocked(tx, validLines);
        if (locked.length > 0) {
          throw new StockConflict(locked);
        }
      }

      const [sale] = await tx
        .insert(sales)
        .values({
          number,
          clientRef: input.clientRef ?? null,
          customerId: input.customerId ?? null,
          type: saleType,
          items: validLines.map(({ productId, description, quantity, unitPrice, total: lineTotal }) => ({
            productId,
            description,
            quantity,
            unitPrice,
            total: lineTotal,
          })),
          subtotal: toDecimalString(subtotal),
          discount: toDecimalString(discount),
          taxes: toDecimalString(taxes),
          cardFee: toDecimalString(fee),
          shippingFee: toDecimalString(shippingFee),
          shippingService: input.shippingService ?? null,
          shippingServiceId: input.shippingServiceId ?? null,
          total: toDecimalString(total),
          paymentMethod: methods.join(" + "),
          payments: pricedPayments,
          receivedAmount: received != null ? toDecimalString(received, 2) : null,
          changeAmount: change != null ? toDecimalString(change, 2) : null,
          sellerName: (input.sellerName || defaults.pdv_seller_default || null) as string | null,
          sellerId: input.sellerId ?? null,
          deliveryMode: (input.deliveryMode || defaults.pdv_delivery_default || null) as string | null,
          deliveryDate: input.deliveryDate ?? null,
          notes: input.notes ?? null,
          cashSessionId,
          status: "concluida",
        })
        .returning();

      await applyStockExit(tx, validLines, number);

      const onCredit = methods.includes("Crédito") && methods.every((m) => m === "Crédito");
      const today = todayISO();
      const settleDate = onCredit
        ? toLocalISODate(Date.now() + 30 * 864e5)
        : today;

      /* receita líquida da loja (sem taxa de adquirente) */
      await upsertAutoTransaction(tx, {
        type: "receita",
        category: "venda",
        description: `Venda ${number}${input.customerId ? "" : " · consumidor final"}`,
        amount: net,
        dueDate: settleDate,
        paidDate: onCredit ? null : today,
        status: onCredit ? "pendente" : "pago",
        method: methods.join(" + "),
        customerId: input.customerId ?? null,
        saleId: sale.id,
        cashSessionId,
      });

      /* taxa de cartão como despesa operacional (se houver) */
      if (fee > 0) {
        await upsertAutoTransaction(tx, {
          type: "despesa",
          category: "taxa_cartao",
          description: `Taxa de cartão · venda ${number}`,
          amount: fee,
          dueDate: today,
          paidDate: today,
          status: "pago",
          method: methods.filter((m) => CARD_METHODS.has(m)).join(" + ") || "Cartão",
          customerId: input.customerId ?? null,
          saleId: sale.id,
          cashSessionId,
        });
      }

      return sale;
    });

    return {
      ok: true as const,
      row,
      warnings: shortages.length ? { shortages } : undefined,
    };
  } catch (e) {
    if (e instanceof StockConflict) {
      return {
        error: `Estoque insuficiente: ${e.shortages
          .map((x) => `${x.name} (tem ${x.available}, precisa de ${x.required})`)
          .join("; ")}`,
        status: 409,
        details: { shortages: e.shortages, code: "STOCK_RACE" },
      } satisfies SaleError;
    }
    if (input.clientRef && String(e).toLowerCase().includes("client_ref")) {
      const [existing] = await db.select().from(sales).where(eq(sales.clientRef, input.clientRef));
      if (existing) return { ok: true as const, row: existing, duplicated: true };
    }
    throw e;
  }
}

/* ==================================================================
 *  ESTOQUE
 * ================================================================== */

type Line = { productId: number | null; quantity: number; product?: ProductRow };

async function checkStock(lines: Line[]) {
  const needProduct = new Map<number, number>();
  const needMaterial = new Map<number, number>();
  const productIds = lines.map((l) => l.product?.id).filter((id): id is number => !!id);

  const extrasByProduct = new Map<number, { materialId: number | null; quantity: string | null }[]>();
  if (productIds.length > 0) {
    const extras = await db
      .select()
      .from(productMaterials)
      .where(inArray(productMaterials.productId, productIds));
    for (const extra of extras) {
      const list = extrasByProduct.get(extra.productId) || [];
      list.push(extra);
      extrasByProduct.set(extra.productId, list);
    }
  }

  for (const line of lines) {
    const product = line.product;
    if (!product) continue;
    if (product.trackStock) {
      needProduct.set(product.id, (needProduct.get(product.id) || 0) + line.quantity);
    }
    if (product.baseMaterialId) {
      const used = toNumber(product.baseMaterialQty, 0) * line.quantity;
      if (used > 0) {
        needMaterial.set(
          product.baseMaterialId,
          (needMaterial.get(product.baseMaterialId) || 0) + used
        );
      }
    }
    for (const extra of extrasByProduct.get(product.id) || []) {
      const used = toNumber(extra.quantity, 0) * line.quantity;
      if (used > 0 && extra.materialId) {
        needMaterial.set(extra.materialId, (needMaterial.get(extra.materialId) || 0) + used);
      }
    }
  }

  const shortages: { name: string; available: number; required: number }[] = [];

  for (const [id, required] of needProduct) {
    const [row] = await db.select().from(products).where(eq(products.id, id));
    const available = toNumber(row?.stock, 0);
    if (available + 1e-9 < required) {
      shortages.push({
        name: String(row?.name || `Produto ${id}`),
        available: round2(available),
        required: round2(required),
      });
    }
  }
  for (const [id, required] of needMaterial) {
    const [row] = await db.select().from(materials).where(eq(materials.id, id));
    const available = toNumber(row?.stock, 0);
    if (available + 1e-9 < required) {
      shortages.push({
        name: String(row?.name || `Material ${id}`),
        available: round2(available),
        required: round2(required),
      });
    }
  }
  return shortages;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reconfere o estoque DENTRO da transação, travando as linhas com
 * `FOR UPDATE`.
 *
 * Bug corrigido na v3.14.0 (TOCTOU — time-of-check to time-of-use):
 * `checkStock` rodava fora da transação, então duas vendas simultâneas
 * liam o mesmo saldo e ambas passavam. Teste com estoque 10 e cinco
 * vendas paralelas de 3 unidades: todas foram aceitas e o saldo
 * terminou em -5, mesmo com `allowNegativeStock: false`.
 *
 * Com `FOR UPDATE` a segunda transação espera a primeira terminar e
 * enxerga o saldo já debitado.
 */
async function assertStockLocked(tx: Tx, lines: Line[]) {
  const needProduct = new Map<number, number>();
  const needMaterial = new Map<number, number>();

  for (const line of lines) {
    const product = line.product;
    if (!product) continue;
    if (product.trackStock) {
      needProduct.set(product.id, (needProduct.get(product.id) || 0) + line.quantity);
    }
    if (product.baseMaterialId) {
      const used = toNumber(product.baseMaterialQty, 0) * line.quantity;
      if (used > 0) {
        needMaterial.set(
          product.baseMaterialId,
          (needMaterial.get(product.baseMaterialId) || 0) + used
        );
      }
    }
    const extras = await tx
      .select()
      .from(productMaterials)
      .where(eq(productMaterials.productId, product.id));
    for (const extra of extras) {
      const used = toNumber(extra.quantity, 0) * line.quantity;
      if (used > 0 && extra.materialId) {
        needMaterial.set(extra.materialId, (needMaterial.get(extra.materialId) || 0) + used);
      }
    }
  }

  const shortages: { name: string; available: number; required: number }[] = [];

  for (const [id, required] of needProduct) {
    const locked = await tx.execute(
      sql`select name, stock from products where id = ${id} for update`
    );
    const row = (locked as unknown as { rows?: { name?: string; stock?: string }[] }).rows?.[0];
    const available = toNumber(row?.stock, 0);
    if (available + 1e-9 < required) {
      shortages.push({
        name: String(row?.name || `Produto ${id}`),
        available: round2(available),
        required: round2(required),
      });
    }
  }

  for (const [id, required] of needMaterial) {
    const locked = await tx.execute(
      sql`select name, stock from materials where id = ${id} for update`
    );
    const row = (locked as unknown as { rows?: { name?: string; stock?: string }[] }).rows?.[0];
    const available = toNumber(row?.stock, 0);
    if (available + 1e-9 < required) {
      shortages.push({
        name: String(row?.name || `Material ${id}`),
        available: round2(available),
        required: round2(required),
      });
    }
  }

  return shortages;
}

async function applyStockExit(tx: Tx, lines: Line[], reference: string) {
  for (const line of lines) {
    const product = line.product;
    if (!product || line.quantity <= 0) continue;

    if (product.trackStock) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}` })
        .where(eq(products.id, product.id));
      await tx.insert(stockMovements).values({
        kind: "saida",
        targetType: "product",
        productId: product.id,
        quantity: String(line.quantity),
        reason: "venda",
        reference,
        automatic: true,
      });
    }

    if (product.baseMaterialId) {
      const used = toNumber(product.baseMaterialQty, 0) * line.quantity;
      if (used > 0) {
        await tx
          .update(materials)
          .set({ stock: sql`${materials.stock} - ${used}` })
          .where(eq(materials.id, product.baseMaterialId));
        await tx.insert(stockMovements).values({
          kind: "saida",
          targetType: "material",
          materialId: product.baseMaterialId,
          quantity: String(used),
          reason: "venda",
          reference,
          automatic: true,
        });
      }
    }

    const extras = await tx
      .select()
      .from(productMaterials)
      .where(eq(productMaterials.productId, product.id));
    for (const extra of extras) {
      const used = toNumber(extra.quantity, 0) * line.quantity;
      if (used <= 0 || !extra.materialId) continue;
      await tx
        .update(materials)
        .set({ stock: sql`${materials.stock} - ${used}` })
        .where(eq(materials.id, extra.materialId));
      await tx.insert(stockMovements).values({
        kind: "saida",
        targetType: "material",
        materialId: extra.materialId,
        quantity: String(used),
        reason: "venda",
        reference,
        automatic: true,
      });
    }
  }
}

/* ==================================================================
 *  CANCELAMENTO COM ESTORNO
 * ================================================================== */

export async function cancelSale(saleId: number, reason: string) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    return { error: "Informe o motivo do cancelamento", status: 400 } satisfies SaleError;
  }

  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId));
  if (!sale) return { error: "Venda não encontrada", status: 404 } satisfies SaleError;
  if (sale.status === "cancelada") {
    return { error: "Venda já está cancelada", status: 409 } satisfies SaleError;
  }

  await db.transaction(async (tx) => {
    const movements = await tx
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.reference, sale.number), eq(stockMovements.kind, "saida")));

    for (const mv of movements) {
      const qty = toNumber(mv.quantity, 0);
      if (qty <= 0) continue;
      if (mv.targetType === "product" && mv.productId) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${qty}` })
          .where(eq(products.id, mv.productId));
      } else if (mv.targetType === "material" && mv.materialId) {
        await tx
          .update(materials)
          .set({ stock: sql`${materials.stock} + ${qty}` })
          .where(eq(materials.id, mv.materialId));
      }
      await tx.insert(stockMovements).values({
        kind: "entrada",
        targetType: mv.targetType,
        productId: mv.productId,
        materialId: mv.materialId,
        quantity: String(qty),
        reason: "devolucao",
        reference: sale.number,
        notes: `Estorno do cancelamento: ${cleanReason}`,
        automatic: true,
      });
    }

    const netRevenue = round2(toNumber(sale.total, 0) - toNumber(sale.cardFee, 0));
    const fee = toNumber(sale.cardFee, 0);
    const today = todayISO();

    /* estorna a receita (despesa de estorno), vinculada à venda */
    await upsertAutoTransaction(tx, {
      type: "despesa",
      category: "estorno",
      description: `Cancelamento da venda ${sale.number} — ${cleanReason}`,
      amount: netRevenue,
      dueDate: today,
      paidDate: today,
      status: "pago",
      method: sale.paymentMethod,
      customerId: sale.customerId,
      saleId: sale.id,
      cashSessionId: sale.cashSessionId,
    });

    /* se havia taxa de cartão lançada, estorna como receita (devolução da despesa) */
    if (fee > 0) {
      await upsertAutoTransaction(tx, {
        type: "receita",
        category: "estorno_taxa",
        description: `Estorno taxa cartão · venda ${sale.number}`,
        amount: fee,
        dueDate: today,
        paidDate: today,
        status: "pago",
        method: sale.paymentMethod,
        customerId: sale.customerId,
        saleId: sale.id,
        cashSessionId: sale.cashSessionId,
      });
    }

    await tx
      .update(sales)
      .set({ status: "cancelada", canceledAt: new Date(), cancelReason: cleanReason })
      .where(eq(sales.id, saleId));
  });

  return { ok: true as const };
}
