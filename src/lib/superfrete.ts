import "server-only";

/* ====================================================================
 *  SUPERFRETE — cliente da API + regras de envio
 * ====================================================================
 *
 *  Antes da v3.12.0 existia apenas `/api/integrations/superfrete`, um
 *  stub isolado: calculava frete e devolvia JSON. Nada no sistema o
 *  chamava (`grep superfrete src/` não retornava nenhum consumidor),
 *  não havia peso nos produtos, não gravava nada no banco e não sabia
 *  gerar etiqueta.
 *
 *  Este módulo é a camada server-side do envio, no mesmo padrão de
 *  orders.ts / sales.ts / finance.ts.
 *
 *  Ciclo real da API SuperFrete:
 *    /calculator  → cotação (grátis)
 *    /cart        → adiciona ao carrinho (grátis, ainda não paga)
 *    /checkout    → PAGA com o saldo da conta  ⚠ dinheiro real
 *    /tag/print   → devolve o PDF da etiqueta
 *    /tag/tracking→ rastreio
 * ==================================================================== */

import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  deliveries,
  orders,
  products,
  sales,
  settings,
  shipments,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { round2, toDecimalString, toNumber } from "@/lib/money";
import { upsertAutoTransaction } from "@/lib/finance";
import { todayISO } from "@/lib/period";

export type ShipError = { error: string; status: number; details?: unknown };

const PROD_URL = "https://api.superfrete.com";
const SANDBOX_URL = "https://sandbox.superfrete.com";

/** Serviços dos Correios/parceiros: 1=PAC, 2=SEDEX, 17=Mini Envios, 3=LOGGI. */
export const DEFAULT_SERVICES = "1,2,17";

/**
 * A resposta de `/cart` é enxuta (id, price, protocol, status) e NÃO traz o
 * nome do serviço. Resolvemos pelo id para não gravar envio sem identificação.
 */
export const SERVICE_NAMES: Record<number, { name: string; carrier: string }> = {
  1: { name: "PAC", carrier: "Correios" },
  2: { name: "SEDEX", carrier: "Correios" },
  3: { name: "LOGGI", carrier: "Loggi" },
  17: { name: "Mini Envios", carrier: "Correios" },
};

export function serviceLabel(id: number) {
  return SERVICE_NAMES[id] || { name: `Serviço ${id}`, carrier: "Transportadora" };
}

/* ==================================================================
 *  CONFIGURAÇÃO
 * ================================================================== */

export type SuperfreteConfig = {
  token: string;
  sandbox: boolean;
  baseUrl: string;
  environment: "sandbox" | "production";
  cepOrigin: string;
  userAgent: string;
  /* pacote padrão — usado quando o produto não tem medidas */
  pkg: { weight: number; height: number; width: number; length: number };
  /* repassar o frete ao cliente automaticamente */
  autoCharge: boolean;
  /* lançar o custo da etiqueta como despesa no Financeiro */
  postExpense: boolean;
  insuranceDefault: boolean;
};

function truthy(v: string | null | undefined, fallback = false) {
  if (v == null || v === "") return fallback;
  return ["true", "1", "sim", "yes", "ativo", "on"].includes(String(v).toLowerCase().trim());
}

export async function getSuperfreteConfig(): Promise<SuperfreteConfig> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));

  const token = process.env.SUPERFRETE_TOKEN || map.get("superfrete_token") || "";
  /* padrão é PRODUÇÃO: sandbox só quando explicitamente ligado. */
  const sandbox = truthy(map.get("superfrete_sandbox"), false);

  const cepOrigin = String(
    map.get("superfrete_cep_origem") || map.get("company_cep") || ""
  ).replace(/\D/g, "");

  return {
    token,
    sandbox,
    baseUrl: sandbox ? SANDBOX_URL : PROD_URL,
    environment: sandbox ? "sandbox" : "production",
    cepOrigin,
    userAgent:
      map.get("superfrete_user_agent") ||
      `PrintFlow ERP (${map.get("company_email") || "contato@printflow.local"})`,
    pkg: {
      weight: toNumber(map.get("superfrete_pkg_weight"), 0.3) || 0.3,
      height: toNumber(map.get("superfrete_pkg_height"), 4) || 4,
      width: toNumber(map.get("superfrete_pkg_width"), 12) || 12,
      length: toNumber(map.get("superfrete_pkg_length"), 17) || 17,
    },
    autoCharge: truthy(map.get("superfrete_auto_charge"), true),
    postExpense: truthy(map.get("superfrete_post_expense"), true),
    insuranceDefault: truthy(map.get("superfrete_insurance"), false),
  };
}

