import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { customers, kanbanCards, orders, productPriceTiers, products, quoteItems, quotes, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { getPricingDefaults } from "@/lib/settings";
import { applyDiscount, round2, toDecimalString, toNumber, toPositive } from "@/lib/money";
import { resolvePriceTier } from "@/lib/pricing";
import { toLocalISODate } from "@/lib/period";

export type QuoteError = { error: string; status: number; details?: unknown };

const finiteNumber = z.coerce.number().finite();
const quoteStatus = z.enum(["rascunho", "enviado", "aprovado", "recusado", "expirado"]);

const itemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(240),
  quantity: finiteNumber.positive("Quantidade deve ser maior que zero").max(1_000_000),
  unitPrice: finiteNumber.min(0, "Preço não pode ser negativo").max(10_000_000),
});

const quotePayload = z.object({
  customerId: z.coerce.number().int().positive().nullable().optional(),
  status: quoteStatus.optional(),
  validUntil: z.string().trim().nullable().optional(),
  items: z.array(itemSchema).optional(),
  discount: finiteNumber.min(0).optional(),
  /* Percentual acima de 100 zerava (ou invertia) a proposta. O teto é
     validado depois do parse, porque depende do modo escolhido. */
  discountMode: z.enum(["value", "percent"]).optional().default("value"),
  /* Reabrir um orçamento aprovado para renegociação exige intenção
     explícita — ver `assertEditable`. */
  reopen: z.boolean().optional(),
  shippingFee: finiteNumber.min(0).optional(),
  taxes: finiteNumber.min(0).optional(),
  paymentMethod: z.string().trim().max(120).optional(),
  channel: z.string().trim().max(80).optional(),
  sellerName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
});

type QuotePayload = z.infer<typeof quotePayload>;
type QuoteItem = z.infer<typeof itemSchema> & { total: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type QuoteDefaults = {
  validityDays: number;
  payment: string;
  seller: string;
  notes: string;
};

async function getQuoteDefaults(): Promise<QuoteDefaults> {
  const rows = await db.select().from(settings).where(eq(settings.category, "orcamentos"));
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));
  return {
    validityDays: Math.max(1, Math.min(365, Number(map.get("quote_validity_days") || 10))),
    payment: map.get("quote_default_payment") || "PIX",
    seller: map.get("quote_default_seller") || "OPERADOR",
    notes: map.get("quote_default_notes") || "Validade conforme prazo informado. Produção inicia após aprovação.",
  };
}

function parse(raw: unknown): { ok: true; data: QuotePayload } | QuoteError {
  const parsed = quotePayload.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
      status: 400,
      details: parsed.error.flatten(),
    };
  }
  return { ok: true, data: parsed.data };
}

function normalizeItems(input: QuotePayload["items"] | QuoteItem[]): QuoteItem[] {
  return (input || []).map((i) => {
    const quantity = toPositive(i.quantity, 1);
    const unitPrice = round2(toPositive(i.unitPrice, 0));
    return {
      productId: i.productId ? Number(i.productId) : null,
      serviceId: i.serviceId ? Number(i.serviceId) : null,
      description: String(i.description || "Item avulso").trim(),
      quantity,
      unitPrice,
      total: round2(quantity * unitPrice),
    };
  });
}

function calcTotals(items: QuoteItem[], discountRaw: unknown, discountMode: "value" | "percent", shippingRaw: unknown, taxesRaw: unknown) {
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discount = applyDiscount(subtotal, discountRaw, discountMode);
  const shippingFee = toPositive(shippingRaw, 0);
  const taxes = toPositive(taxesRaw, 0);
  const total = round2(subtotal - discount + shippingFee + taxes);
  return { subtotal, discount, shippingFee, taxes, total };
}

async function saveItemsTx(tx: Tx, quoteId: number, items: QuoteItem[]) {
  await tx.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  for (const it of items) {
    await tx.insert(quoteItems).values({
      quoteId,
      description: it.description,
      productId: it.productId || null,
      serviceId: it.serviceId || null,
      quantity: toDecimalString(it.quantity, 3),
      unitPrice: toDecimalString(it.unitPrice, 4),
      total: toDecimalString(it.total, 4),
    });
  }
}

async function loadItems(quoteId: number): Promise<QuoteItem[]> {
  const rows = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  return rows.map((i) => ({
    productId: i.productId,
    serviceId: i.serviceId,
    description: i.description,
    quantity: toNumber(i.quantity, 1),
    unitPrice: toNumber(i.unitPrice, 0),
    total: toNumber(i.total, 0),
  }));
}

async function customerName(customerId: number | null) {
  if (!customerId) return "Consumidor final";
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return customer ? customer.tradeName || customer.name : "Consumidor final";
}

