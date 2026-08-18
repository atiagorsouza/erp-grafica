"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Combobox,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { ShippingQuote, type QuoteOption } from "@/components/modules/ShippingQuote";
import { cn } from "@/lib/format";
import {
  applyDiscount,
  cardFeeAmount,
  formatBRL,
  round2,
  toNumber,
  toPositive,
} from "@/lib/money";
import { isWhatsAppBlocked, whatsappNumber } from "@/lib/validators";

import type { CompanyIdentity } from "@/lib/company";
export type PosCompany = CompanyIdentity;

/* ==================================================================
   TIPOS DA APLICAÇÃO
   ================================================================== */

export type PosProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode?: string | null;
  finalPrice: string | number | null;
  productCategoryId: number | null;
  active: boolean | null;
  trackStock: boolean | null;
  stock: string | number | null;
  minStock: string | number | null;
  /** custo direto — usado para mostrar a margem real da venda (v3.28.0) */
  costSnapshot?: string | number | null;
  /** faixas de preço por quantidade (v3.37.0) */
  priceTiers?: { minQuantity: string | number; unitPrice: string | number; label?: string | null }[];
};

export type PosCategory = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
};

export type PosCustomer = {
  id: number;
  name: string;
  tradeName: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  /* PJ: quem recebe a nota/entrega no cliente (v3.21.0) */
  contactName?: string | null;
  /* cliente pediu para não receber WhatsApp (v3.22.0) */
  whatsappOptOut?: boolean | null;
};


export type PdvConfig = {
  sellerDefault: string;
  deliveryDefault: string;
  allowNegativeStock: boolean;
  requireCustomer: boolean;
  requireOpenCash: boolean;
  receiptFooter: string;
  /** peso da fonte no cupom impresso (400–800), ajustável no Painel */
  receiptBoldness?: number;
  /* Regras de pagamento (v3.28.0) — todas vindas do Painel de Controle.
     O preço de tabela já embute o pior meio aceito, então PIX e dinheiro
     têm desconto e o parcelamento tem piso de valor. */
  pixDiscountRate?: number;
  installmentMin?: number;
  installmentMax?: number;
  minMarginRate?: number;
  taxRate?: number;
};

export type CashSession = {
  id: number;
  operator: string | null;
  openingAmount: string | number | null;
  openedAt: string | Date;
} | null;

type CartLine = {
  key: string;
  productId: number | null;
  description: string;
  unitPrice: number;
  quantity: number;
  unitLabel?: string;
  /** custo unitário no momento da venda, para a análise de margem */
  costSnapshot?: number;
  /* --------------------------------------------------------------
   * FAIXAS POR QUANTIDADE (v3.37.0)
   *
   * Guardadas NA LINHA para a reprecificação não depender de procurar
   * o produto de novo a cada clique no +/-. O servidor recalcula tudo
   * na hora de fechar — isto aqui é só para a tela não mentir.
   * ------------------------------------------------------------- */
  priceTiers?: { minQuantity: number; unitPrice: number; label?: string | null }[];
  /** menor quantidade vendável; 0 = sem mínimo */
  minQuantity?: number;
  /** rótulo da faixa ativa, mostrado na linha do carrinho */
  tierLabel?: string | null;
};

/** Rascunho do carrinho espelhado no navegador (recuperação após F5/queda). */
/**
 * Reprecifica a linha do carrinho segundo a faixa de quantidade.
 *
 * Espelha `resolvePriceTier` do servidor: vale a MAIOR faixa cujo
 * mínimo cabe na quantidade. A conta é refeita a cada +/- porque o
 * preço unitário muda no meio da venda — passar de 99 para 100 un
 * derruba o unitário, e a tela precisa mostrar isso na hora.
 *
 * O servidor recalcula tudo de novo em `createSale`; esta função existe
 * para a tela não mentir para o operador, não para definir o preço.
 */
function repriceLine(line: CartLine): CartLine {
  const tiers = line.priceTiers;
  if (!tiers || tiers.length === 0) return line;

  const applicable = tiers.reduce<(typeof tiers)[number] | null>(
    (acc, t) => (line.quantity >= t.minQuantity ? t : acc),
    null
  );
  /* Abaixo do mínimo mantemos o preço da menor faixa: o aviso visual
     fica por conta de `minQuantity`, e o servidor recusa no fechamento. */
  const chosen = applicable || tiers[0];
  return { ...line, unitPrice: round2(chosen.unitPrice), tierLabel: chosen.label ?? null };
}

const DRAFT_KEY = "pdv_cart_draft";
/** Rascunho de mais de 12h é lixo de turno anterior. */
const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

type PosDraft = {
  savedAt: number;
  clientRef: string;
  cart: CartLine[];
  customerId: string;
  discountInput: string;
  discountMode: "value" | "percent";
  payment: string;
  sellerName: string;
  deliveryMode: string;
  notes: string;
};

/** Uma parcela do pagamento dividido. `amount` é o valor líquido digitado
 *  pelo operador; a taxa de cartão é somada pelo servidor. */
type SplitLine = { key: string; method: string; amount: string };

/** Linha de "últimas vendas" vinda de /api/pdv/recent-sales. */
type RecentSale = {
  id: number;
  number: string;
  total: string | number;
  subtotal: string | number;
  discount: string | number;
  cardFee: string | number;
  paymentMethod: string | null;
  payments: unknown;
  receivedAmount: string | number | null;
  changeAmount: string | number | null;
  status: string;
  items: unknown;
  sellerName: string | null;
  deliveryMode: string | null;
  deliveryDate: string | null;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  customerId: number | null;
  customerName: string | null;
  customerDocument: string | null;
  customerPhone: string | null;
};

type ReceiptData = {
  number: string;
  soldAt: Date;
  items: CartLine[];
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  payment: string;
  received: number | null;
  change: number | null;
  customer: PosCustomer | null;
  sellerName: string;
  deliveryMode: string;
  deliveryDate: string;
  notes: string;
  /** parcelas do pagamento dividido, já com a taxa aplicada pelo servidor */
  splits?: { method: string; amount: number }[] | null;
};

const PAYMENTS = [
  { id: "PIX", label: "PIX", icon: "arrow-up-right" as const },
  { id: "Dinheiro", label: "Dinheiro", icon: "wallet" as const },
  { id: "Débito", label: "Débito", icon: "receipt" as const },
  { id: "Crédito", label: "Crédito", icon: "receipt" as const },
];

const DELIVERY_OPTIONS = [
  "Entrega direto para o cliente",
  "Retirada no balcão",
  "Envio por Motoboy / Transportadora",
];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pdv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ==================================================================
   COMPONENTE PRINCIPAL DO PDV
   ================================================================== */