/* ==================================================================
 *  HTTP
 * ================================================================== */

async function call<T = unknown>(
  cfg: SuperfreteConfig,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; data: T } | ShipError> {
  if (!cfg.token) {
    return {
      error:
        "Token SuperFrete não configurado. Painel de Controle → Envios & Frete, ou variável SUPERFRETE_TOKEN.",
      status: 503,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        accept: "application/json",
        "User-Agent": cfg.userAgent,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
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
        ? "SuperFrete não respondeu a tempo (25s). Tente novamente."
        : "Falha de conexão com a SuperFrete.",
      status: 504,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Traduz o formato de erro da SuperFrete em uma frase útil. */
function describeError(data: unknown, status: number): string {
  const d = data as { message?: string; error?: string; errors?: Record<string, string[]> };
  if (d?.errors && typeof d.errors === "object") {
    const keys = Object.keys(d.errors);
    /* A API devolve "(correios.destination_postcode) é obrigatório" quando o
       CEP não existe na base dos Correios — inútil para o operador. */
    if (keys.some((k) => k.includes("destination_postcode"))) {
      return "CEP de destino não encontrado na base dos Correios. Confira o número.";
    }
    if (keys.some((k) => k.includes("origin_postcode"))) {
      return "CEP de origem inválido. Verifique o CEP da empresa no Painel de Controle.";
    }
    if (keys.some((k) => k.includes("no_result"))) {
      return "Nenhum serviço de entrega disponível para este CEP e pacote.";
    }
    const first = Object.values(d.errors).flat().filter(Boolean)[0];
    if (first) return String(first);
  }
  if (d?.error) return String(d.error);
  if (d?.message) return String(d.message);
  if (status === 401) return "Token SuperFrete inválido ou expirado.";
  return `SuperFrete respondeu ${status}.`;
}

/* ==================================================================
 *  CONTA
 * ================================================================== */

export type SuperfreteAccount = {
  id: string;
  name: string;
  email: string;
  balance: number;
  shipmentsAvailable: number;
};

export async function getAccount(cfg?: SuperfreteConfig) {
  const config = cfg || (await getSuperfreteConfig());
  const res = await call<{
    id: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    balance?: number;
    limits?: { shipments_available?: number };
  }>(config, "/api/v0/user");
  if ("error" in res) return res;

  const u = res.data;
  return {
    ok: true as const,
    account: {
      id: String(u.id || ""),
      name: [u.firstname, u.lastname].filter(Boolean).join(" ").trim(),
      email: String(u.email || ""),
      balance: toNumber(u.balance, 0),
      shipmentsAvailable: Number(u.limits?.shipments_available || 0),
    } satisfies SuperfreteAccount,
  };
}

/* ==================================================================
 *  PACOTE — deriva peso/dimensões dos itens
 * ================================================================== */

export type CartLine = { productId?: number | null; quantity: number };

export type PackageSpec = {
  weight: number;
  height: number;
  width: number;
  length: number;
  /** true quando algum item não tinha medida e caiu no padrão */
  usedFallback: boolean;
};

/**
 * Regra de empacotamento (simplificada e honesta):
 *  - peso: soma de (peso unitário × quantidade)
 *  - altura: soma das alturas (itens empilhados)
 *  - largura/comprimento: o maior item
 *  - respeita os mínimos dos Correios (16×11×2 cm, 0,3 kg)
 */
export async function buildPackage(
  lines: CartLine[],
  cfg: SuperfreteConfig
): Promise<PackageSpec> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((v): v is number => !!v))];
  const rows = ids.length
    ? await db.select().from(products).where(inArray(products.id, ids))
    : [];
  const map = new Map(rows.map((r) => [r.id, r]));

  let weight = 0;
  let height = 0;
  let width = 0;
  let length = 0;
  let usedFallback = false;

  for (const line of lines) {
    const qty = Math.max(1, toNumber(line.quantity, 1));
    const p = line.productId ? map.get(line.productId) : undefined;

    const w = toNumber(p?.shipWeight, 0);
    const h = toNumber(p?.shipHeight, 0);
    const wd = toNumber(p?.shipWidth, 0);
    const ln = toNumber(p?.shipLength, 0);

    if (w > 0 || h > 0 || wd > 0 || ln > 0) {
      weight += (w || cfg.pkg.weight) * qty;
      height += (h || cfg.pkg.height) * qty;
      width = Math.max(width, wd || cfg.pkg.width);
      length = Math.max(length, ln || cfg.pkg.length);
    } else {
      usedFallback = true;
      weight += cfg.pkg.weight * qty;
      height += cfg.pkg.height * qty;
      width = Math.max(width, cfg.pkg.width);
      length = Math.max(length, cfg.pkg.length);
    }
  }

  if (lines.length === 0) {
    usedFallback = true;
    weight = cfg.pkg.weight;
    height = cfg.pkg.height;
    width = cfg.pkg.width;
    length = cfg.pkg.length;
  }

  /* mínimos aceitos pelos Correios */
  return {
    weight: Math.max(0.05, round2(weight)),
    height: Math.max(2, round2(height)),
    width: Math.max(11, round2(width)),
    length: Math.max(16, round2(length)),
    usedFallback,
  };
}

