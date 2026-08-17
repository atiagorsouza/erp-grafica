import "server-only";

/* ====================================================================
 *  INFINITEPAY — cobrança por link de checkout
 * ====================================================================
 *
 *  Antes da v3.13.0 existia só `/api/integrations/infinitepay`, um stub
 *  isolado que ninguém chamava — e com o contrato ERRADO:
 *
 *    enviava  Authorization: Bearer <handle>  +  { amount, description }
 *    a API responde: 400 "param is missing or the value is empty
 *                         or invalid: handle"
 *
 *  O contrato real (verificado contra a API de produção):
 *    POST https://api.checkout.infinitepay.io/links
 *      { handle, order_nsu, items:[{quantity, price, description}],
 *        redirect_url, webhook_url, customer, address }
 *      → { url: "https://checkout.infinitepay.com.br/..." }
 *
 *    POST https://api.checkout.infinitepay.io/payment_check
 *      { handle, order_nsu, transaction_nsu, slug }
 *      → { success, paid, amount, paid_amount, installments, capture_method }
 *
 *  IMPORTANTE — `price` é em CENTAVOS (inteiro).
 *
 *  SEGURANÇA: o webhook da InfinitePay não tem assinatura HMAC. Qualquer
 *  um que descubra a URL poderia forjar "pagamento aprovado". Por isso
 *  NENHUM webhook dá baixa sozinho: todo aviso é reconferido com
 *  payment_check antes de tocar no Financeiro.
 * ==================================================================== */

import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  orders,
  paymentLinks,
  quotes,
  sales,
  settings,
  transactions,
} from "@/db/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { round2, toDecimalString, toNumber } from "@/lib/money";
import { upsertAutoTransaction } from "@/lib/finance";
import { todayISO } from "@/lib/period";

export type PayError = { error: string; status: number; details?: unknown };

const API = "https://api.checkout.infinitepay.io";

/* ==================================================================
 *  CONFIGURAÇÃO
 * ================================================================== */

export type InfinitePayConfig = {
  handle: string;
  baseUrl: string;
  redirectUrl: string;
  webhookUrl: string;
  methods: string[];
  autoSettle: boolean;
  expiresHours: number;
  /**
   * Taxas do LINK de checkout — diferentes da maquininha física.
   *
   * O Painel tem `card_fee_debit`/`card_fee_credit` (grupo Tributação),
   * usados pelo PDV com gross-up quando o cliente passa o cartão na
   * maquininha. O link online tem tarifa própria, então misturar as
   * duas cobraria taxa errada do cliente.
   */
  feePix: number;
  feeCredit: number;
  feeInstallment: number;
  /** absorve = loja paga a taxa · repassa = soma no valor do link */
  feeMode: "absorve" | "repassa";
};

/** "4,20" ou "4.20" → 0.042. Aceita fração já pronta (0.042). */
function pct(v: string | null | undefined, fallback: number) {
  const n = toNumber(v, Number.NaN);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n > 1 ? n / 100 : n;
}

function truthy(v: string | null | undefined, fallback = false) {
  if (v == null || v === "") return fallback;
  return ["true", "1", "sim", "yes", "ativo", "on"].includes(String(v).toLowerCase().trim());
}

export async function getInfinitePayConfig(): Promise<InfinitePayConfig> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));

  /* handle é a InfiniteTag SEM o "$" e sem "@" */
  const handle = String(
    process.env.INFINITEPAY_HANDLE || map.get("infinitepay_handle") || ""
  )
    .trim()
    .replace(/^[@$]/, "");

  const baseUrl = String(
    process.env.APP_BASE_URL || map.get("app_base_url") || ""
  ).replace(/\/+$/, "");

  return {
    handle,
    baseUrl,
    redirectUrl: map.get("infinitepay_redirect_url") || (baseUrl ? `${baseUrl}/pagamento/retorno` : ""),
    webhookUrl: map.get("infinitepay_webhook_url") || (baseUrl ? `${baseUrl}/api/payments/webhook` : ""),
    methods: (map.get("infinitepay_methods") || "pix,credit_card")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    autoSettle: truthy(map.get("infinitepay_auto_settle"), true),
    expiresHours: Math.max(1, toNumber(map.get("infinitepay_expires_hours"), 72) || 72),
    feePix: pct(map.get("infinitepay_fee_pix"), 0),
    feeCredit: pct(map.get("infinitepay_fee_credit"), 0.042),
    feeInstallment: pct(map.get("infinitepay_fee_installment"), 0.0599),
    feeMode: map.get("infinitepay_fee_mode") === "repassa" ? "repassa" : "absorve",
  };
}