export function PosClient({
  products: allProducts,
  productCats,
  customers: initialCustomers,
  company,
  cardFeeDebit,
  cardFeeCredit,
  pdvConfig,
  cashSession: initialSession,
}: {
  products: PosProduct[];
  productCats: PosCategory[];
  customers: PosCustomer[];
  company: PosCompany;
  cardFeeDebit: number;
  cardFeeCredit: number;
  pdvConfig: PdvConfig;
  cashSession: CashSession;
}) {
  const router = useRouter();

  /* ---------- estados locais ---------- */
  const [customersList, setCustomersList] = useState<PosCustomer[]>(initialCustomers);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discountInput, setDiscountInput] = useState("0");
  const [discountMode, setDiscountMode] = useState<"value" | "percent">("value");
  const [payment, setPayment] = useState("PIX");
  const [receivedInput, setReceivedInput] = useState("");
  /* pagamento dividido (v3.15.0): quando ativo, `payment` é ignorado e
     a venda vai com `payments[]`. O backend já precificava a taxa por
     parcela desde a v3.10 — só a tela não usava. */
  const [splitOn, setSplitOn] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);
  const [sellerName, setSellerName] = useState(pdvConfig.sellerDefault || "OPERADOR");
  const [deliveryMode, setDeliveryMode] = useState(
    pdvConfig.deliveryDefault || "Retirada no balcão"
  );
  const [deliveryDate, setDeliveryDate] = useState("");
  /* frete cotado na SuperFrete (v3.12.0) */
  const [shipping, setShipping] = useState<QuoteOption | null>(null);
  const [notes, setNotes] = useState(pdvConfig.receiptFooter || "");
  const [showExtraFields, setShowExtraFields] = useState(false);

  const [charging, setCharging] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [confirmOversell, setConfirmOversell] = useState<string | null>(null);
  const [freeItemOpen, setFreeItemOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [session, setSession] = useState<CashSession>(initialSession);
  /* últimas vendas (v3.15.0): reimpressão de cupom e cancelamento
     direto do balcão, sem depender do módulo de Vendas. */
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RecentSale | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<string>(uid());
  const chargingLock = useRef(false);

  /* Preferência local do vendedor, lida uma vez na montagem.
     Antes era um useEffect com setState — cascata de render que o
     React 19 sinaliza como erro. */
  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem("pdv_seller_name");
      } catch {
        return null;
      }
    })();
    if (saved) {
      startTransition(() => setSellerName(saved));
    }
  }, []);

  /* ---------------- recuperação de carrinho ----------------
     Queda de energia, F5 acidental ou aba fechada no meio do
     atendimento apagavam o carrinho inteiro. Agora ele é espelhado no
     localStorage e oferecido de volta na próxima abertura.
     Só o rascunho: nada aqui substitui a venda gravada no servidor. */
  const [draftOffer, setDraftOffer] = useState<PosDraft | null>(null);
  const draftLoaded = useRef(false);

  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PosDraft;
      /* rascunho velho não interessa — o balcão já virou */
      if (!parsed?.cart?.length || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      startTransition(() => setDraftOffer(parsed));
    } catch {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
  }, []);

  /* Espelha o carrinho a cada mudança. Gravação é barata e síncrona;
     não vale a pena debounce para um carrinho de balcão. */
  useEffect(() => {
    try {
      if (cart.length === 0) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const draft: PosDraft = {
        savedAt: Date.now(),
        clientRef: clientRef.current,
        cart,
        customerId,
        discountInput,
        discountMode,
        payment,
        sellerName,
        deliveryMode,
        notes,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [cart, customerId, discountInput, discountMode, payment, sellerName, deliveryMode, notes]);

  const restoreDraft = useCallback((d: PosDraft) => {
    /* Rascunho guarda o preço congelado da sessão anterior. As faixas
       podem ter sido editadas no intervalo, então reprecificamos ao
       restaurar em vez de confiar no que estava no localStorage. */
    setCart(d.cart.map(repriceLine));
    setCustomerId(d.customerId || "");
    setDiscountInput(d.discountInput || "0");
    setDiscountMode(d.discountMode === "percent" ? "percent" : "value");
    setPayment(d.payment || "PIX");
    if (d.sellerName) setSellerName(d.sellerName);
    if (d.deliveryMode) setDeliveryMode(d.deliveryMode);
    if (d.notes) setNotes(d.notes);
    /* mantém o clientRef original: se a venda chegou a ser enviada
       antes da queda, a idempotência do servidor evita duplicar */
    if (d.clientRef) clientRef.current = d.clientRef;
    setDraftOffer(null);
  }, []);

  const discardDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDraftOffer(null);
  }, []);

  /* Sincroniza a sessão quando o servidor revalida, sem efeito:
     ajuste durante o render é o padrão recomendado para estado
     derivado de props. */
  const [lastSession, setLastSession] = useState(initialSession);
  if (initialSession !== lastSession) {
    setLastSession(initialSession);
    setSession(initialSession);
  }

  const handleSellerChange = (name: string) => {
    setSellerName(name);
    try {
      localStorage.setItem("pdv_seller_name", name);
    } catch {}
  };

  /* ---------------- catálogo ---------------- */
  const products = useMemo(() => allProducts.filter((p) => p.active !== false), [allProducts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      const matchTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        String(p.sku || "").toLowerCase().includes(term) ||
        String(p.barcode || "").toLowerCase().includes(term);
      const matchCat = catFilter === "all" || String(p.productCategoryId) === catFilter;
      return matchTerm && matchCat;
    });
  }, [products, q, catFilter]);

  /* ---------------- cliente selecionado ---------------- */
  const selectedCustomer = useMemo(
    () => customersList.find((c) => String(c.id) === customerId) || null,
    [customersList, customerId]
  );

  /* ---------------- totais ---------------- */
  const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const discount = applyDiscount(subtotal, discountInput, discountMode);
  const shippingFee = round2(shipping?.price || 0);
  const net = round2(subtotal - discount + shippingFee);
  const feeRate = payment === "Crédito" ? cardFeeCredit : payment === "Débito" ? cardFeeDebit : 0;

  /* Taxa: no modo dividido cada parcela paga a sua (espelha o cálculo do
     servidor em `lib/sales.ts`, que aplica a alíquota por linha). */
  const splitParsed = useMemo(
    () => splitLines.map((l) => ({ ...l, value: toPositive(l.amount) })),
    [splitLines]
  );
  const splitSum = round2(splitParsed.reduce((s, l) => s + l.value, 0));
  const splitFee = round2(
    splitParsed.reduce((s, l) => {
      const rate = l.method === "Crédito" ? cardFeeCredit : l.method === "Débito" ? cardFeeDebit : 0;
      return s + (rate > 0 ? cardFeeAmount(l.value, rate) : 0);
    }, 0)
  );
  /* Sobra a distribuir entre as parcelas — o operador precisa zerar. */
  const splitRemaining = round2(net - splitSum);
  const splitBalanced = Math.abs(splitRemaining) <= 0.05;

  const fee = splitOn ? splitFee : feeRate > 0 ? cardFeeAmount(net, feeRate) : 0;
  const total = round2(net + fee);
  const totalQty = cart.reduce((s, l) => s + l.quantity, 0);

  /* ---------------- regras de pagamento (v3.28.0) ----------------
   *
   * O preço de tabela embute o pior meio aceito (3x sem juros). Quem
   * paga PIX ou dinheiro não passa pela adquirente, então esse custo
   * volta para o cliente como desconto à vista — em vez de "acréscimo
   * no cartão", que irrita e é problema no Procon quando não informado.
   */
  const pixDiscountRate = Math.max(pdvConfig.pixDiscountRate ?? 0, 0);
  const installmentMin = Math.max(pdvConfig.installmentMin ?? 0, 0);
  const installmentMax = Math.max(pdvConfig.installmentMax ?? 1, 1);
  const minMarginRate = Math.max(pdvConfig.minMarginRate ?? 0, 0);
  const taxRate = Math.max(pdvConfig.taxRate ?? 0, 0);

  const aVista = !splitOn && (payment === "PIX" || payment === "Dinheiro");
  const cashDiscount = aVista && pixDiscountRate > 0 ? round2(net * pixDiscountRate) : 0;
  /* total que o cliente realmente paga, já com o desconto à vista */
  const totalDue = round2(total - cashDiscount);

  /* Parcelamento sem juros: só acima do piso configurado. Abaixo disso a
     parcela fica pequena demais para justificar o custo da operação. */
  const canInstall = payment === "Crédito" && !splitOn && totalDue >= installmentMin && installmentMin > 0;
  const installmentValue = canInstall ? round2(totalDue / installmentMax) : 0;

  /* Margem real desta venda: o que sobra depois de imposto e taxa,
     comparado ao custo dos itens. Responde "vale a pena?" na hora. */
  const cartCost = round2(
    cart.reduce((s, l) => s + toNumber(l.costSnapshot, 0) * l.quantity, 0)
  );
  const saleMargin = useMemo(() => {
    if (totalDue <= 0 || cartCost <= 0) return null;
    const taxAmount = totalDue * taxRate;
    const netReceived = totalDue - fee - taxAmount;
    const profit = netReceived - cartCost;
    return {
      netReceived: round2(netReceived),
      profit: round2(profit),
      rate: profit / totalDue,
      belowFloor: minMarginRate > 0 && profit / totalDue < minMarginRate - 1e-9,
    };
  }, [totalDue, cartCost, fee, taxRate, minMarginRate]);

  /* Parcela em dinheiro: no split pode conviver com cartão/PIX. */
  /* `totalDue`, não `total`: em dinheiro o desconto à vista já foi
     aplicado, e cobrar/`trocar` pelo valor cheio daria troco errado. */
  const cashPortion = splitOn
    ? round2(splitParsed.filter((l) => l.method === "Dinheiro").reduce((s, l) => s + l.value, 0))
    : totalDue;
  const isCash = splitOn
    ? splitParsed.some((l) => l.method === "Dinheiro" && l.value > 0)
    : payment === "Dinheiro";
  const received = toPositive(receivedInput);
  const change = isCash && received > 0 ? round2(received - cashPortion) : 0;
  const missingCash = isCash && received > 0 && received < cashPortion;

  /* ---------------- ações do carrinho ---------------- */
  const addProduct = useCallback((p: PosProduct) => {
    const price = toNumber(p.finalPrice, 0);
    const tiers = (p.priceTiers || [])
      .map((t) => ({ minQuantity: toNumber(t.minQuantity, 0), unitPrice: toNumber(t.unitPrice, 0), label: t.label ?? null }))
      .filter((t) => t.minQuantity > 0)
      .sort((a, b) => a.minQuantity - b.minQuantity);

    /* Sem faixas o produto precisa de preço próprio. Com faixas o
       `finalPrice` pode até estar zerado — quem manda é a faixa. */
    if (price <= 0 && tiers.length === 0) {
      toast.error("Produto sem preço", `"${p.name}" está sem preço final definido.`);
      return;
    }

    /* Produto com mínimo entra no carrinho JÁ na quantidade mínima:
       adicionar 1 un de um item que só sai a partir de 50 mostraria um
       preço que o servidor vai recusar no fechamento. */
    const minQuantity = tiers.length > 0 ? tiers[0].minQuantity : 0;
    const startQty = minQuantity > 0 ? minQuantity : 1;

    setCart((c) => {
      const found = c.find((l) => l.productId === p.id);
      if (found)
        return c.map((l) =>
          l.productId === p.id ? repriceLine({ ...l, quantity: l.quantity + 1 }) : l
        );
      return [
        ...c,
        repriceLine({
          key: `p${p.id}`,
          productId: p.id,
          description: p.name,
          unitPrice: round2(price),
          quantity: startQty,
          unitLabel: "UNI",
          costSnapshot: toNumber(p.costSnapshot, 0),
          priceTiers: tiers,
          minQuantity,
        }),
      ];
    });

    if (minQuantity > 0) {
      toast.info(`Mínimo de ${minQuantity} un`, `"${p.name}" é vendido em lote.`);
    }
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((c) =>
      c
        .map((l) => (l.key === key ? repriceLine({ ...l, quantity: Math.max(0, round2(qty)) }) : l))
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((key: string) => setCart((c) => c.filter((l) => l.key !== key)), []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountInput("0");
    setReceivedInput("");
    setCustomerId("");
    setSplitOn(false);
    setSplitLines([]);
    clientRef.current = uid();
    /* venda fechada: o rascunho perdeu a razão de existir */
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, []);

  /* ---------------- pagamento dividido ---------------- */
  const addSplitLine = useCallback((method: string, amount: string) => {
    setSplitLines((ls) => [...ls, { key: uid(), method, amount }]);
  }, []);

  const updateSplitLine = useCallback((key: string, patch: Partial<SplitLine>) => {
    setSplitLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const removeSplitLine = useCallback(
    (key: string) => setSplitLines((ls) => ls.filter((l) => l.key !== key)),
    []
  );

  /* Ao ligar o split, começa com a forma já escolhida cobrindo tudo:
     o caso comum é "metade nisso, metade naquilo". */
  const toggleSplit = useCallback(() => {
    setSplitOn((on) => {
      if (!on) {
        setSplitLines([{ key: uid(), method: payment, amount: "" }]);
        setReceivedInput("");
      } else {
        setSplitLines([]);
      }
      return !on;
    });
  }, [payment]);

  /* ---------------- últimas vendas ---------------- */
  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch("/api/pdv/recent-sales?limit=20", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "falha ao carregar");
      setRecentSales(json.sales as RecentSale[]);
    } catch (e) {
      toast.error("Não foi possível carregar as vendas", e instanceof Error ? e.message : undefined);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const openRecent = useCallback(() => {
    setRecentOpen(true);
    void loadRecent();
  }, [loadRecent]);

  /* Remonta o cupom a partir da venda gravada — inclusive de venda
     antiga, já que os itens ficam em jsonb. */
  const reprint = useCallback(
    (s: RecentSale) => {
      const rawItems = Array.isArray(s.items)
        ? (s.items as {
            productId: number | null;
            description: string;
            quantity: number | string;
            unitPrice: number | string;
            total?: number | string;
          }[])
        : [];
      const items: CartLine[] = rawItems.map((it, i) => ({
        key: `r${i}`,
        productId: it.productId ?? null,
        description: it.description,
        quantity: toNumber(it.quantity, 0),
        unitPrice: toNumber(it.unitPrice, 0),
        unitLabel: "UNI",
      }));

      const cust = customersList.find((c) => c.id === s.customerId) || null;

      setReceipt({
        number: s.number,
        soldAt: new Date(s.createdAt),
        items,
        subtotal: toNumber(s.subtotal, 0),
        discount: toNumber(s.discount, 0),
        fee: toNumber(s.cardFee, 0),
        total: toNumber(s.total, 0),
        payment: s.paymentMethod || "—",
        splits: Array.isArray(s.payments)
          ? (s.payments as { method: string; amount: number }[])
          : null,
        received: s.receivedAmount != null ? toNumber(s.receivedAmount, 0) : null,
        change: s.changeAmount != null ? toNumber(s.changeAmount, 0) : null,
        customer: cust,
        sellerName: s.sellerName || "OPERADOR",
        deliveryMode: s.deliveryMode || "",
        deliveryDate: s.deliveryDate || "",
        notes: s.notes || "",
      });
      setRecentOpen(false);
    },
    [customersList]
  );

  const confirmCancel = useCallback(
    async (reason: string) => {
      if (!cancelTarget) return;
      try {
        const res = await fetch("/api/crud/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "cancel", id: cancelTarget.id, reason }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "falha ao cancelar");
        toast.success(
          "Venda cancelada",
          `${cancelTarget.number} · estoque e financeiro estornados`
        );
        setCancelTarget(null);
        await loadRecent();
        router.refresh();
      } catch (e) {
        toast.error("Não foi possível cancelar", e instanceof Error ? e.message : undefined);
      }
    },
    [cancelTarget, loadRecent, router]
  );

  /* ---------------- leitor de código de barras ---------------- */
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim().toLowerCase();
    if (!term) return;
    const exact =
      products.find((p) => String(p.barcode || "").toLowerCase() === term) ||
      products.find((p) => String(p.sku || "").toLowerCase() === term);
    const target = exact || (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      addProduct(target);
      setQ("");
    } else if (filtered.length === 0) {
      toast.error("Nada encontrado", `Nenhum produto para "${q}".`);
    }
  }



  /* ---------------- FINALIZAR VENDA (SEM REFRESH BLOQUEANTE) ---------------- */
  async function checkout(allowNegativeStock = false) {
    if (chargingLock.current || charging) return;
    if (cart.length === 0) return toast.error("Carrinho vazio");
    if (pdvConfig.requireOpenCash && !session) {
      toast.error("Caixa fechado", "Abra o caixa antes de vender.");
      setCashOpen(true);
      return;
    }
    if (pdvConfig.requireCustomer && !customerId) {
      return toast.error("Cliente obrigatório", "Identifique o cliente antes de finalizar.");
    }
    if (splitOn) {
      const valid = splitParsed.filter((l) => l.value > 0);
      if (valid.length === 0) {
        return toast.error("Pagamento dividido vazio", "Informe ao menos um valor.");
      }
      if (!splitBalanced) {
        return toast.error(
          "Pagamento dividido não fecha",
          splitRemaining > 0
            ? `Faltam ${formatBRL(splitRemaining)} a distribuir.`
            : `Há ${formatBRL(Math.abs(splitRemaining))} a mais que o total.`
        );
      }
    }
    if (isCash && received <= 0) {
      return toast.error("Informe o valor recebido em dinheiro");
    }
    if (missingCash) {
      return toast.error(
        splitOn ? "Recebido menor que a parcela em dinheiro" : "Valor recebido menor que o total"
      );
    }

    chargingLock.current = true;
    setCharging(true);

    const now = new Date();
    const dateFormatted = now.toLocaleDateString("pt-BR");
    const timeFormatted = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const finalDeliveryDate = deliveryDate.trim() || `${dateFormatted} Hora: ${timeFormatted}`;
    const cartSnapshot = [...cart];
    /* Parcelas válidas, com o valor líquido; o servidor soma a taxa. */
    const splitPayload = splitOn
      ? splitParsed.filter((l) => l.value > 0).map((l) => ({ method: l.method, amount: l.value }))
      : null;
    const paymentLabel = splitPayload
      ? splitPayload.map((p) => p.method).join(" + ")
      : payment;
    /* O desconto à vista entra como desconto normal: o servidor
       recalcula o total pelo catálogo e não conhece a regra do PIX.
       Sem somar aqui, a venda fecharia pelo valor cheio. */
    const totalsSnapshot = {
      subtotal,
      discount: round2(discount + cashDiscount),
      fee,
      total: totalDue,
      payment: paymentLabel,
      received,
      change,
    };

    try {
      const res = await fetch("/api/crud/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRef: clientRef.current,
          customerId: customerId ? Number(customerId) : null,
          type: cartSnapshot.every((l) => !l.productId)
            ? "servico"
            : cartSnapshot.some((l) => !l.productId)
              ? "mixto"
              : "produto",
          items: cartSnapshot.map((l) => ({
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          discount: totalsSnapshot.discount,
          discountMode: "value",
          shippingFee: shipping?.price ?? 0,
          shippingService: shipping ? `${shipping.name} · ${shipping.carrier}` : null,
          shippingServiceId: shipping?.serviceId ?? null,
          paymentMethod: splitPayload ? undefined : payment,
          payments: splitPayload ?? undefined,
          receivedAmount: isCash && received > 0 ? received : undefined,
          cashSessionId: session?.id ?? null,
          allowNegativeStock: allowNegativeStock || pdvConfig.allowNegativeStock,
          sellerName,
          deliveryMode,
          deliveryDate: finalDeliveryDate,
          notes,
        }),
      });
      const json = await res.json();

      if (res.status === 409 && json.details?.code === "CASH_CLOSED") {
        toast.error("Caixa fechado", json.error);
        setCashOpen(true);
        return;
      }
      if (res.status === 409 && json.details?.shortages) {
        setConfirmOversell(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error || "erro ao registrar venda");

      const row = json.row;

      const newReceipt: ReceiptData = {
        number: String(row.number),
        soldAt: row.createdAt ? new Date(row.createdAt) : now,
        items: cartSnapshot,
        subtotal: totalsSnapshot.subtotal,
        discount: totalsSnapshot.discount,
        fee: toNumber(row.cardFee, totalsSnapshot.fee),
        total: toNumber(row.total, totalsSnapshot.total),
        payment: paymentLabel,
        /* o servidor devolve as parcelas já com a taxa embutida */
        splits: Array.isArray(row.payments)
          ? (row.payments as { method: string; amount: number }[])
          : splitPayload,
        received: isCash && received > 0 ? received : null,
        change: isCash && received > 0 ? change : null,
        customer: selectedCustomer,
        sellerName,
        deliveryMode,
        deliveryDate: finalDeliveryDate,
        notes,
      };

      setReceipt(newReceipt);
      toast.success(
        json.duplicated ? "Venda já registrada" : "Venda concluída com sucesso!",
        `${row.number} · ${formatBRL(row.total)}`
      );
      setConfirmOversell(null);
      clearCart();
    } catch (e) {
      toast.error("Falha na venda", e instanceof Error ? e.message : undefined);
    } finally {
      chargingLock.current = false;
      setCharging(false);
    }
  }

  /* ---------------- atalhos de teclado ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        setPayment((p) => PAYMENTS[(PAYMENTS.findIndex((x) => x.id === p) + 1) % PAYMENTS.length].id);
      } else if (e.key === "F5") {
        /* F5 recarregaria a página no meio da venda — vira "dividir" */
        e.preventDefault();
        toggleSplit();
      } else if (e.key === "F6") {
        e.preventDefault();
        openRecent();
      } else if (e.key === "F8") {
        e.preventDefault();
        setNewCustomerOpen(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        void checkout();
      } else if (
        e.key === "Escape" &&
        !receipt &&
        !freeItemOpen &&
        !cashOpen &&
        !newCustomerOpen &&
        !recentOpen &&
        !cancelTarget
      ) {
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, total, payment, discountInput, receivedInput, receipt, freeItemOpen, cashOpen, newCustomerOpen]);

  /* Quando o operador fecha o cupom ou clica em Nova Venda, atualiza o servidor em segundo plano */
  const handleCloseReceipt = () => {
    setReceipt(null);
    router.refresh();
  };

  /* Opções de clientes para a Combobox de busca inteligente */
  const customerOptions = useMemo(
    () =>
      customersList.map((c) => ({
        value: String(c.id),
        label: `${c.name}${c.tradeName ? ` (${c.tradeName})` : ""}`,
        hint: [c.document, c.phone, c.district, c.city].filter(Boolean).join(" · "),
      })),
    [customersList]
  );

  /* ================================================================ */

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(350px,410px)]">
        {/* ─────────── Catálogo ─────────── */}
        <div className="no-print">
          {pdvConfig.requireOpenCash && !session && (
            <div className="reveal mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2 text-[12.5px] text-amber-900">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Caixa fechado</p>
                  <p className="text-amber-800">
                    Abra o caixa para liberar vendas e manter o fechamento de gaveta correto.
                  </p>
                </div>
              </div>
              <Button size="sm" icon="wallet" onClick={() => setCashOpen(true)}>
                Abrir caixa
              </Button>
            </div>
          )}

          <div className="reveal mb-4 flex flex-wrap items-center gap-2.5">
            <div className="relative w-full max-w-sm">
              <Icon
                name="search"
                size={15}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400"
              />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Bipe o código ou busque produto/SKU… (F2)"
                className="h-11 pl-9.5 text-[14px]"
                autoFocus
              />
            </div>
            <Button variant="outline" size="sm" icon="pencil" onClick={() => setFreeItemOpen(true)}>
              Item avulso
            </Button>
            <Button variant="outline" size="sm" icon="clock" onClick={openRecent}>
              Últimas vendas
            </Button>
            <Button
              variant={session ? "soft" : "outline"}
              size="sm"
              icon="wallet"
              onClick={() => setCashOpen(true)}
            >
              {session ? "Caixa aberto" : "Abrir caixa"}
            </Button>
          </div>

          {/* CARRINHO RECUPERADO */}
          {draftOffer && (
            <div className="reveal mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <Icon name="alert" size={15} className="shrink-0 text-amber-700" />
              <p className="flex-1 text-[12.5px] leading-snug text-amber-900">
                Uma venda não finalizada foi encontrada:{" "}
                <strong>
                  {draftOffer.cart.length}{" "}
                  {draftOffer.cart.length === 1 ? "item" : "itens"}
                </strong>{" "}
                de{" "}
                {new Date(draftOffer.savedAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . Deseja continuar de onde parou?
              </p>
              <Button size="sm" icon="refresh" onClick={() => restoreDraft(draftOffer)}>
                Recuperar
              </Button>
              <Button size="sm" variant="ghost" onClick={discardDraft}>
                Descartar
              </Button>
            </div>
          )}

          <div className="reveal mb-4 flex flex-wrap gap-1.5">
            <button
              onClick={() => setCatFilter("all")}
              className={cn(
                "focus-ring cursor-pointer rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                catFilter === "all"
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400"
              )}
            >
              Tudo
            </button>
            {productCats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(String(c.id))}
                className={cn(
                  "focus-ring cursor-pointer rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                  catFilter === String(c.id)
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400"
                )}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon="tag"
              title="Nenhum produto encontrado"
              hint="Ajuste a busca ou cadastre produtos no catálogo."
            />
          ) : (
            <div className="reveal reveal-1 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const cat = productCats.find((c) => c.id === p.productCategoryId);
                const inCart = cart.find((l) => l.productId === p.id);
                const price = toNumber(p.finalPrice, 0);
                const low = p.trackStock && toNumber(p.stock, 0) <= toNumber(p.minStock, 0);
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className={cn(
                      "focus-ring group relative cursor-pointer overflow-hidden rounded-xl border bg-paper-50 p-3.5 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0",
                      inCart ? "border-proc-c ring-1 ring-proc-c" : "border-paper-200 hover:border-ink-300"
                    )}
                  >
                    <span
                      className="absolute top-0 left-0 h-[3px] w-full"
                      style={{ background: cat?.color || "#0891b2" }}
                    />
                    <span className="font-mono text-[9px] tracking-wider text-ink-400 uppercase">
                      {p.sku || "—"}
                    </span>
                    <p className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] leading-snug font-semibold text-ink-900">
                      {p.name}
                    </p>
                    <div className="mt-2 flex items-end justify-between">
                      <span
                        className={cn(
                          "font-mono text-[16px] leading-none font-semibold tnum",
                          price > 0 ? "text-proc-c-strong" : "text-red-600"
                        )}
                      >
                        {price > 0 ? formatBRL(price) : "sem preço"}
                      </span>
                      {inCart && (
                        <span className="animate-pop-in flex h-6 min-w-6 items-center justify-center rounded-full bg-ink-900 px-1.5 font-mono text-[11px] font-semibold text-white tnum">
                          {inCart.quantity}
                        </span>
                      )}
                    </div>
                    {p.trackStock && (
                      <span
                        className={cn(
                          "mt-1.5 block font-mono text-[9.5px] tnum",
                          low ? "text-red-600" : "text-ink-400"
                        )}
                      >
                        estoque: {toNumber(p.stock, 0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─────────── Cupom / Carrinho Lateral ─────────── */}
        <aside className="no-print lg:sticky lg:top-[74px] lg:h-fit">
          <div className="reveal reveal-2 overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-pop">
            <div className="halftone-light flex items-center justify-between border-b border-ink-800 px-5 py-3.5">
              <div>
                <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-400 uppercase">
                  Frente de caixa
                </p>
                <p className="display-expanded text-[16px] font-bold text-white">Cupom de venda</p>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  title="Limpar carrinho"
                  className="focus-ring cursor-pointer rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-ink-300 transition-colors hover:bg-red-500/20 hover:text-red-300"
                >
                  limpar
                </button>
              )}
            </div>

            <div className="px-5 py-4">
              {/* BUSCA DE CLIENTE & CADASTRO RÁPIDO */}
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <Combobox
                      value={customerId}
                      onChange={setCustomerId}
                      placeholder="Consumidor não identificado"
                      options={customerOptions}
                    />
                  </div>
                  <Button
                    variant="soft"
                    size="sm"
                    title="Cadastrar novo cliente (F8)"
                    onClick={() => setNewCustomerOpen(true)}
                    className="shrink-0 font-semibold"
                  >
                    + Novo
                  </Button>
                </div>

                {/* Exibição resumida do cliente selecionado */}
                {selectedCustomer && (
                  <div className="flex items-start justify-between rounded-lg border border-cyan-500/30 bg-cyan-950/40 p-2 text-[11px] text-cyan-200">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate text-white">{selectedCustomer.name}</p>
                      <p className="font-mono text-[10px] text-cyan-300">
                        {[selectedCustomer.document, selectedCustomer.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(selectedCustomer.street || selectedCustomer.district) && (
                        <p className="truncate text-[10px] text-cyan-400">
                          {[
                            selectedCustomer.street,
                            selectedCustomer.number,
                            selectedCustomer.district,
                            selectedCustomer.city,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setCustomerId("")}
                      className="ml-2 text-cyan-400 hover:text-white"
                      title="Remover cliente"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink-700 py-10 text-center">
                  <Icon name="receipt" size={26} className="mx-auto mb-2 text-ink-500" />
                  <p className="text-[12.5px] font-medium text-ink-300">Bipe ou toque nos produtos</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-500">
                    F2 buscar · F4 pagamento · F5 dividir · F6 últimas · F8 cliente · F9 finalizar
                  </p>
                </div>
              ) : (
                <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
                  {cart.map((l) => (
                    <div
                      key={l.key}
                      className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-paper-50">
                          {l.description}
                        </p>
                        <p className="font-mono text-[10px] text-ink-400 tnum">
                          {formatBRL(l.unitPrice)} un
                          {l.tierLabel && <span className="ml-1 text-cyan-400">· {l.tierLabel}</span>}
                        </p>
                        {(l.minQuantity ?? 0) > 0 && l.quantity < (l.minQuantity ?? 0) && (
                          <p className="font-mono text-[10px] font-semibold text-amber-400">
                            mínimo {l.minQuantity} un
                          </p>
                        )}
                        {(() => {
                          /* Próxima faixa: transforma "leva mais que sai
                             mais barato" em argumento na tela, em vez de
                             deixar o operador descobrir por acaso. */
                          const next = l.priceTiers?.find((t) => t.minQuantity > l.quantity);
                          if (!next || l.quantity < (l.minQuantity ?? 0)) return null;
                          return (
                            <p className="font-mono text-[10px] text-emerald-400">
                              {next.minQuantity}+ sai {formatBRL(next.unitPrice)} un
                            </p>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(l.key, l.quantity - 1)}
                          className="focus-ring flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-md bg-white/10 font-mono text-[13px] text-white transition-colors hover:bg-white/20"
                        >
                          −
                        </button>
                        <input
                          value={l.quantity}
                          onChange={(e) => setQty(l.key, toPositive(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          className="focus-ring h-6.5 w-12 rounded-md border border-ink-700 bg-ink-850 text-center font-mono text-[12px] font-semibold text-white tnum"
                        />
                        <button
                          onClick={() => setQty(l.key, l.quantity + 1)}
                          className="focus-ring flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-md bg-white/10 font-mono text-[13px] text-white transition-colors hover:bg-white/20"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-[70px] shrink-0 text-right font-mono text-[12.5px] font-semibold text-cyan-200 tnum">
                        {formatBRL(l.unitPrice * l.quantity)}
                      </span>
                      <button
                        onClick={() => removeLine(l.key)}
                        title="Remover"
                        className="focus-ring cursor-pointer rounded-md p-1 text-ink-500 transition-colors hover:bg-red-500/20 hover:text-red-300"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* TOTAIS */}
              <div className="mt-3 space-y-2 border-t border-dashed border-ink-700 pt-3">
                <div className="flex items-center justify-between text-[12px] text-ink-300">
                  <span>{totalQty} item(ns)</span>
                  <span className="font-mono tnum">{formatBRL(subtotal)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-400">Desconto</span>
                  <div className="flex overflow-hidden rounded-md border border-ink-700">
                    {(["value", "percent"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setDiscountMode(m)}
                        className={cn(
                          "focus-ring cursor-pointer px-2 py-1 font-mono text-[10px] font-semibold transition-colors",
                          discountMode === m
                            ? "bg-cyan-400/20 text-cyan-300"
                            : "text-ink-400 hover:text-ink-200"
                        )}
                      >
                        {m === "value" ? "R$" : "%"}
                      </button>
                    ))}
                  </div>
                  <Input
                    mono
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="h-8 w-20 border-ink-700 bg-ink-850 text-right text-white"
                  />
                  {discount > 0 && (
                    <span className="ml-auto font-mono text-[10.5px] text-emerald-300 tnum">
                      −{formatBRL(discount)}
                    </span>
                  )}
                </div>

                {shippingFee > 0 && (
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-cyan-300 tnum">
                    <span className="flex items-center gap-1">
                      <Icon name="truck" size={11} />
                      {shipping?.name} · {shipping?.deliveryLabel}
                    </span>
                    <span>+{formatBRL(shippingFee)}</span>
                  </div>
                )}

                {fee > 0 && (
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-amber-300 tnum">
                    <span>
                      taxa {payment.toLowerCase()} ({(feeRate * 100).toFixed(2)}%)
                    </span>
                    <span>+{formatBRL(fee)}</span>
                  </div>
                )}

                {/* Desconto à vista: o preço embute o custo do cartão,
                    então PIX e dinheiro devolvem essa diferença. */}
                {cashDiscount > 0 && (
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-emerald-300 tnum">
                    <span>desconto à vista ({(pixDiscountRate * 100).toFixed(2)}%)</span>
                    <span>−{formatBRL(cashDiscount)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between border-t border-dashed border-ink-700 pt-2">
                  <span className="font-mono text-[11px] tracking-[0.18em] text-ink-300 uppercase">
                    Total
                  </span>
                  <span className="font-mono text-[28px] leading-none font-semibold text-cyan-300 tnum">
                    {formatBRL(totalDue)}
                  </span>
                </div>

                {/* Parcelamento sem juros, quando o valor permite. */}
                {canInstall && (
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-ink-400 tnum">
                    <span>ou {installmentMax}x sem juros</span>
                    <span>{formatBRL(installmentValue)}/mês</span>
                  </div>
                )}
                {payment === "Crédito" && !splitOn && !canInstall && installmentMin > 0 && (
                  <div className="font-mono text-[10px] text-ink-500">
                    parcelamento a partir de {formatBRL(installmentMin)}
                  </div>
                )}

                {/* Margem real desta venda — responde "vale a pena?" na
                    hora, em vez de descobrir no fechamento do mês. */}
                {saleMargin && (
                  <div
                    className={cn(
                      "mt-1 flex items-center justify-between rounded-md px-2 py-1 font-mono text-[10px] tnum",
                      saleMargin.belowFloor
                        ? "bg-red-500/10 text-red-300"
                        : "bg-emerald-500/10 text-emerald-300"
                    )}
                    title="Sobra depois do custo dos itens, imposto e taxa da forma de pagamento"
                  >
                    <span>
                      {saleMargin.belowFloor ? "margem abaixo do piso" : "margem desta venda"}
                    </span>
                    <span>
                      {(saleMargin.rate * 100).toFixed(1)}% · {formatBRL(saleMargin.profit)}
                    </span>
                  </div>
                )}
              </div>

              {/* PAGAMENTO */}
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
                  Pagamento
                </span>
                <button
                  type="button"
                  onClick={toggleSplit}
                  className={cn(
                    "focus-ring cursor-pointer rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors",
                    splitOn
                      ? "bg-cyan-400/15 text-cyan-300"
                      : "bg-white/5 text-ink-400 hover:bg-white/15 hover:text-white"
                  )}
                  title="Dividir o pagamento entre várias formas (F5)"
                >
                  {splitOn ? "✕ desfazer divisão" : "⇄ dividir"}
                </button>
              </div>

              {!splitOn ? (
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {PAYMENTS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPayment(p.id)}
                      className={cn(
                        "focus-ring flex cursor-pointer flex-col items-center gap-1 rounded-lg border py-2 transition-all",
                        payment === p.id
                          ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                          : "border-ink-700 bg-white/[0.03] text-ink-400 hover:border-ink-500 hover:text-ink-200"
                      )}
                    >
                      <Icon name={p.icon} size={15} />
                      <span className="text-[10px] font-semibold">{p.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-1.5 space-y-1.5 rounded-lg border border-ink-700 bg-ink-850 p-2">
                  {splitLines.map((line) => (
                    <div key={line.key} className="flex items-center gap-1.5">
                      <Select
                        value={line.method}
                        onChange={(e) => updateSplitLine(line.key, { method: e.target.value })}
                        className="h-8 w-[104px] shrink-0 border-ink-700 bg-ink-900 text-[11px] text-white"
                      >
                        {PAYMENTS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        mono
                        value={line.amount}
                        onChange={(e) => updateSplitLine(line.key, { amount: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        placeholder="0,00"
                        className="h-8 flex-1 border-ink-700 bg-ink-900 text-right text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateSplitLine(line.key, {
                            amount: String(round2(toPositive(line.amount) + splitRemaining)),
                          })
                        }
                        disabled={Math.abs(splitRemaining) < 0.005}
                        className="focus-ring shrink-0 cursor-pointer rounded-md bg-white/5 px-1.5 py-1 font-mono text-[10px] text-cyan-300 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Jogar o restante nesta linha"
                      >
                        resto
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSplitLine(line.key)}
                        disabled={splitLines.length <= 1}
                        className="focus-ring shrink-0 cursor-pointer rounded-md bg-white/5 px-1.5 py-1 font-mono text-[10px] text-ink-400 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Remover parcela"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        addSplitLine(
                          PAYMENTS.find((p) => !splitLines.some((l) => l.method === p.id))?.id ||
                            "Dinheiro",
                          splitRemaining > 0 ? String(splitRemaining) : ""
                        )
                      }
                      disabled={splitLines.length >= 4}
                      className="focus-ring cursor-pointer rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-ink-300 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      + forma
                    </button>
                    <span
                      className={cn(
                        "font-mono text-[10.5px] tnum",
                        splitBalanced ? "text-emerald-300" : "text-amber-300"
                      )}
                    >
                      {splitBalanced
                        ? "✓ divisão fecha"
                        : splitRemaining > 0
                          ? `faltam ${formatBRL(splitRemaining)}`
                          : `sobra ${formatBRL(Math.abs(splitRemaining))}`}
                    </span>
                  </div>

                  {splitFee > 0 && (
                    <p className="border-t border-dashed border-ink-700 pt-1 text-right font-mono text-[10px] text-amber-300 tnum">
                      taxa das parcelas +{formatBRL(splitFee)}
                    </p>
                  )}
                </div>
              )}

              {/* TROCO EM DINHEIRO */}
              {isCash && (
                <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-2.5">
                  {splitOn && (
                    <p className="mb-1.5 font-mono text-[10px] text-ink-400">
                      parcela em dinheiro: {formatBRL(cashPortion)}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-300">Recebido R$</span>
                    <Input
                      mono
                      value={receivedInput}
                      onChange={(e) => setReceivedInput(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0,00"
                      className="h-8 flex-1 border-ink-700 bg-ink-900 text-right text-white"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[5, 10, 20, 50, 100, 200].map((v) => (
                      <button
                        key={v}
                        onClick={() => setReceivedInput(String(round2(received + v)))}
                        className="focus-ring cursor-pointer rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-ink-300 transition-colors hover:bg-white/15 hover:text-white"
                      >
                        +{v}
                      </button>
                    ))}
                    <button
                      onClick={() => setReceivedInput(String(cashPortion))}
                      className="focus-ring cursor-pointer rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-300 transition-colors hover:bg-white/15"
                    >
                      exato
                    </button>
                  </div>
                  {received > 0 && (
                    <p
                      className={cn(
                        "mt-1.5 flex items-baseline justify-between font-mono text-[12.5px] font-semibold tnum",
                        missingCash ? "text-red-400" : "text-emerald-300"
                      )}
                    >
                      <span className="text-[10px] uppercase">
                        {missingCash ? "Falta" : "Troco"}
                      </span>
                      <span>{formatBRL(Math.abs(change))}</span>
                    </p>
                  )}
                </div>
              )}

              {/* CAMPOS ADICIONAIS DO CUPOM (VENDEDOR, SITUAÇÃO, NOTAS) */}
              <div className="mt-3 border-t border-dashed border-ink-700 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtraFields(!showExtraFields)}
                  className="flex items-center justify-between w-full text-left font-mono text-[10.5px] text-ink-400 hover:text-cyan-300 py-1"
                >
                  <span>⚙️ Vendedor &amp; Observações do Cupom</span>
                  <span>{showExtraFields ? "▲" : "▼"}</span>
                </button>

                {showExtraFields && (
                  <div className="mt-2 space-y-2 rounded-lg bg-white/[0.02] p-2.5 border border-ink-800 text-[11px]">
                    <div>
                      <label className="text-[10px] text-ink-400 block mb-1">Vendedor / Atendente:</label>
                      <Input
                        value={sellerName}
                        onChange={(e) => handleSellerChange(e.target.value)}
                        placeholder="Ex.: TIAGO SOUZA"
                        className="h-7 border-ink-700 bg-ink-850 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-400 block mb-1">Situação / Entrega:</label>
                      <Select
                        value={deliveryMode}
                        onChange={(e) => setDeliveryMode(e.target.value)}
                        className="h-7 border-ink-700 bg-ink-850 text-white text-[11px]"
                      >
                        {DELIVERY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-400 block mb-1">Previsão de Entrega (Data/Hora):</label>
                      <Input
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        placeholder="Deixe em branco para Data/Hora da venda"
                        className="h-7 border-ink-700 bg-ink-850 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-400 block mb-1">Observações / Promoção:</label>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ex.: Não deixe de aproveitar nossas promoções!"
                        className="h-7 border-ink-700 bg-ink-850 text-white text-[11px]"
                      />
                    </div>

                    {/* Frete SuperFrete — só faz sentido quando há entrega */}
                    {deliveryMode.toLowerCase().includes("entrega") && (
                      <div className="rounded-lg border border-ink-700 bg-ink-850 p-1.5 [&_.bg-paper-50]:!bg-transparent [&_.border-paper-200]:!border-ink-700 [&_.text-ink-600]:!text-ink-300 [&_.text-ink-400]:!text-ink-500 [&_.bg-white]:!bg-ink-900 [&_.text-ink-900]:!text-white [&_input]:!border-ink-700 [&_input]:!bg-ink-900 [&_input]:!text-white">
                        {selectedCustomer ? (
                          <ShippingQuote
                            compact
                            cep={String(selectedCustomer.cep || "")}
                            items={cart.map((l) => ({ productId: l.productId, quantity: l.quantity }))}
                            declaredValue={subtotal}
                            selectedServiceId={shipping?.serviceId ?? null}
                            onSelect={setShipping}
                          />
                        ) : (
                          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 font-mono text-[10px] text-amber-200">
                            Identifique o cliente para cotar o frete
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* BOTÃO FINALIZAR */}
              {pdvConfig.requireCustomer && !customerId && cart.length > 0 && (
                <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-center font-mono text-[10px] text-amber-200">
                  Cliente obrigatório para finalizar
                </p>
              )}
              <Button
                size="lg"
                className="mt-3.5 w-full font-bold"
                icon="circle-check"
                loading={charging}
                onClick={() => checkout()}
                disabled={
                  cart.length === 0 ||
                  missingCash ||
                  (splitOn && !splitBalanced) ||
                  (pdvConfig.requireOpenCash && !session) ||
                  (pdvConfig.requireCustomer && !customerId) ||
                  (isCash && received <= 0)
                }
              >
                Finalizar Venda · {formatBRL(totalDue)}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* ─────────── MODAL CONFIRMAR VENDA A DESCOBERTO ─────────── */}
      <Modal
        open={!!confirmOversell}
        onClose={() => setConfirmOversell(null)}
        title="Estoque insuficiente"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOversell(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              icon="alert"
              loading={charging}
              onClick={() => checkout(true)}
            >
              Vender assim mesmo
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-700">{confirmOversell}</p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Confirmar deixa o saldo negativo no estoque para reposição.
        </p>
      </Modal>

      {/* ─────────── MODAL ÚLTIMAS VENDAS ─────────── */}
      <Modal
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        title="Últimas vendas (24h)"
        width="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecentOpen(false)}>
              Fechar
            </Button>
            <Button variant="outline" icon="refresh" loading={recentLoading} onClick={loadRecent}>
              Atualizar
            </Button>
          </>
        }
      >
        {recentLoading && recentSales.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-500">Carregando…</p>
        ) : recentSales.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-500">
            Nenhuma venda nas últimas 24 horas.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-paper-50 text-left font-mono text-[10px] tracking-wider text-ink-500 uppercase">
                <tr>
                  <th className="px-2 py-1.5">Cupom</th>
                  <th className="px-2 py-1.5">Hora</th>
                  <th className="px-2 py-1.5">Cliente</th>
                  <th className="px-2 py-1.5">Pgto.</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((s) => {
                  const canceled = s.status === "cancelada";
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-t border-paper-200",
                        canceled && "bg-red-50/60 text-ink-400"
                      )}
                    >
                      <td className="px-2 py-1.5 font-mono">
                        {s.number}
                        {canceled && (
                          <span className="ml-1.5 rounded bg-red-100 px-1 py-px text-[9.5px] font-semibold text-red-700 uppercase">
                            cancelada
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-ink-500">
                        {new Date(s.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="max-w-[160px] truncate px-2 py-1.5">
                        {s.customerName || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-ink-500">
                        {s.paymentMethod || "—"}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-mono tnum",
                          canceled && "line-through"
                        )}
                      >
                        {formatBRL(toNumber(s.total, 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => reprint(s)}
                          className="focus-ring cursor-pointer rounded-md bg-ink-900/5 px-2 py-1 font-mono text-[10px] text-ink-700 transition-colors hover:bg-ink-900 hover:text-white"
                        >
                          reimprimir
                        </button>
                        {!canceled && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(s)}
                            className="focus-ring ml-1 cursor-pointer rounded-md bg-red-500/10 px-2 py-1 font-mono text-[10px] text-red-700 transition-colors hover:bg-red-600 hover:text-white"
                          >
                            cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* ─────────── MODAL CANCELAR VENDA ─────────── */}
      <CancelSaleModal
        key={cancelTarget ? `cancel-${cancelTarget.id}` : "cancel-closed"}
        sale={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />

      {/* ─────────── MODAL CADASTRAR NOVO CLIENTE RÁPIDO ─────────── */}
      <QuickCustomerModal
        key={newCustomerOpen ? "customer-open" : "customer-closed"}
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={(newCust) => {
          setCustomersList((prev) => [newCust, ...prev]);
          setCustomerId(String(newCust.id));
          toast.success("Cliente cadastrado!", newCust.name);
        }}
      />

      {/* ─────────── MODAL ITEM AVULSO ─────────── */}
      <FreeItemModal
        key={freeItemOpen ? "free-open" : "free-closed"}
        open={freeItemOpen}
        onClose={() => setFreeItemOpen(false)}
        onAdd={(description, unitPrice, quantity) => {
          setCart((c) => [
            ...c,
            { key: uid(), productId: null, description, unitPrice, quantity, unitLabel: "UNI" },
          ]);
          setFreeItemOpen(false);
        }}
      />

      {/* ─────────── MODAL CAIXA ─────────── */}
      <CashModal
        key={cashOpen ? "cash-open" : "cash-closed"}
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        session={session}
        operatorDefault={sellerName}
        onChanged={(s) => {
          setSession(s);
          router.refresh();
        }}
      />

      {/* ─────────── CUPOM DE IMPRESSÃO PROFISSIONAL (TÉRMICO 80MM) ─────────── */}
      <Drawer
        open={!!receipt}
        onClose={handleCloseReceipt}
        title="Cupom de Venda Emitido"
        subtitle="Bobina Térmica 80mm · Impressão Direta"
        width="max-w-md"
        footer={
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <Button variant="outline" size="sm" onClick={handleCloseReceipt}>
              + Nova Venda
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="soft"
                size="sm"
                icon="whatsapp"
                onClick={() => {
                  if (!receipt) return;
                  const text = buildTextReceipt(receipt, company);

                  /* Respeita o "não enviar WhatsApp" do cadastro: sem
                     destinatário, o operador decide no app. */
                  if (isWhatsAppBlocked(receipt.customer)) {
                    toast.info(
                      "Cliente não aceita WhatsApp",
                      "O cupom abrirá sem destinatário — confirme outro canal."
                    );
                  }

                  const cleanPhone = whatsappNumber(receipt.customer);
                  const url = cleanPhone
                    ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`
                    : `https://wa.me/?text=${encodeURIComponent(text)}`;
                  window.open(url, "_blank");
                }}
              >
                WhatsApp
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon="printer"
                title="Imprime em texto puro: máxima nitidez na bobina térmica"
                onClick={() => {
                  if (!receipt) return;
                  printPlainReceipt(buildTextReceipt(receipt, company));
                }}
              >
                Nítido
              </Button>

              <Button
                variant="ink"
                size="sm"
                icon="printer"
                onClick={() => {
                  window.print();
                }}
              >
                Imprimir Cupom
              </Button>
            </div>
          </div>
        }
      >
        {receipt && (
          <div className="bg-paper-100 p-4 rounded-xl border border-paper-300">
            <ThermalReceipt receipt={receipt} company={company} />
          </div>
        )}
      </Drawer>

      {/* CONTAINER EXCLUSIVO DE IMPRESSÃO TÉRMICA (ESCONDIDO NA TELA, REVELADO NO PRINT)
          `--receipt-weight` é lido pelo @media print em globals.css: permite
          calibrar a intensidade por impressora sem tocar no código. */}
      {receipt && (
        <div
          id="receipt-print"
          className="hidden"
          style={
            {
              "--receipt-weight": String(pdvConfig.receiptBoldness ?? 600),
            } as React.CSSProperties
          }
        >
          <ThermalReceipt receipt={receipt} company={company} isPrint />
        </div>
      )}
    </>
  );
}

/* ==================================================================
   COMPONENTE DO CUPOM TÉRMICO PROFISSIONAL (IDÊNTICO À FOTO)
   ================================================================== */

function ThermalReceipt({
  receipt,
  company,
  isPrint,
}: {
  receipt: ReceiptData;
  company: PosCompany;
  isPrint?: boolean;
}) {
  const d = receipt.soldAt;
  const dateFormatted = d.toLocaleDateString("pt-BR");
  const timeFormatted = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const c = receipt.customer;

  /* Cidade/UF da empresa, vazio quando nenhum dos dois está preenchido. */
  const cityState = [company.city, company.state].filter(Boolean).join(" -");

  /* "BAIRRO - CIDADE/UF" numa linha só: o bairro sozinho desperdiçava
     uma linha inteira da bobina e separava o endereço ao meio. */
  const cityLine = c
    ? [c.district, [c.city, c.state].filter(Boolean).join("/")].filter(Boolean).join(" - ")
    : "";

  /* Telefone e WhatsApp rotulados. Quando são o mesmo número, imprime
     uma linha só — repetir o mesmo dígito duas vezes confunde e gasta
     bobina. A comparação ignora máscara: "(21) 99999-1111" e
     "21999991111" são o mesmo telefone. */
  const onlyDigits = (v: string | null | undefined) => String(v || "").replace(/\D/g, "");
  const phoneRaw = c?.phone || "";
  const whatsRaw = c?.whatsapp || "";
  const sameNumber =
    !!phoneRaw && !!whatsRaw && onlyDigits(phoneRaw) === onlyDigits(whatsRaw);

  /* Mesmo número nos dois campos → uma linha "Tel/WhatsApp". */
  const phoneCaption = sameNumber ? "Tel/WhatsApp" : "Tel";
  const phoneLabel = phoneRaw;
  const whatsLabel = sameNumber ? "" : whatsRaw;

  return (
    <div
      className={cn(
        "font-mono text-[11px] leading-[1.25] text-black bg-white select-text",
        isPrint ? "w-[80mm] p-0" : "p-5 border border-dashed border-gray-400 rounded shadow-sm max-w-[340px] mx-auto"
      )}
      style={{
        fontFamily: "'IBM Plex Mono', 'Courier New', Courier, monospace",
      }}
    >
      {/* ── 1. CABEÇALHO DA EMPRESA ──
          Sem valores de exemplo: um campo vazio no Painel deve sumir do
          cupom, nunca ser substituído pelos dados de outra empresa
          (o layout nasceu com VTDIGITAL fixo no código). */}
      {company.name && (
        <div className="text-left font-bold text-[12px] uppercase tracking-tight">
          {company.name}
        </div>
      )}

      {company.street && (
        <div className="text-left text-[11px] uppercase">{company.street}</div>
      )}

      {(company.district || company.phone) && (
        <div className="flex justify-between items-baseline text-[11px] uppercase">
          <span>{company.district}</span>
          <span>{company.phone}</span>
        </div>
      )}

      {(company.email || company.phone2) && (
        <div className="flex justify-between items-baseline text-[11px] uppercase">
          <span className="truncate max-w-[210px]">{company.email}</span>
          <span>{company.phone2}</span>
        </div>
      )}

      {(cityState || company.document) && (
        <div className="flex justify-between items-baseline text-[11px] uppercase">
          <span>{cityState}</span>
          <span>{company.document}</span>
        </div>
      )}

      {/* Inscrição estadual do emitente: exigimos a do cliente no A4,
          omitir a própria seria incoerente. */}
      {company.stateRegistration && (
        <div className="text-left text-[11px] uppercase">
          IE {company.stateRegistration}
        </div>
      )}

      {company.website && (
        <div className="text-left text-[11px] lowercase">{company.website}</div>
      )}

      {/* DIVISOR DA EMPRESA */}
      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 2. METADADOS DO CUPOM ── */}
      <div className="text-left font-bold text-[11.5px]">
        CUPOM NAO FISCAL {receipt.number.replace(/\D/g, "") || "003798"} {timeFormatted} {dateFormatted}
      </div>

      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 3. DADOS DO CLIENTE (SE HOUVER) ──
          O bairro ficava sozinho numa linha, dividindo espaço com o
          telefone — quebrava a leitura do endereço. Agora segue o padrão
          de correspondência brasileiro: logradouro, depois
          "bairro - cidade/UF", depois CEP. Telefones vão rotulados,
          em linhas próprias. */}
      {c && (
        <>
          {/* PJ: nome fantasia é como o cliente se reconhece; a razão
              social vai na linha seguinte, para o cupom servir de
              comprovante. */}
          <div className="text-left font-bold text-[11.5px] uppercase">
            {c.tradeName || c.name}
          </div>

          {c.tradeName && c.tradeName !== c.name && (
            <div className="text-left text-[11px] uppercase">{c.name}</div>
          )}

          {c.document && <div className="text-left text-[11px]">{c.document}</div>}

          {c.contactName && (
            <div className="text-left text-[11px] uppercase">A/C: {c.contactName}</div>
          )}

          {(c.street || c.number) && (
            <div className="text-left text-[11px] uppercase">
              {[c.street, c.number, c.complement].filter(Boolean).join(", ")}
            </div>
          )}

          {cityLine && <div className="text-left text-[11px] uppercase">{cityLine}</div>}

          {c.cep && <div className="text-left text-[11px] uppercase">CEP: {c.cep}</div>}

          {phoneLabel && (
            <div className="text-left text-[11px] uppercase">
              {phoneCaption}: {phoneLabel}
            </div>
          )}

          {whatsLabel && (
            <div className="text-left text-[11px] uppercase">WhatsApp: {whatsLabel}</div>
          )}

          <div className="my-1.5 border-b border-dashed border-black" />
        </>
      )}

      {/* ── 4. CABEÇALHO DA TABELA DE ITENS ── */}
      <div className="flex justify-between font-bold text-[11px] uppercase">
        <span>Descricao do Produto</span>
        <span>UNI</span>
      </div>

      <div className="grid grid-cols-4 text-center font-bold text-[11px] uppercase mt-0.5">
        <span className="text-left">valor</span>
        <span>Quantia</span>
        <span>Desconto</span>
        <span className="text-right">Vlr Total</span>
      </div>

      {/* ── 5. LISTA DE ITENS ── */}
      {receipt.items.map((line) => {
        const discPerItem = receipt.subtotal > 0
          ? round2((receipt.discount * (line.unitPrice * line.quantity)) / receipt.subtotal)
          : 0;
        const lineFinalTotal = round2(line.unitPrice * line.quantity - discPerItem);

        return (
          <div key={line.key} className="mt-1.5 text-[11px]">
            <div className="flex justify-between font-bold uppercase truncate">
              <span className="truncate pr-1">{line.description}</span>
              <span>{line.unitLabel || "UNI"}</span>
            </div>
            <div className="grid grid-cols-4 text-center font-mono tnum">
              <span className="text-left">{formatNum(line.unitPrice)}</span>
              <span>{formatQty(line.quantity)}</span>
              <span>{formatNum(discPerItem)}</span>
              <span className="text-right font-bold">{formatNum(lineFinalTotal)}</span>
            </div>
          </div>
        );
      })}

      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 6. BLOCO DE TOTAIS ── */}
      <div className="space-y-0.5 font-bold text-[11.5px] uppercase">
        <div className="flex justify-between">
          <span>VALOR PRODUTOS</span>
          <span>R$ {formatNum(receipt.subtotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>VALOR DESCONTO</span>
          <span>R$ {formatNum(receipt.discount)}</span>
        </div>

        <div className="flex justify-between text-[12.5px] font-extrabold">
          <span>VALOR TOTAL</span>
          <span>R$ {formatNum(receipt.total)}</span>
        </div>
      </div>

      <div className="my-1 border-b-2 border-black" />

      <div className="space-y-0.5 font-bold text-[11.5px] uppercase">
        <div className="flex justify-between">
          <span>VALOR PAGO</span>
          <span>R$ {formatNum(receipt.received || receipt.total)}</span>
        </div>

        <div className="flex justify-between">
          <span>VALOR TROCO</span>
          <span>R$ {formatNum(receipt.change || 0)}</span>
        </div>
      </div>

      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 7. RODAPÉ E INFORMAÇÕES ADICIONAIS ── */}
      <div className="text-left space-y-1 text-[11px]">
        <p className="font-bold uppercase">
          Vendedor: {receipt.sellerName || "OPERADOR"}
        </p>

        <p className="font-bold uppercase">
          Situacao: {receipt.deliveryMode || "Retirada no balcão"}
        </p>

        <p className="font-bold uppercase">
          Entrega: {receipt.deliveryDate}
        </p>

        <p className="font-bold uppercase tracking-wider text-[12px]">
          {receipt.payment === "PIX"
            ? "PIX"
            : receipt.payment === "Dinheiro"
              ? "DINHEIRO / AVISTA"
              : receipt.payment.toUpperCase()}
        </p>

        {receipt.splits && receipt.splits.length > 1 && (
          <div className="font-mono text-[10.5px]">
            {receipt.splits.map((s, i) => (
              <p key={`${s.method}-${i}`} className="flex justify-between">
                <span>{s.method}</span>
                <span>R$ {formatNum(Number(s.amount) || 0)}</span>
              </p>
            ))}
          </div>
        )}

        {receipt.fee > 0 && (
          <p className="font-mono text-[10px]">
            Taxa cartão embutida: R$ {formatNum(receipt.fee)}
          </p>
        )}

        {(receipt.notes || company.receiptFooter) && (
          <>
            <p className="mt-2 border-t border-dotted border-black pt-1 font-semibold text-[10.5px]">
              Observações
            </p>
            <p className="leading-snug">
              {receipt.notes || company.receiptFooter}
            </p>
          </>
        )}

        {company.pixKey && receipt.payment === "PIX" && (
          <p className="mt-1 font-mono text-[10px]">PIX: {company.pixKey}</p>
        )}

        <p className="mt-2 text-center text-[10px] leading-snug">
          {company.receiptFooter || "Agradecemos a preferência!"}
        </p>
        <p className="text-center text-[9px] uppercase tracking-wider">
          Documento não fiscal · {receipt.number}
        </p>
      </div>
    </div>
  );
}

/* Formatadores auxiliares para os números do cupom */
function formatNum(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/* Gera a versão em texto puro para copiar ou enviar via WhatsApp */
/**
 * Impressão em MODO TEXTO — a mais nítida possível numa térmica.
 *
 * O caminho normal (`window.print()`) manda o navegador rasterizar a
 * página: ele desenha o texto com antialiasing, e como a cabeça térmica
 * só sabe "queima / não queima", os pixels cinzentos das bordas viram
 * pontos fracos. O resultado é o cupom lavado da foto do usuário.
 *
 * Aqui abrimos uma janela com o cupom já pronto em texto puro
 * (`buildTextReceipt`, o mesmo do WhatsApp) dentro de um <pre>, em preto
 * pleno e sem suavização. Menos bonito — sem alinhamento em colunas
 * proporcionais — e muito mais legível na bobina.
 */
function printPlainReceipt(text: string) {
  const win = window.open("", "_blank", "width=380,height=650");
  if (!win) {
    toast.error(
      "Pop-up bloqueado",
      "Libere pop-ups deste site para usar a impressão nítida."
    );
    return;
  }

  /* `buildTextReceipt` marca negrito com *asteriscos* (sintaxe do
     WhatsApp). No papel isso vira sujeira: removemos os delimitadores e
     destacamos a linha em maiúsculas, que a térmica renderiza bem. */
  const printable = text.replace(/\*(.+?)\*/g, (_m, inner: string) => inner.toUpperCase());

  /* escapa o texto: nome de cliente com & ou < quebraria o HTML */
  const safe = printable
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Cupom</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  pre {
    margin: 0;
    padding: 2mm 3mm;
    width: 72mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.3;
    font-weight: 700;
    color: #000;
    -webkit-font-smoothing: none;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style></head>
<body><pre>${safe}</pre></body></html>`);
  win.document.close();
  win.focus();
  /* dá um tick para a fonte carregar antes do diálogo de impressão */
  setTimeout(() => {
    win.print();
    win.close();
  }, 250);
}

function buildTextReceipt(r: ReceiptData, comp: PosCompany): string {
  const d = r.soldAt;
  const dateFormatted = d.toLocaleDateString("pt-BR");
  const timeFormatted = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const lines = [
    `*${comp.name || "PrintFlow"}*`,
    comp.address,
    `Tel: ${[comp.phone, comp.phone2].filter(Boolean).join(" / ")}`,
    "--------------------------------",
    `CUPOM NÃO FISCAL ${r.number}`,
    `${dateFormatted} ${timeFormatted}`,
    "--------------------------------",
  ];

  if (r.customer) {
    lines.push(`CLIENTE: ${r.customer.name}`);
    if (r.customer.document) lines.push(`DOC: ${r.customer.document}`);

    /* Mesmos rótulos do cupom impresso: telefone e WhatsApp separados,
       fundidos numa linha quando o número é o mesmo. */
    const digits = (v: string | null) => String(v || "").replace(/\D/g, "");
    const tel = r.customer.phone || "";
    const zap = r.customer.whatsapp || "";
    const same = !!tel && !!zap && digits(tel) === digits(zap);
    if (tel) lines.push(`${same ? "TEL/WHATSAPP" : "TEL"}: ${tel}`);
    if (zap && !same) lines.push(`WHATSAPP: ${zap}`);

    lines.push("--------------------------------");
  }

  lines.push("ITENS:");
  for (const l of r.items) {
    lines.push(`• ${l.description}`);
    lines.push(
      `  ${formatQty(l.quantity)} x R$ ${formatNum(l.unitPrice)} = R$ ${formatNum(l.unitPrice * l.quantity)}`
    );
  }

  lines.push("--------------------------------");
  lines.push(`PRODUTOS: R$ ${formatNum(r.subtotal)}`);
  if (r.discount > 0) lines.push(`DESCONTO: R$ ${formatNum(r.discount)}`);
  if (r.fee > 0) lines.push(`TAXA CARTÃO: R$ ${formatNum(r.fee)}`);
  lines.push(`*TOTAL: R$ ${formatNum(r.total)}*`);
  lines.push(`PAGAMENTO: ${r.payment}`);
  if (r.splits && r.splits.length > 1) {
    for (const s of r.splits) {
      lines.push(`  ${s.method}: R$ ${formatNum(Number(s.amount) || 0)}`);
    }
  }
  if (r.received != null) lines.push(`RECEBIDO: R$ ${formatNum(r.received)}`);
  if (r.change != null && r.change > 0) lines.push(`TROCO: R$ ${formatNum(r.change)}`);
  if (r.payment === "PIX" && comp.pixKey) lines.push(`CHAVE PIX: ${comp.pixKey}`);
  lines.push("--------------------------------");
  lines.push(`Vendedor: ${r.sellerName || "OPERADOR"}`);
  lines.push(`Situação: ${r.deliveryMode || "Retirada no balcão"}`);
  if (r.deliveryDate) lines.push(`Entrega: ${r.deliveryDate}`);
  if (r.notes) lines.push(r.notes);
  if (comp.receiptFooter) lines.push(comp.receiptFooter);
  lines.push(`Documento não fiscal · ${r.number}`);

  return lines.filter(Boolean).join("\n");
}

/* ==================================================================
   MODAL DE CADASTRO RÁPIDO DE CLIENTE COM VIACEP
   ================================================================== */

function QuickCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (cust: PosCustomer) => void;
}) {
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);

  /* O reset ao abrir é feito pelo `key` no componente pai: React
     remonta e o estado nasce limpo, sem setState dentro de effect. */

  /* Autopreenchimento ViaCEP */
  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`/api/cep/${cleanCep}`);
      if (res.ok) {
        const data = await res.json();
        if (data.street) setStreet(data.street);
        if (data.district) setDistrict(data.district);
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
      }
    } catch {
      /* ignora erro se o CEP for inválido */
    } finally {
      setFetchingCep(false);
    }
  };

  const handleSave = async () => {
    if (name.trim().length < 2) return toast.error("Informe o nome do cliente");
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        tradeName: tradeName.trim() || null,
        document: document.trim() || null,
        phone: phone.trim() || null,
        whatsapp: phone.trim() || null,
        cep: cep.trim() || null,
        street: street.trim() || null,
        number: number.trim() || null,
        complement: complement.trim() || null,
        district: district.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        status: "ativo",
        /* Cadastro rápido no meio do atendimento: documento fica
           opcional aqui (a tela de Clientes & CRM exige). */
        quickEntry: true,
      };

      const res = await fetch("/api/crud/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", data: payload }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar cliente");

      const created = json.row;
      onCreated({
        id: Number(created.id),
        name: String(created.name),
        tradeName: created.tradeName || null,
        document: created.document || null,
        phone: created.phone || null,
        whatsapp: created.whatsapp || null,
        email: created.email || null,
        street: created.street || null,
        number: created.number || null,
        complement: created.complement || null,
        district: created.district || null,
        city: created.city || null,
        state: created.state || null,
        cep: created.cep || null,
      });
      onClose();
    } catch (e) {
      toast.error("Falha ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cadastro Rápido de Cliente"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="circle-check" loading={loading} onClick={handleSave}>
            Salvar e Selecionar
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[12.5px]">
        <Field label="Nome Completo / Razão Social *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: RAPHAELA PINHEIRO"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="CPF / CNPJ">
            <Input
              mono
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input
              mono
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(21) 99690-2449"
            />
          </Field>
        </div>

        <div className="border-t border-paper-200 pt-2 space-y-2">
          <p className="font-semibold text-ink-800 text-[11.5px]">Endereço (impresso no cupom)</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CEP" hint={fetchingCep ? "buscando..." : undefined}>
              <Input
                mono
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={handleCepBlur}
                placeholder="21863-090"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Rua / Logradouro">
                <Input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Ex.: RUA LUZIA DE MACEDO DANTAS"
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Número">
              <Input
                mono
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="151"
              />
            </Field>
            <Field label="Complemento">
              <Input
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Casa 2"
              />
            </Field>
            <Field label="Bairro">
              <Input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="BANGU"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Cidade">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="RIO DE JANEIRO"
              />
            </Field>
            <Field label="UF">
              <Input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="RJ"
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ==================================================================
   MODAL DE ITEM AVULSO
   ================================================================== */

/* ------------------------------------------------------------------ */
/*  CANCELAR VENDA                                                     */
/* ------------------------------------------------------------------ */
function CancelSaleModal({
  sale,
  onClose,
  onConfirm,
}: {
  sale: RecentSale | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = reason.trim().length >= 3;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title={sale ? `Cancelar venda ${sale.number}` : "Cancelar venda"}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="danger" icon="trash" loading={busy} disabled={!valid} onClick={submit}>
            Confirmar cancelamento
          </Button>
        </>
      }
    >
      {sale && (
        <>
          <div className="mb-3 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 font-mono text-[12px]">
            <p className="flex justify-between">
              <span className="text-ink-500">Total</span>
              <span className="font-semibold tnum">{formatBRL(toNumber(sale.total, 0))}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-ink-500">Pagamento</span>
              <span>{sale.paymentMethod || "—"}</span>
            </p>
            {sale.customerName && (
              <p className="flex justify-between">
                <span className="text-ink-500">Cliente</span>
                <span className="max-w-[180px] truncate">{sale.customerName}</span>
              </p>
            )}
          </div>

          <label className="mb-1 block text-[11px] font-semibold text-ink-600">
            Motivo do cancelamento
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: cliente desistiu da compra"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <p className="mt-1 text-[10.5px] text-ink-400">Mínimo de 3 caracteres.</p>

          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
            O estoque dos itens volta para a prateleira e a receita é estornada no Financeiro. A
            operação fica registrada — a venda não é apagada.
          </p>
        </>
      )}
    </Modal>
  );
}

function FreeItemModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (description: string, unitPrice: number, quantity: number) => void;
}) {
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  /* reset via `key` no pai (ver comentário acima) */

  function submit() {
    const value = toPositive(price);
    const quantity = toPositive(qty);
    if (description.trim().length < 2) return toast.error("Informe a descrição");
    if (value <= 0) return toast.error("Informe um valor maior que zero");
    if (quantity <= 0) return toast.error("Quantidade inválida");
    onAdd(description.trim(), round2(value), round2(quantity));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Item Avulso (Sem Cadastro)"
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="circle-check" onClick={submit}>
            Adicionar ao Carrinho
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] text-ink-500">
          Para serviços rápidos de balcão: cópias, impressões avulsas, plastificações.
        </p>
        <Field label="Descrição do Produto / Serviço">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: IMPRESSAO XEROX A4 LASER OFFSET 75GR"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor unitário (R$)">
            <Input
              mono
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Quantidade">
            <Input mono value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ==================================================================
   MODAL DE ABERTURA / FECHAMENTO DE CAIXA
   ================================================================== */

function CashModal({
  open,
  onClose,
  session,
  operatorDefault,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  session: CashSession;
  operatorDefault?: string;
  onChanged: (s: CashSession) => void;
}) {
  const [amount, setAmount] = useState("");
  const [operator, setOperator] = useState(operatorDefault || "");
  const [reason, setReason] = useState("");
  const [moveKind, setMoveKind] = useState<"sangria" | "suprimento">("sangria");
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    expected: number;
    salesCount: number;
    salesTotal: number;
    movements: { id: number; kind: string; amount: string | number; reason: string | null }[];
  } | null>(null);
  const [result, setResult] = useState<{
    expected: number;
    counted: number;
    difference: number;
  } | null>(null);

  /* Campos nascem limpos pelo `key` no pai. Aqui o efeito faz só o
     que é legítimo: buscar o resumo da gaveta no servidor. */
  useEffect(() => {
    if (!open) return;
    if (session) void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id]);

  async function loadSummary() {
    try {
      const res = await fetch("/api/pdv/cash-session");
      const json = await res.json();
      if (!res.ok) return;
      setSummary({
        expected: toNumber(json.expected, 0),
        salesCount: Number(json.salesCount || 0),
        salesTotal: toNumber(json.salesTotal, 0),
        movements: Array.isArray(json.movements) ? json.movements : [],
      });
    } catch {
      /* ignore */
    }
  }

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/pdv/cash-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "erro no caixa");
      return json;
    } catch (e) {
      toast.error("Falha no caixa", e instanceof Error ? e.message : undefined);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={session ? "Caixa aberto" : "Abrir caixa"}
      width="max-w-md"
    >
      {!session ? (
        <div className="space-y-3">
          <p className="text-[12px] text-ink-500">
            Informe o operador e o fundo de troco inicial da gaveta.
          </p>
          <Field label="Operador">
            <Input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Nome do operador"
              autoFocus
            />
          </Field>
          <Field label="Valor de abertura (R$)">
            <Input
              mono
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Button
            className="w-full"
            icon="wallet"
            loading={busy}
            onClick={async () => {
              const json = await call({
                op: "open",
                openingAmount: toPositive(amount),
                operator: operator.trim() || operatorDefault || null,
              });
              if (json?.session) {
                toast.success("Caixa aberto");
                onChanged({
                  id: json.session.id,
                  operator: json.session.operator,
                  openingAmount: json.session.openingAmount,
                  openedAt: json.session.openedAt,
                });
                onClose();
              }
            }}
          >
            Abrir caixa
          </Button>
        </div>
      ) : result ? (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-ink-900">Caixa fechado</p>
          <div className="rounded-lg border border-paper-200 bg-paper-50 p-3 font-mono text-[12px]">
            <p className="flex justify-between">
              <span className="text-ink-500">Esperado em gaveta</span>
              <span>{formatBRL(result.expected)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-ink-500">Conferido</span>
              <span>{formatBRL(result.counted)}</span>
            </p>
            <p
              className={cn(
                "mt-1 flex justify-between border-t border-dashed border-paper-300 pt-1 font-semibold",
                Math.abs(result.difference) < 0.01
                  ? "text-emerald-600"
                  : result.difference < 0
                    ? "text-red-600"
                    : "text-amber-600"
              )}
            >
              <span>{result.difference < 0 ? "Falta" : result.difference > 0 ? "Sobra" : "Diferença"}</span>
              <span>{formatBRL(result.difference)}</span>
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Concluir
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-paper-100 px-3 py-2 text-[11.5px] text-ink-600">
            <p className="font-mono">
              Aberto em {new Date(session.openedAt).toLocaleString("pt-BR")}
            </p>
            <p className="mt-0.5">
              Operador: <strong>{session.operator || "—"}</strong> · Fundo{" "}
              <strong className="font-mono tnum">{formatBRL(toNumber(session.openingAmount, 0))}</strong>
            </p>
            {summary && (
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-paper-200 pt-2 font-mono text-[11px] tnum">
                <div>
                  <p className="text-[9px] tracking-wider text-ink-400 uppercase">Vendas</p>
                  <p className="font-semibold text-ink-800">{summary.salesCount}</p>
                </div>
                <div>
                  <p className="text-[9px] tracking-wider text-ink-400 uppercase">Faturado</p>
                  <p className="font-semibold text-ink-800">{formatBRL(summary.salesTotal)}</p>
                </div>
                <div>
                  <p className="text-[9px] tracking-wider text-ink-400 uppercase">Gaveta*</p>
                  <p className="font-semibold text-ink-800">{formatBRL(summary.expected)}</p>
                </div>
              </div>
            )}
            <p className="mt-1 text-[10px] text-ink-400">
              *Esperado = abertura + dinheiro + suprimentos − sangrias (fechamento cego esconde até o fim).
            </p>
          </div>

          {summary && summary.movements.length > 0 && (
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-paper-200 p-2">
              {summary.movements.map((m) => (
                <div key={m.id} className="flex justify-between font-mono text-[11px] tnum">
                  <span className="text-ink-500">
                    {m.kind}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </span>
                  <span className={m.kind === "sangria" ? "text-red-600" : "text-emerald-600"}>
                    {m.kind === "sangria" ? "−" : "+"}
                    {formatBRL(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Segmented
              value={moveKind}
              onChange={setMoveKind}
              options={[
                { value: "sangria" as const, label: "Sangria" },
                { value: "suprimento" as const, label: "Suprimento" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                mono
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              loading={busy}
              onClick={async () => {
                const value = toPositive(amount);
                if (value <= 0) return toast.error("Informe um valor maior que zero");
                const json = await call({
                  op: "move",
                  kind: moveKind,
                  amount: value,
                  reason,
                });
                if (json) {
                  toast.success(`${moveKind === "sangria" ? "Sangria" : "Suprimento"} registrado`);
                  setAmount("");
                  setReason("");
                  await loadSummary();
                }
              }}
            >
              Registrar {moveKind}
            </Button>
          </div>

          <div className="space-y-2 border-t border-paper-200 pt-3">
            <p className="text-[12px] font-semibold text-ink-800">Fechamento cego</p>
            <p className="text-[11.5px] text-ink-500">
              Conte a gaveta e informe o valor. O sistema só revela o esperado depois da contagem.
            </p>
            <Input
              mono
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="Valor contado na gaveta"
            />
            <Button
              variant="ink"
              size="sm"
              className="w-full"
              loading={busy}
              onClick={async () => {
                if (counted.trim() === "") {
                  return toast.error("Informe o valor contado");
                }
                const json = await call({ op: "close", countedAmount: toPositive(counted) });
                if (json) {
                  setResult({
                    expected: toNumber(json.expected, 0),
                    counted: toNumber(json.counted, 0),
                    difference: toNumber(json.difference, 0),
                  });
                  onChanged(null);
                }
              }}
            >
              Fechar caixa
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
