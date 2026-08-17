"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/format";
import {
  applyDiscount,
  cardFeeAmount,
  formatBRL,
  round2,
  toNumber,
  toPositive,
} from "@/lib/money";

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
};

export type PosCompany = {
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  address: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  website: string;
  pixKey: string;
  receiptFooter?: string;
};

export type PdvConfig = {
  sellerDefault: string;
  deliveryDefault: string;
  allowNegativeStock: boolean;
  requireCustomer: boolean;
  requireOpenCash: boolean;
  receiptFooter: string;
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
  const [sellerName, setSellerName] = useState(pdvConfig.sellerDefault || "OPERADOR");
  const [deliveryMode, setDeliveryMode] = useState(
    pdvConfig.deliveryDefault || "Retirada no balcão"
  );
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState(pdvConfig.receiptFooter || "");
  const [showExtraFields, setShowExtraFields] = useState(false);

  const [charging, setCharging] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [confirmOversell, setConfirmOversell] = useState<string | null>(null);
  const [freeItemOpen, setFreeItemOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [session, setSession] = useState<CashSession>(initialSession);

  const searchRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<string>(uid());
  const chargingLock = useRef(false);

  /* Preferência local de vendedor sobrescreve o padrão do painel */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pdv_seller_name");
      if (saved) setSellerName(saved);
    } catch {
      /* ignore */
    }
  }, []);

  /* Sincroniza sessão quando o servidor revalida */
  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

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
  const net = round2(subtotal - discount);
  const feeRate = payment === "Crédito" ? cardFeeCredit : payment === "Débito" ? cardFeeDebit : 0;
  const fee = feeRate > 0 ? cardFeeAmount(net, feeRate) : 0;
  const total = round2(net + fee);
  const totalQty = cart.reduce((s, l) => s + l.quantity, 0);

  const isCash = payment === "Dinheiro";
  const received = toPositive(receivedInput);
  const change = isCash && received > 0 ? round2(received - total) : 0;
  const missingCash = isCash && received > 0 && received < total;

  /* ---------------- ações do carrinho ---------------- */
  const addProduct = useCallback((p: PosProduct) => {
    const price = toNumber(p.finalPrice, 0);
    if (price <= 0) {
      toast.error("Produto sem preço", `"${p.name}" está sem preço final definido.`);
      return;
    }
    setCart((c) => {
      const found = c.find((l) => l.productId === p.id);
      if (found)
        return c.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...c,
        {
          key: `p${p.id}`,
          productId: p.id,
          description: p.name,
          unitPrice: round2(price),
          quantity: 1,
          unitLabel: "UNI",
        },
      ];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((c) =>
      c
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, round2(qty)) } : l))
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((key: string) => setCart((c) => c.filter((l) => l.key !== key)), []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountInput("0");
    setReceivedInput("");
    setCustomerId("");
    clientRef.current = uid();
  }, []);

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
      } else if (e.key === "F8") {
        e.preventDefault();
        setNewCustomerOpen(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        void checkout();
      } else if (e.key === "Escape" && !receipt && !freeItemOpen && !cashOpen && !newCustomerOpen) {
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, total, payment, discountInput, receivedInput, receipt, freeItemOpen, cashOpen, newCustomerOpen]);

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
    if (isCash && received <= 0) {
      return toast.error("Informe o valor recebido em dinheiro");
    }
    if (missingCash) return toast.error("Valor recebido menor que o total");

    chargingLock.current = true;
    setCharging(true);

    const now = new Date();
    const dateFormatted = now.toLocaleDateString("pt-BR");
    const timeFormatted = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const finalDeliveryDate = deliveryDate.trim() || `${dateFormatted} Hora: ${timeFormatted}`;
    const cartSnapshot = [...cart];
    const totalsSnapshot = { subtotal, discount, fee, total, payment, received, change };

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
          paymentMethod: payment,
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
        payment,
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
            <Button
              variant={session ? "soft" : "outline"}
              size="sm"
              icon="wallet"
              onClick={() => setCashOpen(true)}
            >
              {session ? "Caixa aberto" : "Abrir caixa"}
            </Button>
          </div>

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
                    F2 buscar · F4 pagamento · F8 cliente · F9 finalizar
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
                        </p>
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

                {fee > 0 && (
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-amber-300 tnum">
                    <span>
                      taxa {payment.toLowerCase()} ({(feeRate * 100).toFixed(2)}%)
                    </span>
                    <span>+{formatBRL(fee)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between border-t border-dashed border-ink-700 pt-2">
                  <span className="font-mono text-[11px] tracking-[0.18em] text-ink-300 uppercase">
                    Total
                  </span>
                  <span className="font-mono text-[28px] leading-none font-semibold text-cyan-300 tnum">
                    {formatBRL(total)}
                  </span>
                </div>
              </div>

              {/* PAGAMENTO */}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
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

              {/* TROCO EM DINHEIRO */}
              {isCash && (
                <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-2.5">
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
                      onClick={() => setReceivedInput(String(total))}
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
                  (pdvConfig.requireOpenCash && !session) ||
                  (pdvConfig.requireCustomer && !customerId) ||
                  (isCash && received <= 0)
                }
              >
                Finalizar Venda · {formatBRL(total)}
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

      {/* ─────────── MODAL CADASTRAR NOVO CLIENTE RÁPIDO ─────────── */}
      <QuickCustomerModal
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
                  const phone = receipt.customer?.whatsapp || receipt.customer?.phone || "";
                  const cleanPhone = phone.replace(/\D/g, "");
                  const url = cleanPhone
                    ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`
                    : `https://wa.me/?text=${encodeURIComponent(text)}`;
                  window.open(url, "_blank");
                }}
              >
                WhatsApp
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

      {/* CONTAINER EXCLUSIVO DE IMPRESSÃO TÉRMICA (ESCONDIDO NA TELA, REVELADO NO PRINT) */}
      {receipt && (
        <div id="receipt-print" className="hidden">
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
      {/* ── 1. CABEÇALHO DA EMPRESA ── */}
      <div className="text-left font-bold text-[12px] uppercase tracking-tight">
        {company.name || "VTDIGITAL ART STUDIO"}
      </div>

      <div className="text-left text-[11px] uppercase">
        {company.street || "RUA ARAQUEM 910"}
      </div>

      <div className="flex justify-between items-baseline text-[11px] uppercase">
        <span>{company.district || "BANGU"}</span>
        <span>{company.phone || "(21) 2038-3504"}</span>
      </div>

      <div className="flex justify-between items-baseline text-[11px] uppercase">
        <span className="truncate max-w-[210px]">{company.email || "contato.vt@vtdigital.com.br"}</span>
        <span>{company.phone2 || "(21)97886-9414"}</span>
      </div>

      <div className="flex justify-between items-baseline text-[11px] uppercase">
        <span>
          {[company.city, company.state].filter(Boolean).join(" -") || "RIO DE JANEIRO -RJ"}
        </span>
        <span>{company.document || "30.189.224/0001-54"}</span>
      </div>

      <div className="text-left text-[11px] lowercase">
        {company.website || "http://www.vtdigital.com.br"}
      </div>

      {/* DIVISOR DA EMPRESA */}
      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 2. METADADOS DO CUPOM ── */}
      <div className="text-left font-bold text-[11.5px]">
        CUPOM NAO FISCAL {receipt.number.replace(/\D/g, "") || "003798"} {timeFormatted} {dateFormatted}
      </div>

      <div className="my-1.5 border-b border-dashed border-black" />

      {/* ── 3. DADOS DO CLIENTE (SE HOUVER) ── */}
      {c && (
        <>
          <div className="text-left font-bold text-[11.5px] uppercase">{c.name}</div>

          {(c.street || c.number) && (
            <div className="text-left text-[11px] uppercase">
              {[c.street, c.number, c.complement].filter(Boolean).join(", ")}
            </div>
          )}

          {c.document && <div className="text-left text-[11px]">{c.document}</div>}

          <div className="flex justify-between items-baseline text-[11px] uppercase">
            <span>{c.district || "—"}</span>
            <span>{c.phone || c.whatsapp || ""}</span>
          </div>

          <div className="text-left text-[11px] uppercase">
            {[c.city, c.state].filter(Boolean).join(" - ")}{" "}
            {c.cep ? `Cep: ${c.cep}` : ""}
          </div>

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
    if (r.customer.phone || r.customer.whatsapp) {
      lines.push(`TEL: ${r.customer.whatsapp || r.customer.phone}`);
    }
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

  useEffect(() => {
    if (open) {
      setName("");
      setTradeName("");
      setDocument("");
      setPhone("");
      setCep("");
      setStreet("");
      setNumber("");
      setComplement("");
      setDistrict("");
      setCity("");
      setState("");
    }
  }, [open]);

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

  useEffect(() => {
    if (open) {
      setDescription("");
      setPrice("");
      setQty("1");
    }
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
    setCounted("");
    setResult(null);
    setOperator(operatorDefault || "");
    if (session) {
      void loadSummary();
    } else {
      setSummary(null);
    }
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