/* ==================================================================
 *  HTTP
 * ================================================================== */

/** Resposta crua da InfinitePay — o formato varia por endpoint. */
type RawResponse = Record<string, unknown>;

async function call<T = RawResponse>(
  path: string,
  body: unknown
): Promise<{ ok: true; data: T } | PayError> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return { error: describeError(data, res.status), status: res.status, details: data };
    }
    return { ok: true as const, data: data as T };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      error: aborted
        ? "InfinitePay não respondeu a tempo (20s)."
        : "Falha de conexão com a InfinitePay.",
      status: 504,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function describeError(data: unknown, status: number): string {
  const d = data as { message?: string; error?: string };
  const msg = String(d?.message || d?.error || "");

  if (msg.includes("param is missing") && msg.includes("handle")) {
    return "InfiniteTag (handle) não informada ou inválida. Confira no Painel de Controle → Pagamentos.";
  }
  if (msg.toLowerCase().includes("unable to create checkout link")) {
    return "A InfinitePay recusou a criação do link. Confira se a InfiniteTag existe e se a conta está ativa.";
  }
  if (msg) return msg;
  if (status === 404) return "Cobrança não encontrada na InfinitePay.";
  return `InfinitePay respondeu ${status}.`;
}

/* ==================================================================
 *  CRIAÇÃO DA COBRANÇA
 * ================================================================== */