/* ==================================================================
 *  COTAÇÃO
 * ================================================================== */

export const quoteSchema = z.object({
  cepDestination: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, { message: "CEP de destino deve ter 8 dígitos" }),
  cepOrigin: z.string().trim().max(9).optional(),
  services: z.string().trim().max(40).optional(),
  insuranceValue: z.coerce.number().min(0).max(10_000_000).optional(),
  ownHand: z.boolean().optional(),
  receipt: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive().nullable().optional(),
        quantity: z.coerce.number().positive().max(100_000).default(1),
      })
    )
    .optional(),
  /* medidas explícitas sobrescrevem o cálculo por itens */
  weight: z.coerce.number().positive().max(1000).optional(),
  height: z.coerce.number().positive().max(200).optional(),
  width: z.coerce.number().positive().max(200).optional(),
  length: z.coerce.number().positive().max(200).optional(),
});

export type QuoteOption = {
  serviceId: number;
  name: string;
  carrier: string;
  price: number;
  discount: number;
  deliveryMin: number;
  deliveryMax: number;
  deliveryLabel: string;
  error: string | null;
};

/**
 * Resposta crua da SuperFrete. O contrato varia por endpoint (o /cart
 * devolve 4 campos, o /calculator devolve o objeto completo), então
 * tratamos como saco de propriedades e normalizamos na saída.
 */
 
type RawQuote = Record<string, any>;