async function syncKanbanForQuote(tx: Tx, quote: typeof quotes.$inferSelect, items: QuoteItem[]) {
  const [existingOrder] = await tx.select().from(orders).where(eq(orders.quoteId, quote.id)).limit(1);
  if (existingOrder) return;

  const [existing] = await tx.select().from(kanbanCards).where(eq(kanbanCards.quoteId, quote.id)).limit(1);

  if (quote.status !== "aprovado") {
    if (existing) {
      await tx
        .update(kanbanCards)
        .set({ column: quote.status === "recusado" || quote.status === "expirado" ? "cancelado" : "backlog", updatedAt: new Date() })
        .where(eq(kanbanCards.id, existing.id));
    }
    return;
  }

  const summary = items.slice(0, 3).map((i) => `${i.quantity}× ${i.description}`).join(" · ");
  const data = {
    title: `Orçamento ${quote.number}`,
    description: summary || "Orçamento aprovado — aguardando conversão em OS.",
    column: "backlog",
    customerId: quote.customerId || null,
    customerName: await customerName(quote.customerId),
    productId: items.find((i) => i.productId)?.productId || null,
    priority: "normal",
    quoteId: quote.id,
    estimatedValue: toDecimalString(quote.total, 2),
    dueDate: quote.validUntil || null,
    updatedAt: new Date(),
  };

  if (existing) await tx.update(kanbanCards).set(data).where(eq(kanbanCards.id, existing.id));
  else await tx.insert(kanbanCards).values(data);
}

/** Data de hoje no fuso da aplicação, em ISO curto. */
function todayLocalISO() {
  return toLocalISODate(new Date());
}

/**
 * Regras de valor comuns a criação e edição.
 *
 * Antes da v3.16.0 nada disso era checado: desconto de 500% ou maior
 * que o subtotal zerava a proposta, que virava pedido e receita de
 * R$ 0,00 marcada como paga no Financeiro.
 */
function assertTotals(
  totals: { subtotal: number; discount: number; total: number },
  discountRaw: unknown,
  mode: "value" | "percent"
): QuoteError | null {
  if (mode === "percent" && toNumber(discountRaw, 0) > 100) {
    return { error: "Desconto percentual não pode passar de 100%", status: 422 };
  }
  if (totals.discount > totals.subtotal) {
    return {
      error: `Desconto (${totals.discount.toFixed(2)}) não pode ser maior que o subtotal (${totals.subtotal.toFixed(2)})`,
      status: 422,
    };
  }
  if (totals.total <= 0) {
    return {
      error:
        totals.discount >= totals.subtotal && totals.subtotal > 0
          ? "Desconto não pode zerar o orçamento. Para cortesia, registre um lançamento próprio."
          : "O total do orçamento precisa ser maior que zero",
      status: 422,
    };
  }
  return null;
}

/** Validade no passado gerava proposta nascida vencida, sem aviso. */
function assertValidity(validUntil: string | null | undefined): QuoteError | null {
  if (!validUntil) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { error: "Data de validade inválida", status: 422 };
  }
  if (validUntil < todayLocalISO()) {
    return { error: "A validade do orçamento não pode ser uma data passada", status: 422 };
  }
  return null;
}

/**
 * Um orçamento aprovado é um acordo comercial: mudar valor por baixo
 * apagava o que o cliente aceitou. Alterar exige reabrir (`reopen`),
 * o que devolve a proposta para `rascunho` e registra a mudança.
 */
function assertEditable(
  current: typeof quotes.$inferSelect,
  d: QuotePayload,
  touchesMoney: boolean
): QuoteError | null {
  if (!touchesMoney) return null;
  if (current.status !== "aprovado") return null;
  if (d.reopen) return null;
  return {
    error:
      "Orçamento aprovado não pode ter valores alterados. Reabra para renegociação antes de editar.",
    status: 409,
    details: { code: "QUOTE_APPROVED_LOCKED" },
  };
}

/**
 * Confere o preço informado contra o catálogo e devolve os avisos.
 *
 * Diferente do PDV (onde o servidor sobrescreve o preço), aqui o valor
 * do vendedor é respeitado — orçamento é negociação e desconto de linha
 * é legítimo. O que faltava era o registro: agora a divergência fica
 * anotada em `notes` e volta na resposta para a tela mostrar.
 */