export const chargeSchema = z
  .object({
    orderId: z.coerce.number().int().positive().optional(),
    saleId: z.coerce.number().int().positive().optional(),
    quoteId: z.coerce.number().int().positive().optional(),
    /** cobrança avulsa */
    amount: z.coerce.number().positive().max(1_000_000).optional(),
    description: z.string().trim().max(200).optional(),
    customerId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.orderId || d.saleId || d.quoteId || d.amount, {
    message: "Informe um pedido, venda, orçamento ou um valor avulso",
  });

type ChargeItem = { quantity: number; price: number; description: string };

/**
 * Taxa do checkout conforme a forma usada. Só é conhecida DEPOIS do
 * pagamento (o cliente escolhe Pix ou parcelas na tela da InfinitePay).
 */
export function checkoutFeeRate(
  cfg: InfinitePayConfig,
  captureMethod: string | null | undefined,
  installments: number | null | undefined
) {
  const method = String(captureMethod || "").toLowerCase();
  if (method === "pix") return cfg.feePix;
  if (method.includes("credit")) {
    return Number(installments || 1) > 1 ? cfg.feeInstallment : cfg.feeCredit;
  }
  return 0;
}

/** Centavos, inteiro — a API rejeita decimal. */
function toCents(value: number) {
  return Math.max(1, Math.round(round2(value) * 100));
}

export async function createCharge(raw: unknown) {
  const parsed = chargeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message || "Dados inválidos", status: 400 } satisfies PayError;
  }
  const input = parsed.data;
  const cfg = await getInfinitePayConfig();

  /* A checagem de configuração vem DEPOIS das regras de negócio:
     "pedido cancelado não pode ser cobrado" é uma resposta mais útil
     do que "token ausente" para quem está testando o fluxo. */

  /* ---------- origem ---------- */
  let customerId = input.customerId ?? null;
  let reference = "";
  let total = 0;
  let items: ChargeItem[] = [];
  let orderId: number | null = null;
  let saleId: number | null = null;
  let quoteId: number | null = null;

  const mapItems = (raw: unknown): ChargeItem[] => {
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((i) => {
        const it = i as { description?: string; quantity?: number; unitPrice?: number };
        return {
          quantity: Math.max(1, Math.round(toNumber(it.quantity, 1))),
          price: toCents(toNumber(it.unitPrice, 0)),
          description: String(it.description || "Item").slice(0, 120),
        };
      })
      .filter((i) => i.price > 0);
  };

  if (input.orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) return { error: "Pedido não encontrado", status: 404 } satisfies PayError;
    if (order.status === "cancelado") {
      return { error: "Pedido cancelado não pode ser cobrado", status: 409 } satisfies PayError;
    }
    if (order.financialStatus === "pago") {
      return { error: "Este pedido já está quitado", status: 409 } satisfies PayError;
    }
    orderId = order.id;
    customerId = customerId ?? order.customerId;
    reference = order.number;
    total = toNumber(order.total, 0);
    items = mapItems(order.items);
    const shipping = toNumber(order.shippingFee, 0);
    if (shipping > 0) {
      items.push({ quantity: 1, price: toCents(shipping), description: "Frete" });
    }
  } else if (input.saleId) {
    const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
    if (!sale) return { error: "Venda não encontrada", status: 404 } satisfies PayError;
    if (sale.status === "cancelada") {
      return { error: "Venda cancelada não pode ser cobrada", status: 409 } satisfies PayError;
    }
    saleId = sale.id;
    customerId = customerId ?? sale.customerId;
    reference = sale.number;
    /* ------------------------------------------------------------
     * CONFLITO COM A TAXA DA MAQUININHA (corrigido na v3.13.1)
     *
     * `sale.total` inclui o gross-up de `card_fee_credit`/`debit` do
     * grupo Tributação, aplicado quando a venda foi fechada no cartão
     * PRESENCIAL. Cobrar esse total por link faria o cliente pagar o
     * markup de uma maquininha que não foi usada — e a InfinitePay
     * ainda descontaria a taxa dela por cima.
     *
     * O link cobra o valor SEM a taxa da maquininha; a tarifa do
     * checkout é tratada à parte, conforme `feeMode`.
     * ---------------------------------------------------------- */
    const machineFee = toNumber(sale.cardFee, 0);
    total = round2(toNumber(sale.total, 0) - machineFee);
    items = mapItems(sale.items);
    if (machineFee > 0) {
      /* itens somam o bruto sem a taxa; força item único coerente */
      items = [];
    }
  } else if (input.quoteId) {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
    if (!quote) return { error: "Orçamento não encontrado", status: 404 } satisfies PayError;
    quoteId = quote.id;
    customerId = customerId ?? quote.customerId;
    reference = quote.number;
    total = toNumber(quote.total, 0);
  } else {
    total = toNumber(input.amount, 0);
    reference = "AVULSO";
  }

  if (input.amount && !input.orderId && !input.saleId) {
    total = toNumber(input.amount, 0);
  }
  if (total <= 0) {
    return { error: "Valor da cobrança deve ser maior que zero", status: 422 } satisfies PayError;
  }

  const description =
    input.description?.trim() ||
    (reference === "AVULSO" ? "Pagamento PrintFlow" : `Pedido ${reference}`);

  /* Repasse da tarifa do link (independe da maquininha do PDV).
     Usa a taxa de crédito à vista como referência: é o pior caso
     comum, e o cliente vê o valor final antes de escolher a forma. */
  let passedFee = 0;
  if (cfg.feeMode === "repassa" && cfg.feeCredit > 0) {
    const withFee = round2(total / (1 - cfg.feeCredit));
    passedFee = round2(withFee - total);
    if (passedFee > 0) {
      total = withFee;
      items = [];
    }
  }

  /* A soma dos itens precisa bater com o total; senão o cliente paga
     valor diferente do documento. Se divergir, cobra em item único. */
  if (items.length > 0) {
    const sum = items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (Math.abs(sum - toCents(total)) > 2) {
      items = [{ quantity: 1, price: toCents(total), description: description.slice(0, 120) }];
    }
  } else {
    items = [{ quantity: 1, price: toCents(total), description: description.slice(0, 120) }];
  }

  if (!cfg.handle) {
    return {
      error:
        "InfiniteTag não configurada. Painel de Controle → Pagamentos (InfinitePay), ou variável INFINITEPAY_HANDLE.",
      status: 503,
    } satisfies PayError;
  }

  /* order_nsu precisa ser único e rastreável do nosso lado */
  const orderNsu = `PF-${reference}-${Date.now().toString(36).toUpperCase()}`;

  const [customer] = customerId
    ? await db.select().from(customers).where(eq(customers.id, customerId)).limit(1)
    : [];

  const body: Record<string, unknown> = {
    handle: cfg.handle,
    order_nsu: orderNsu,
    items,
  };
  if (cfg.redirectUrl) body.redirect_url = cfg.redirectUrl;
  if (cfg.webhookUrl) body.webhook_url = cfg.webhookUrl;
  if (customer) {
    body.customer = {
      name: customer.name,
      email: customer.email || undefined,
      phone_number: customer.phone ? String(customer.phone).replace(/\D/g, "") : undefined,
    };
    if (customer.cep) {
      body.address = {
        cep: String(customer.cep).replace(/\D/g, ""),
        street: customer.street || undefined,
        neighborhood: customer.district || undefined,
        number: customer.number || undefined,
        complement: customer.complement || undefined,
      };
    }
  }

  const res = await call<{ url?: string }>("/links", body);
  if ("error" in res) return res;

  const url = String(res.data?.url || "");
  if (!url) {
    return {
      error: "InfinitePay não devolveu o link de checkout",
      status: 502,
      details: res.data,
    } satisfies PayError;
  }

  const expiresAt = new Date(Date.now() + cfg.expiresHours * 3600_000);

  const [row] = await db
    .insert(paymentLinks)
    .values({
      orderNsu,
      orderId,
      saleId,
      quoteId,
      customerId,
      status: "pendente",
      description,
      amount: toDecimalString(total, 2),
      checkoutUrl: url,
      handle: cfg.handle,
      items,
      expiresAt,
      passedFee: toDecimalString(passedFee, 2),
      payload: res.data,
    })
    .returning();

  return { ok: true as const, row };
}