export async function quoteShipping(raw: unknown) {
  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
      status: 400,
    } satisfies ShipError;
  }
  const input = parsed.data;
  const cfg = await getSuperfreteConfig();

  const to = input.cepDestination.replace(/\D/g, "");
  const from = (input.cepOrigin || cfg.cepOrigin).replace(/\D/g, "");

  if (to.length !== 8) return { error: "CEP de destino inválido", status: 400 } satisfies ShipError;
  if (from.length !== 8) {
    return {
      error:
        "CEP de origem não configurado. Preencha o CEP da empresa em Painel de Controle → Identidade, ou o CEP de origem em Envios & Frete.",
      status: 422,
    } satisfies ShipError;
  }

  const pkg =
    input.weight && input.height && input.width && input.length
      ? {
          weight: input.weight,
          height: input.height,
          width: input.width,
          length: input.length,
          usedFallback: false,
        }
      : await buildPackage(input.items || [], cfg);

  const res = await call<RawQuote[]>(cfg, "/api/v0/calculator", {
    method: "POST",
    body: {
      from: { postal_code: from },
      to: { postal_code: to },
      services: input.services || DEFAULT_SERVICES,
      options: {
        insurance_value: input.insuranceValue ?? 0,
        receipt: input.receipt ?? false,
        own_hand: input.ownHand ?? false,
      },
      package: {
        height: pkg.height,
        width: pkg.width,
        length: pkg.length,
        weight: pkg.weight,
      },
    },
  });

  if ("error" in res) return res;

  const list = Array.isArray(res.data) ? res.data : [];
  const options: QuoteOption[] = list.map((q: RawQuote) => {
    const min = Number(q.delivery_range?.min ?? q.delivery_time ?? 0);
    const max = Number(q.delivery_range?.max ?? q.delivery_time ?? min);
    return {
      serviceId: Number(q.id ?? 0),
      name: String(q.name ?? "Serviço"),
      carrier: String(q.company?.name ?? "Correios"),
      price: toNumber(q.price, 0),
      discount: toNumber(q.discount, 0),
      deliveryMin: min,
      deliveryMax: max,
      deliveryLabel: min === max ? `${min} dia(s) útil(eis)` : `${min}–${max} dias úteis`,
      error: q.error || (q.has_error ? "Serviço indisponível" : null),
    };
  });

  const valid = options.filter((o) => !o.error && o.price > 0);

  return {
    ok: true as const,
    from,
    to,
    package: pkg,
    environment: cfg.environment,
    options,
    cheapest: valid.slice().sort((a, b) => a.price - b.price)[0] || null,
    fastest: valid.slice().sort((a, b) => a.deliveryMax - b.deliveryMax)[0] || null,
  };
}

/* ==================================================================
 *  ENDEREÇO
 * ================================================================== */

function requireAddress(c: typeof customers.$inferSelect | undefined) {
  if (!c) return "Cliente não encontrado";
  const missing: string[] = [];
  if (!c.name?.trim()) missing.push("nome");
  if (!String(c.cep || "").replace(/\D/g, "")) missing.push("CEP");
  if (!c.street?.trim()) missing.push("logradouro");
  if (!c.number?.trim()) missing.push("número");
  if (!c.district?.trim()) missing.push("bairro");
  if (!c.city?.trim()) missing.push("cidade");
  if (!c.state?.trim()) missing.push("UF");
  return missing.length ? `Cliente sem ${missing.join(", ")} para gerar a etiqueta` : null;
}

function addressLine(c: typeof customers.$inferSelect) {
  return [c.street, c.number, c.complement, c.district, c.city, c.state, c.cep]
    .filter(Boolean)
    .join(", ");
}

/* ==================================================================
 *  CARRINHO  (grátis — ainda não paga)
 * ================================================================== */

export const cartSchema = z.object({
  orderId: z.coerce.number().int().positive().optional(),
  saleId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive(),
  insuranceValue: z.coerce.number().min(0).optional(),
  ownHand: z.boolean().optional(),
  receipt: z.boolean().optional(),
  nonCommercial: z.boolean().optional(),
});