async function priceWarnings(items: QuoteItem[]): Promise<string[]> {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is number => !!x))];
  if (ids.length === 0) return [];

  const [rows, tierRows] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, finalPrice: products.finalPrice })
      .from(products)
      .where(inArray(products.id, ids)),
    db.select().from(productPriceTiers).where(inArray(productPriceTiers.productId, ids)),
  ]);
  const table = new Map(rows.map((r) => [r.id, r]));
  const tiers = new Map<number, { minQuantity: string; unitPrice: string }[]>();
  for (const t of tierRows) {
    const list = tiers.get(t.productId) || [];
    list.push({ minQuantity: t.minQuantity, unitPrice: t.unitPrice });
    tiers.set(t.productId, list);
  }

  const warnings: string[] = [];
  for (const it of items) {
    if (!it.productId) continue;
    const ref = table.get(it.productId);
    if (!ref) continue;

    /* Com faixas cadastradas, o preço de referência é o da faixa que a
       quantidade alcança — comparar com o `finalPrice` acusaria
       "desconto de 53%" num lote de 1.000 que na verdade está na
       tabela. O orçamento continua aceitando o valor do vendedor. */
    const productTiers = tiers.get(it.productId) || [];
    const resolved = productTiers.length > 0
      ? resolvePriceTier(productTiers, it.quantity, toNumber(ref.finalPrice, 0))
      : null;

    if (resolved?.belowMinimum) {
      warnings.push(
        `${ref.name}: ${it.quantity} un abaixo do mínimo de ${resolved.minQuantity} un`
      );
      continue;
    }

    const listed = resolved ? resolved.unitPrice : toNumber(ref.finalPrice, 0);
    if (listed <= 0) continue;
    /* 1 centavo de folga evita ruído de arredondamento */
    if (Math.abs(it.unitPrice - listed) < 0.01) continue;
    const pct = ((it.unitPrice - listed) / listed) * 100;
    const faixa = resolved?.tier ? ` [faixa ${resolved.tier.minQuantity}+]` : "";
    warnings.push(
      `${ref.name}: ${it.unitPrice.toFixed(2)} vs ${listed.toFixed(2)} de tabela${faixa} (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`
    );
  }
  return warnings;
}

export async function createQuote(raw: unknown) {
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const pricingDefaults = await getPricingDefaults();
  const quoteDefaults = await getQuoteDefaults();
  const items = normalizeItems(d.items || []);
  if (items.length === 0) return { error: "Adicione ao menos um item ao orçamento", status: 422 } satisfies QuoteError;

  const totals = calcTotals(items, d.discount ?? 0, d.discountMode || "value", d.shippingFee ?? 0, d.taxes ?? 0);

  const totalsError = assertTotals(totals, d.discount ?? 0, d.discountMode || "value");
  if (totalsError) return totalsError;

  const validityError = assertValidity(d.validUntil);
  if (validityError) return validityError;

  const warnings = await priceWarnings(items);

  const validUntil = d.validUntil || new Date(Date.now() + quoteDefaults.validityDays * 86400000).toISOString().slice(0, 10);

  /* O contador de documentos pode estar ATRASADO em relação aos números
     já gravados (importação da base curada, restore parcial, seed).
     Em vez de estourar 23505 no cliente, reagimos ao conflito gerando
     o próximo número e tentando de novo — até 3 vezes. */
  let row: typeof quotes.$inferSelect | undefined;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const number = await nextDocumentNumber("quote");
    try {
      row = await db.transaction(async (tx) => {
        const [quote] = await tx
          .insert(quotes)
          .values({
            number,
            customerId: d.customerId || null,
            status: d.status || "rascunho",
            validUntil,
            subtotal: toDecimalString(totals.subtotal),
            discount: toDecimalString(totals.discount),
            taxes: toDecimalString(totals.taxes),
            shippingFee: toDecimalString(totals.shippingFee),
            total: toDecimalString(totals.total),
            paymentMethod: d.paymentMethod || quoteDefaults.payment,
            channel: d.channel || "Atendimento",
            sellerName: d.sellerName || quoteDefaults.seller || pricingDefaults.pdv_seller_default || "OPERADOR",
            notes: d.notes || quoteDefaults.notes || null,
          })
          .returning();
        await saveItemsTx(tx, quote.id, items);
        await syncKanbanForQuote(tx, quote, items);
        return quote;
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "23505") throw e; // só conflito de número tenta de novo
    }
  }
  if (!row) throw new Error("Não foi possível gerar número único de orçamento após 3 tentativas.");

  return { ok: true as const, row, warnings };
}