/* ==================================================================
 *  CONFIRMAÇÃO
 * ================================================================== */

type PaymentCheck = {
  success?: boolean;
  paid?: boolean;
  amount?: number;
  paid_amount?: number;
  installments?: number;
  capture_method?: string;
};

/**
 * Confirmação ATIVA contra a API. É a única fonte de verdade:
 * o webhook apenas dispara esta verificação.
 */
export async function checkPayment(id: number, hints?: {
  transactionNsu?: string | null;
  slug?: string | null;
  receiptUrl?: string | null;
}) {
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  if (!link) return { error: "Cobrança não encontrada", status: 404 } satisfies PayError;
  if (link.status === "pago") return { ok: true as const, row: link, alreadyPaid: true };

  const cfg = await getInfinitePayConfig();
  const transactionNsu = hints?.transactionNsu || link.transactionNsu;
  const slug = hints?.slug || link.invoiceSlug;

  await db
    .update(paymentLinks)
    .set({ checkAttempts: sql`${paymentLinks.checkAttempts} + 1`, updatedAt: new Date() })
    .where(eq(paymentLinks.id, id));

  /* Sem transaction_nsu/slug a API não tem o que conferir: isso é
     esperado enquanto o cliente não pagou, não é erro. */
  if (!transactionNsu && !slug) {
    return { ok: true as const, row: link, paid: false, pending: true };
  }

  const res = await call<PaymentCheck>("/payment_check", {
    handle: link.handle || cfg.handle,
    order_nsu: link.orderNsu,
    transaction_nsu: transactionNsu || undefined,
    slug: slug || undefined,
  });

  if ("error" in res) {
    await db
      .update(paymentLinks)
      .set({ lastError: res.error, updatedAt: new Date() })
      .where(eq(paymentLinks.id, id));
    return res;
  }

  const data = res.data;
  const paid = Boolean(data?.paid);

  if (!paid) {
    return { ok: true as const, row: link, paid: false };
  }

  const paidAmount = round2(toNumber(data?.paid_amount, 0) / 100);
  const expected = toNumber(link.amount, 0);

  /* Defesa contra valor divergente: se pagaram menos que o cobrado,
     registra mas NÃO quita o documento automaticamente. */
  const underpaid = paidAmount > 0 && paidAmount + 0.05 < expected;

  const [row] = await db
    .update(paymentLinks)
    .set({
      status: "pago",
      paidAmount: toDecimalString(paidAmount || expected, 2),
      paidAt: link.paidAt || new Date(),
      captureMethod: data?.capture_method || link.captureMethod,
      installments: Number(data?.installments || link.installments || 1),
      transactionNsu: transactionNsu || link.transactionNsu,
      invoiceSlug: slug || link.invoiceSlug,
      receiptUrl: hints?.receiptUrl || link.receiptUrl,
      confirmedBy: link.confirmedBy || "payment_check",
      lastError: underpaid
        ? `Pago R$ ${paidAmount.toFixed(2)} para uma cobrança de R$ ${expected.toFixed(2)}`
        : null,
      payload: data,
      updatedAt: new Date(),
    })
    .where(eq(paymentLinks.id, id))
    .returning();

  if (!underpaid) await settleDocuments(row);

  return { ok: true as const, row, paid: true, underpaid };
}