export async function addToCart(raw: unknown) {
  const parsed = cartSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message || "Dados inválidos", status: 400 } satisfies ShipError;
  }
  const input = parsed.data;
  if (!input.orderId && !input.saleId) {
    return { error: "Informe o pedido ou a venda de origem", status: 400 } satisfies ShipError;
  }

  const cfg = await getSuperfreteConfig();

  /* ---------- documento de origem ---------- */
  let customerId: number | null = null;
  let reference = "";
  let declaredValue = 0;
  let lines: CartLine[] = [];

  if (input.orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) return { error: "Pedido não encontrado", status: 404 } satisfies ShipError;
    if (order.status === "cancelado") {
      return { error: "Pedido cancelado não pode gerar etiqueta", status: 409 } satisfies ShipError;
    }
    customerId = order.customerId;
    reference = order.number;
    declaredValue = toNumber(order.total, 0);
    lines = (Array.isArray(order.items) ? order.items : []).map(
      (i: { productId?: number | null; quantity?: number }) => ({
        productId: i.productId ?? null,
        quantity: toNumber(i.quantity, 1),
      })
    );
  } else {
    const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId!)).limit(1);
    if (!sale) return { error: "Venda não encontrada", status: 404 } satisfies ShipError;
    if (sale.status === "cancelada") {
      return { error: "Venda cancelada não pode gerar etiqueta", status: 409 } satisfies ShipError;
    }
    customerId = sale.customerId;
    reference = sale.number;
    declaredValue = toNumber(sale.total, 0);
    lines = (Array.isArray(sale.items) ? sale.items : []).map(
      (i: { productId?: number | null; quantity?: number }) => ({
        productId: i.productId ?? null,
        quantity: toNumber(i.quantity, 1),
      })
    );
  }

  if (!customerId) {
    return {
      error: "Envio exige cliente identificado com endereço completo",
      status: 422,
    } satisfies ShipError;
  }

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const addressError = requireAddress(customer);
  if (addressError) return { error: addressError, status: 422 } satisfies ShipError;

  /* ---------- remetente ---------- */
  const rows = await db.select().from(settings);
  const cfgMap = new Map(rows.map((r) => [r.key, r.value || ""]));
  const fromCep = cfg.cepOrigin;
  if (fromCep.length !== 8) {
    return { error: "CEP de origem não configurado", status: 422 } satisfies ShipError;
  }
  const companyName = cfgMap.get("company_name") || "PrintFlow";
  const companyDoc = String(cfgMap.get("company_cnpj") || cfgMap.get("company_document") || "").replace(/\D/g, "");
  if (!companyDoc) {
    return {
      error:
        "CNPJ/CPF da empresa é obrigatório para emitir etiqueta. Preencha em Painel de Controle → Identidade da empresa.",
      status: 422,
    } satisfies ShipError;
  }

  const pkg = await buildPackage(lines, cfg);
  const insurance = input.insuranceValue ?? (cfg.insuranceDefault ? declaredValue : 0);

  const body = {
    from: {
      name: companyName,
      address: cfgMap.get("company_street") || "",
      district: cfgMap.get("company_district") || "",
      city: cfgMap.get("company_city") || "",
      state_abbr: cfgMap.get("company_state") || "",
      postal_code: fromCep,
      number: cfgMap.get("company_number") || "",
      complement: cfgMap.get("company_complement") || "",
      email: cfgMap.get("company_email") || "",
      phone: String(cfgMap.get("company_phone") || "").replace(/\D/g, ""),
      document: companyDoc,
    },
    to: {
      name: customer!.name,
      address: customer!.street || "",
      district: customer!.district || "",
      city: customer!.city || "",
      state_abbr: (customer!.state || "").toUpperCase().slice(0, 2),
      postal_code: String(customer!.cep || "").replace(/\D/g, ""),
      number: customer!.number || "",
      complement: customer!.complement || "",
      email: customer!.email || "",
      /* O entregador liga para este número: quem só cadastrou WhatsApp
         não pode ir para a transportadora sem telefone. */
      phone: String(customer!.phone || customer!.whatsapp || "").replace(/\D/g, ""),
      document: String(customer!.document || "").replace(/\D/g, ""),
    },
    service: input.serviceId,
    products: [
      {
        name: `Pedido ${reference}`,
        quantity: 1,
        unitary_value: Math.max(1, round2(declaredValue || 1)),
      },
    ],
    volumes: {
      height: pkg.height,
      width: pkg.width,
      length: pkg.length,
      weight: pkg.weight,
    },
    options: {
      insurance_value: insurance,
      receipt: input.receipt ?? false,
      own_hand: input.ownHand ?? false,
      non_commercial: input.nonCommercial ?? true,
      platform: "PrintFlow ERP",
    },
  };

  const res = await call<RawQuote>(cfg, "/api/v0/cart", { method: "POST", body });
  if ("error" in res) return res;

  const data = res.data;
  const superfreteOrderId = String(data.id || data.order_id || "");
  if (!superfreteOrderId) {
    return { error: "SuperFrete não devolveu o id do envio", status: 502, details: data } satisfies ShipError;
  }

  const [row] = await db
    .insert(shipments)
    .values({
      orderId: input.orderId ?? null,
      saleId: input.saleId ?? null,
      customerId,
      status: "no_carrinho",
      superfreteOrderId,
      protocol: data.protocol ? String(data.protocol) : null,
      serviceId: input.serviceId,
      serviceName:
        String(data.service?.name || data.service_name || "") || serviceLabel(input.serviceId).name,
      carrier: String(data.company?.name || "") || serviceLabel(input.serviceId).carrier,
      price: toDecimalString(toNumber(data.price, 0), 2),
      discount: toDecimalString(toNumber(data.discount, 0), 2),
      insuranceValue: toDecimalString(insurance, 2),
      deliveryMin: Number(data.delivery_min ?? data.delivery_time ?? 0) || null,
      deliveryMax: Number(data.delivery_max ?? data.delivery_time ?? 0) || null,
      weight: toDecimalString(pkg.weight, 3),
      height: toDecimalString(pkg.height, 2),
      width: toDecimalString(pkg.width, 2),
      length: toDecimalString(pkg.length, 2),
      cepOrigin: fromCep,
      cepDestination: String(customer!.cep || "").replace(/\D/g, ""),
      addressSnapshot: addressLine(customer!),
      environment: cfg.environment,
      payload: data,
    })
    .returning();

  return { ok: true as const, row, usedFallbackPackage: pkg.usedFallback };
}