export async function updateQuote(id: number, raw: unknown) {
  const [current] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!current) return { error: "Orçamento não encontrado", status: 404 } satisfies QuoteError;

  const [existingOrder] = await db.select().from(orders).where(eq(orders.quoteId, id)).limit(1);
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  if (existingOrder && (d.items || d.discount !== undefined || d.shippingFee !== undefined || d.taxes !== undefined)) {
    return { error: "Orçamento já convertido em Pedido/OS não pode alterar valores ou itens", status: 409 } satisfies QuoteError;
  }

  const hasItemsPatch = Array.isArray(d.items);
  const items = hasItemsPatch ? normalizeItems(d.items) : await loadItems(id);
  if (hasItemsPatch && items.length === 0) return { error: "Orçamento precisa ter ao menos um item", status: 422 } satisfies QuoteError;

  const shouldRecalc = hasItemsPatch || d.discount !== undefined || d.shippingFee !== undefined || d.taxes !== undefined;

  /* Acordo fechado não muda de valor sem reabertura explícita. */
  const editError = assertEditable(current, d, shouldRecalc);
  if (editError) return editError;

  const validityError = assertValidity(d.validUntil);
  if (validityError) return validityError;

  const totals = shouldRecalc
    ? calcTotals(
        items,
        d.discount !== undefined ? d.discount : current.discount,
        d.discountMode || "value",
        d.shippingFee !== undefined ? d.shippingFee : current.shippingFee,
        d.taxes !== undefined ? d.taxes : current.taxes
      )
    : null;

  if (totals) {
    const totalsError = assertTotals(
      totals,
      d.discount !== undefined ? d.discount : current.discount,
      d.discountMode || "value"
    );
    if (totalsError) return totalsError;
  }

  const warnings = shouldRecalc ? await priceWarnings(items) : [];

  const row = await db.transaction(async (tx) => {
    const patch: Partial<typeof quotes.$inferInsert> = {};
    if (d.customerId !== undefined) patch.customerId = d.customerId || null;
    if (d.status !== undefined) patch.status = d.status;

    /* Reabertura: volta para rascunho e deixa o rastro na proposta, para
       que ninguém precise adivinhar por que o valor aceito mudou. */
    if (d.reopen && current.status === "aprovado" && d.status === undefined) {
      patch.status = "rascunho";
      const stamp = new Date().toLocaleString("pt-BR");
      const trail = `REABERTO em ${stamp}: valor anterior R$ ${toNumber(current.total, 0).toFixed(2)}`;
      patch.notes = [d.notes ?? current.notes, trail].filter(Boolean).join("\n");
    }

    if (d.validUntil !== undefined) patch.validUntil = d.validUntil || null;
    if (d.paymentMethod !== undefined) patch.paymentMethod = d.paymentMethod || "PIX";
    if (d.channel !== undefined) patch.channel = d.channel || "Atendimento";
    if (d.sellerName !== undefined) patch.sellerName = d.sellerName || "OPERADOR";
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (totals) {
      patch.subtotal = toDecimalString(totals.subtotal);
      patch.discount = toDecimalString(totals.discount);
      patch.taxes = toDecimalString(totals.taxes);
      patch.shippingFee = toDecimalString(totals.shippingFee);
      patch.total = toDecimalString(totals.total);
    }

    const [quote] = await tx.update(quotes).set(patch).where(eq(quotes.id, id)).returning();
    if (hasItemsPatch) await saveItemsTx(tx, id, items);
    await syncKanbanForQuote(tx, quote, items);
    return quote;
  });

  return { ok: true as const, row, warnings };
}

export async function archiveQuote(id: number, reason = "Arquivado") {
  const [current] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!current) return { error: "Orçamento não encontrado", status: 404 } satisfies QuoteError;
  const [existingOrder] = await db.select().from(orders).where(eq(orders.quoteId, id)).limit(1);
  if (existingOrder) return { error: "Orçamento convertido em Pedido/OS não pode ser arquivado", status: 409 } satisfies QuoteError;
  const notes = [current.notes, `ARQUIVADO/RECUSADO: ${reason}`].filter(Boolean).join("\n");
  return updateQuote(id, { status: "recusado", notes });
}

/**
 * Marca como expirados os orçamentos enviados cuja validade já passou.
 *
 * Antes rodava só no `install.sh`/`update.sh`: entre dois deploys, uma
 * proposta vencida continuava exibida como "enviado" e inflava o funil
 * dos Relatórios. Agora a página `/orcamentos` chama isto a cada carga.
 *
 * Um UPDATE em lote (em vez de um `updateQuote` por linha) porque isto
 * roda a cada visita à página — e porque a mudança é só de status, sem
 * recálculo de valores.
 */
export async function expireStaleQuotes(): Promise<number> {
  const today = todayLocalISO();

  const stale = await db
    .update(quotes)
    .set({ status: "expirado" })
    .where(
      and(eq(quotes.status, "enviado"), isNotNull(quotes.validUntil), lt(quotes.validUntil, today))
    )
    .returning({ id: quotes.id });

  if (stale.length === 0) return 0;

  /* Card do Kanban acompanha: proposta vencida sai do fluxo ativo. */
  await db
    .update(kanbanCards)
    .set({ column: "cancelado", updatedAt: new Date() })
    .where(
      inArray(
        kanbanCards.quoteId,
        stale.map((q) => q.id)
      )
    );

  return stale.length;
}

/** Mantido para compatibilidade com `scripts/repair-quotes.mjs`. */
export async function repairExpiredQuotes() {
  return expireStaleQuotes();
}