/* ==================================================================
 *  BAIXA NOS DEMAIS MÓDULOS
 * ================================================================== */

const CAPTURE_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Crédito",
  debit_card: "Débito",
};

/**
 * Pagamento confirmado → quita o documento de origem e lança a receita.
 * Idempotente: `upsertAutoTransaction` casa por documento.
 */
export async function settleDocuments(link: typeof paymentLinks.$inferSelect) {
  const cfg = await getInfinitePayConfig();
  if (!cfg.autoSettle) return;

  const method = CAPTURE_LABEL[String(link.captureMethod || "")] || "InfinitePay";
  const value = toNumber(link.paidAmount ?? link.amount, 0);
  if (value <= 0) return;

  /* ----------------------------------------------------------------
   * TARIFA DO CHECKOUT (v3.13.1)
   *
   * O PDV já lançava a taxa da maquininha como despesa `taxa_cartao`.
   * O link online não lançava nada: a receita entrava cheia e o
   * resultado ficava inflado no valor da tarifa.
   *
   * Categoria própria (`taxa_infinitepay`) para o DRE separar o custo
   * do checkout online do custo da maquininha física.
   * ---------------------------------------------------------------- */
  const feeRate = checkoutFeeRate(cfg, link.captureMethod, link.installments);
  const providerFee = round2(value * feeRate);

  await db.transaction(async (tx) => {
    /* pedido: passa a pago e o Kanban/entrega seguem o fluxo normal */
    if (link.orderId) {
      await tx
        .update(orders)
        .set({ financialStatus: "pago", paymentMethod: method, updatedAt: new Date() })
        .where(eq(orders.id, link.orderId));
    }

    const created = await upsertAutoTransaction(tx, {
      type: "receita",
      category: link.orderId ? "pedido" : "venda",
      description: link.orderId
        ? `${link.description} — InfinitePay`
        : `${link.description} · InfinitePay`,
      amount: value,
      dueDate: todayISO(),
      paidDate: todayISO(),
      status: "pago",
      method,
      customerId: link.customerId,
      orderId: link.orderId,
      saleId: link.saleId,
      notes: `Recebido via InfinitePay${link.installments && link.installments > 1 ? ` em ${link.installments}x` : ""}.${
        link.receiptUrl ? ` Comprovante: ${link.receiptUrl}` : ""
      }`,
    });

    if (providerFee > 0) {
      await upsertAutoTransaction(tx, {
        type: "despesa",
        category: "taxa_infinitepay",
        description: `Tarifa InfinitePay · ${link.description}`,
        amount: providerFee,
        dueDate: todayISO(),
        paidDate: todayISO(),
        status: "pago",
        method,
        customerId: link.customerId,
        orderId: link.orderId,
        saleId: link.saleId,
        notes: `${(feeRate * 100).toFixed(2)}% sobre ${value.toFixed(2)}.`,
      });
    }

    await tx
      .update(paymentLinks)
      .set({
        providerFee: toDecimalString(providerFee, 2),
        ...(created?.id ? { transactionId: created.id } : {}),
      })
      .where(eq(paymentLinks.id, link.id));
  });
}

/* ==================================================================
 *  WEBHOOK
 * ================================================================== */