/* ==================================================================
 *  CHECKOUT  ⚠ CONSOME SALDO REAL
 * ================================================================== */

export async function checkoutShipment(shipmentId: number) {
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  if (!ship) return { error: "Envio não encontrado", status: 404 } satisfies ShipError;
  if (!ship.superfreteOrderId) {
    return { error: "Envio sem id na SuperFrete", status: 409 } satisfies ShipError;
  }
  if (ship.status === "pago" || ship.status === "postado" || ship.status === "entregue") {
    return { ok: true as const, row: ship, alreadyPaid: true };
  }

  const cfg = await getSuperfreteConfig();

  /* Confere saldo ANTES de tentar pagar — erro de saldo da API é
     genérico e o operador ficaria sem saber o que aconteceu. */
  const account = await getAccount(cfg);
  if (!("error" in account)) {
    const price = toNumber(ship.price, 0);
    if (account.account.balance < price) {
      return {
        error: `Saldo insuficiente na SuperFrete: R$ ${account.account.balance.toFixed(
          2
        )} disponível, etiqueta custa R$ ${price.toFixed(2)}. Recarregue em superfrete.com.`,
        status: 402,
        details: { balance: account.account.balance, price },
      } satisfies ShipError;
    }
  }

  const res = await call<RawQuote>(cfg, "/api/v0/checkout", {
    method: "POST",
    body: { orders: [ship.superfreteOrderId] },
  });

  if ("error" in res) {
    await db
      .update(shipments)
      .set({ lastError: res.error, updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId));
    return res;
  }

  const purchase = res.data;
  const paidOrder = Array.isArray(purchase?.orders)
    ? purchase.orders.find((o: RawQuote) => String(o.id) === ship.superfreteOrderId) ||
      purchase.orders[0]
    : purchase;

  const [row] = await db
    .update(shipments)
    .set({
      status: "pago",
      paidAt: new Date(),
      trackingCode: paidOrder?.tracking ? String(paidOrder.tracking) : ship.trackingCode,
      price: toDecimalString(toNumber(paidOrder?.price ?? ship.price, 0), 2),
      payload: purchase,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(shipments.id, shipmentId))
    .returning();

  await syncDeliveryAndFinance(row);
  return { ok: true as const, row };
}

/* ==================================================================
 *  ETIQUETA E RASTREIO
 * ================================================================== */

export async function printLabel(shipmentId: number) {
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  if (!ship) return { error: "Envio não encontrado", status: 404 } satisfies ShipError;
  if (ship.status === "cotado" || ship.status === "no_carrinho") {
    return {
      error: "Pague a etiqueta antes de imprimir (checkout pendente).",
      status: 409,
    } satisfies ShipError;
  }

  const cfg = await getSuperfreteConfig();
  const res = await call<RawQuote>(cfg, "/api/v0/tag/print", {
    method: "POST",
    body: { orders: [ship.superfreteOrderId], mode: "private" },
  });
  if ("error" in res) return res;

  const url = String(res.data?.url || res.data?.link || "");
  if (url) {
    await db
      .update(shipments)
      .set({ labelUrl: url, status: "postado", postedAt: ship.postedAt || new Date(), updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId));
  }
  return { ok: true as const, url, data: res.data };
}

export async function trackShipment(shipmentId: number) {
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  if (!ship) return { error: "Envio não encontrado", status: 404 } satisfies ShipError;
  if (!ship.superfreteOrderId) {
    return { error: "Envio sem id na SuperFrete", status: 409 } satisfies ShipError;
  }

  const cfg = await getSuperfreteConfig();
  const res = await call<RawQuote>(cfg, "/api/v0/tag/tracking", {
    method: "POST",
    body: { orders: [ship.superfreteOrderId] },
  });
  if ("error" in res) return res;

  const entry = Array.isArray(res.data)
    ? res.data[0]
    : res.data?.[ship.superfreteOrderId] || res.data;

  const statusText = String(entry?.status || entry?.tracking_status || "").toLowerCase();
  const tracking = entry?.tracking ? String(entry.tracking) : ship.trackingCode;

  let status = ship.status;
  if (statusText.includes("entregue") || statusText === "delivered") status = "entregue";
  else if (statusText.includes("transito") || statusText.includes("transit")) status = "em_transito";
  else if (statusText.includes("posted") || statusText.includes("postado")) status = "postado";

  const [row] = await db
    .update(shipments)
    .set({
      status,
      trackingCode: tracking,
      trackingStatus: entry?.status ? String(entry.status) : ship.trackingStatus,
      deliveredAt: status === "entregue" ? ship.deliveredAt || new Date() : ship.deliveredAt,
      payload: entry ?? ship.payload,
      updatedAt: new Date(),
    })
    .where(eq(shipments.id, shipmentId))
    .returning();

  await syncDeliveryAndFinance(row);
  return { ok: true as const, row, tracking: entry };
}

export async function cancelShipment(shipmentId: number, reason: string) {
  const clean = String(reason || "").trim();
  if (clean.length < 3) {
    return { error: "Informe o motivo do cancelamento", status: 400 } satisfies ShipError;
  }
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  if (!ship) return { error: "Envio não encontrado", status: 404 } satisfies ShipError;

  /* Só chama a API se já houver compra do outro lado. */
  if (ship.status === "pago") {
    const cfg = await getSuperfreteConfig();
    const res = await call(cfg, "/api/v0/order/cancel", {
      method: "POST",
      body: { order: { id: ship.superfreteOrderId, reason_id: "2", description: clean } },
    });
    if ("error" in res) return res;
  }

  const [row] = await db
    .update(shipments)
    .set({ status: "cancelado", lastError: clean, updatedAt: new Date() })
    .where(eq(shipments.id, shipmentId))
    .returning();

  return { ok: true as const, row };
}

/* ==================================================================
 *  INTEGRAÇÃO COM ENTREGAS E FINANCEIRO
 * ================================================================== */

const SHIP_TO_DELIVERY: Record<string, string> = {
  cotado: "aguardando",
  no_carrinho: "aguardando",
  pago: "separado",
  postado: "em_rota",
  em_transito: "em_rota",
  entregue: "entregue",
  cancelado: "cancelado",
};

/**
 * Espelha o envio em `deliveries` (o módulo de entregas que o resto do
 * sistema já usa) e lança o custo da etiqueta como despesa.
 */
export async function syncDeliveryAndFinance(ship: typeof shipments.$inferSelect) {
  const cfg = await getSuperfreteConfig();
  const deliveryStatus = SHIP_TO_DELIVERY[ship.status] || "aguardando";

  /* ---------- entrega ---------- */
  let deliveryId = ship.deliveryId;
  if (ship.orderId) {
    const [existing] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.orderId, ship.orderId))
      .limit(1);

    const data = {
      customerId: ship.customerId,
      method: "correios",
      status: deliveryStatus,
      trackingCode: ship.trackingCode,
      deliveryFee: toDecimalString(toNumber(ship.price, 0), 2),
      addressSnapshot: ship.addressSnapshot,
      deliveredAt: ship.status === "entregue" ? ship.deliveredAt || new Date() : null,
    };

    if (existing) {
      await db.update(deliveries).set(data).where(eq(deliveries.id, existing.id));
      deliveryId = existing.id;
    } else {
      const [created] = await db
        .insert(deliveries)
        .values({
          orderId: ship.orderId,
          ...data,
          notes: `Gerada pelo módulo SuperFrete (${ship.serviceName || "envio"}).`,
        })
        .returning();
      deliveryId = created.id;
    }

    /* status de entrega do pedido acompanha o envio */
    await db
      .update(orders)
      .set({ deliveryStatus, updatedAt: new Date() })
      .where(eq(orders.id, ship.orderId));
  }

  if (deliveryId && deliveryId !== ship.deliveryId) {
    await db.update(shipments).set({ deliveryId }).where(eq(shipments.id, ship.id));
  }

  /* ---------- financeiro ----------
     Só depois de pago: cotação não é despesa. */
  if (cfg.postExpense && ship.status !== "cotado" && ship.status !== "no_carrinho") {
    const cost = toNumber(ship.price, 0);
    if (cost > 0 && ship.status !== "cancelado") {
      await db.transaction(async (tx) => {
        await upsertAutoTransaction(tx, {
          type: "despesa",
          category: "frete",
          description: `Etiqueta ${ship.serviceName || "SuperFrete"} · envio #${ship.id}${
            ship.trackingCode ? ` · ${ship.trackingCode}` : ""
          }`,
          amount: cost,
          dueDate: todayISO(),
          paidDate: ship.paidAt ? todayISO() : null,
          status: ship.paidAt ? "pago" : "pendente",
          method: "SuperFrete",
          customerId: ship.customerId,
          orderId: ship.orderId,
          saleId: ship.saleId,
          notes: "Lançada automaticamente pelo módulo de Envios.",
        });
      });
    }
  }
}

/* ==================================================================
 *  CONSULTAS
 * ================================================================== */

/**
 * Reprocessa o espelhamento de um envio em Entregas/Financeiro.
 * Útil quando o sync falhou por indisponibilidade momentânea.
 */
export async function resyncShipment(shipmentId: number) {
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  if (!ship) return { error: "Envio não encontrado", status: 404 } satisfies ShipError;
  await syncDeliveryAndFinance(ship);
  const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
  return { ok: true as const, row };
}

export async function listShipments(limit = 100) {
  return db.select().from(shipments).orderBy(desc(shipments.createdAt)).limit(limit);
}

export async function getShipmentsByOrder(orderId: number) {
  return db
    .select()
    .from(shipments)
    .where(and(eq(shipments.orderId, orderId)))
    .orderBy(desc(shipments.createdAt));
}