export type WebhookPayload = {
  order_nsu?: string;
  invoice_slug?: string;
  transaction_nsu?: string;
  receipt_url?: string;
  amount?: number;
  paid_amount?: number;
  installments?: number;
  capture_method?: string;
};

/**
 * Registra o aviso e SEMPRE reconfere com payment_check.
 *
 * O webhook não é assinado: tratar o corpo como verdade permitiria a
 * qualquer um marcar pedidos como pagos com um POST.
 */
export async function handleWebhook(payload: WebhookPayload) {
  const orderNsu = String(payload.order_nsu || "").trim();
  if (!orderNsu) return { error: "order_nsu ausente", status: 400 } satisfies PayError;

  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.orderNsu, orderNsu))
    .limit(1);

  /* order_nsu desconhecido: possível tentativa forjada. */
  if (!link) return { error: "Cobrança não encontrada", status: 404 } satisfies PayError;

  await db
    .update(paymentLinks)
    .set({
      webhookReceivedAt: new Date(),
      transactionNsu: payload.transaction_nsu || link.transactionNsu,
      invoiceSlug: payload.invoice_slug || link.invoiceSlug,
      receiptUrl: payload.receipt_url || link.receiptUrl,
      confirmedBy: link.confirmedBy || "webhook",
      updatedAt: new Date(),
    })
    .where(eq(paymentLinks.id, link.id));

  const verified = await checkPayment(link.id, {
    transactionNsu: payload.transaction_nsu,
    slug: payload.invoice_slug,
    receiptUrl: payload.receipt_url,
  });

  if ("error" in verified) return verified;
  return { ok: true as const, verified: verified.paid === true, row: verified.row };
}

/* ==================================================================
 *  CANCELAMENTO E EXPIRAÇÃO
 * ================================================================== */

export async function cancelCharge(id: number, reason: string) {
  const clean = String(reason || "").trim();
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  if (!link) return { error: "Cobrança não encontrada", status: 404 } satisfies PayError;
  if (link.status === "pago") {
    return {
      error: "Cobrança já paga não pode ser cancelada. Faça o estorno pelo app InfinitePay.",
      status: 409,
    } satisfies PayError;
  }

  const [row] = await db
    .update(paymentLinks)
    .set({
      status: "cancelado",
      lastError: clean || "Cancelada pelo operador",
      updatedAt: new Date(),
    })
    .where(eq(paymentLinks.id, id))
    .returning();

  return { ok: true as const, row };
}

/** Marca como expiradas as cobranças vencidas e não pagas. */
export async function expireStale() {
  const result = await db
    .update(paymentLinks)
    .set({ status: "expirado", updatedAt: new Date() })
    .where(
      and(
        eq(paymentLinks.status, "pendente"),
        isNull(paymentLinks.paidAt),
        lt(paymentLinks.expiresAt, new Date())
      )
    )
    .returning({ id: paymentLinks.id });
  return result.length;
}

/* ==================================================================
 *  CONSULTAS
 * ================================================================== */

export async function listCharges(limit = 200) {
  return db.select().from(paymentLinks).orderBy(desc(paymentLinks.createdAt)).limit(limit);
}

export async function getChargeByNsu(orderNsu: string) {
  const [row] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.orderNsu, orderNsu))
    .limit(1);
  return row || null;
}

export async function getChargeSummary() {
  const [row] = await db
    .select({
      pending: sql<string>`coalesce(sum(case when ${paymentLinks.status}='pendente' then ${paymentLinks.amount} else 0 end),0)`,
      paid: sql<string>`coalesce(sum(case when ${paymentLinks.status}='pago' then coalesce(${paymentLinks.paidAmount}, ${paymentLinks.amount}) else 0 end),0)`,
      pendingCount: sql<number>`count(*) filter (where ${paymentLinks.status}='pendente')::int`,
      paidCount: sql<number>`count(*) filter (where ${paymentLinks.status}='pago')::int`,
    })
    .from(paymentLinks);

  return {
    pending: round2(toNumber(row?.pending, 0)),
    paid: round2(toNumber(row?.paid, 0)),
    pendingCount: Number(row?.pendingCount || 0),
    paidCount: Number(row?.paidCount || 0),
  };
}

export { transactions };
