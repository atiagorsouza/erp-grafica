"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import {
  Badge,
  Button,
  Card,
  Combobox,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { applyDiscount, formatBRL, round2, toNumber, toPositive } from "@/lib/money";
import { todayISO } from "@/lib/period";
import { formatCEP, formatDocumentAuto, formatPhone, isWhatsAppBlocked, whatsappNumber } from "@/lib/validators";

import type { CompanyIdentity } from "@/lib/company";
export type PosCompany = CompanyIdentity;

/* ==================================================================
   TIPOS
   ================================================================== */

type Row = Record<string, any>;

/* Estado da paginação, calculado no servidor. `contadores` são as
   somas da base inteira, usadas nas abas. */
type Paginacao = {
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  contadores: Record<string, number>;
  busca: string;
  filtro: string;
};


type OrderItem = {
  productId?: number | null;
  serviceId?: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

const PROD_FLOW = ["aguardando", "em_producao", "concluido"];
const ART_FLOW = ["nao_enviada", "pendente", "aprovado"];
const DELIVERY_FLOW = ["a_definir", "aguardando", "separado", "em_rota", "entregue"];

const FLOW_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  em_producao: "Em produção",
  concluido: "Concluído",
  nao_enviada: "Não enviada",
  pendente: "Pendente",
  aprovado: "Aprovada",
  revisao: "Em revisão",
  a_definir: "A definir",
  separado: "Separado",
  em_rota: "Em rota",
  entregue: "Entregue",
};

/* Componente de barra de progresso dos trilhos */
function FlowSteps({
  flow,
  current,
  onAdvance,
  color = "var(--color-proc-c)",
}: {
  flow: string[];
  current: string;
  onAdvance: (next: string) => void;
  color?: string;
}) {
  const idx = flow.indexOf(current);
  return (
    <div className="flex items-center gap-1">
      {flow.map((step, i) => {
        const done = idx >= i;
        const isCurrent = idx === i;
        return (
          <div key={step} className="flex flex-1 items-center gap-1">
            <button
              onClick={() => onAdvance(step)}
              title={FLOW_LABEL[step] || step}
              className={cn(
                "focus-ring h-2 flex-1 cursor-pointer rounded-full transition-all duration-300",
                done ? "" : "bg-paper-300 hover:bg-paper-400"
              )}
              style={done ? { background: color } : undefined}
            />
            {isCurrent && (
              <span className="animate-pulse-soft h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================================================================
   COMPONENTE PRINCIPAL DE PEDIDOS & OS
   ================================================================== */

export function OrdersClient({
  orders,
  customers: initialCustomers,
  printers,
  approvals,
  schedules,
  deliveries,
  company,
  paginacao,
}: {
  orders: Row[];
  paginacao: Paginacao;
  customers: Row[];
  printers: Row[];
  approvals: Row[];
  schedules: Row[];
  deliveries: Row[];
  company: PosCompany;
}) {
  const router = useRouter();
  const [customersList, setCustomersList] = useState<Row[]>(initialCustomers);

  /* Filtro e busca agora moram na URL (v3.62.0): quem decide o que
     aparece é o servidor. `q` é só o texto enquanto se digita; ele vira
     navegação depois de uma pausa, para não consultar a cada tecla. */
  const filter = paginacao.filtro;
  const [q, setQ] = useState(paginacao.busca);

  const irPara = useCallback(
    (mudancas: Record<string, string | number>) => {
      const p = new URLSearchParams();
      const base: Record<string, string> = {
        q: paginacao.busca,
        filtro: paginacao.filtro,
        pagina: String(paginacao.pagina),
        por: String(paginacao.porPagina),
        ...Object.fromEntries(Object.entries(mudancas).map(([k, v]) => [k, String(v)])),
      };
      // Trocar de filtro ou de busca sempre devolve à primeira página,
      // senão o usuário cairia numa página que não existe mais.
      if (mudancas.q !== undefined || mudancas.filtro !== undefined) base.pagina = "1";
      for (const [k, v] of Object.entries(base)) if (v && v !== "0") p.set(k, v);
      router.push(`/pedidos${p.toString() ? `?${p}` : ""}`);
    },
    [router, paginacao]
  );

  const setFilter = useCallback((valor: string) => irPara({ filtro: valor }), [irPara]);

  /* Debounce da busca: espera a digitação parar antes de ir ao servidor. */
  useEffect(() => {
    if (q === paginacao.busca) return;
    const t = setTimeout(() => irPara({ q }), 300);
    return () => clearTimeout(t);
  }, [q, paginacao.busca, irPara]);
  const [openId, setOpenId] = useState<number | null>(null);

  /* Estados de formulário de novo pedido / edição */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderForm, setOrderForm] = useState<Record<string, string>>({});
  const [editItems, setEditItems] = useState<OrderItem[]>([]);

  /* Outros modais */
  const [artName, setArtName] = useState("");
  const [schedForm, setSchedForm] = useState({ date: "", time: "09:00", printerId: "", minutes: "30" });
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<{ order: Row; mode: "a4" | "thermal" } | null>(null);

  const order = useMemo(() => orders.find((o) => Number(o.id) === openId) || null, [orders, openId]);
  const custName = useCallback(
    (id: unknown) => customersList.find((c) => Number(c.id) === Number(id)) || null,
    [customersList]
  );

  /* Prazo: o pedido exibia a data mas nunca a comparava com hoje —
     nada sinalizava atraso numa gráfica, onde prazo é o que mais
     importa. `todayISO` no fuso da aplicação, para não virar o dia
     antes da hora. */
  const todayStr = todayISO();

  const dueInfo = useCallback(
    (o: Row) => {
      const encerrado = o.status === "cancelado" || o.productionStatus === "concluido";
      const due = String(o.dueDate || "");
      if (!due || encerrado) return { late: false, today: false, days: 0 };
      const diff = Math.round(
        (new Date(`${due}T12:00:00`).getTime() - new Date(`${todayStr}T12:00:00`).getTime()) / 86400000
      );
      return { late: diff < 0, today: diff === 0, days: diff };
    },
    [todayStr]
  );

  /* Contadores das abas vêm do servidor: contam a base inteira, não a
     página. Contar a página faria "Atrasados" mostrar no máximo 50. */
  const lateCount = paginacao.contadores.atrasados ?? 0;

  /* Filtro + Busca global de pedidos */
  const filtered = useMemo(() => {
    /* O servidor já aplicou filtro e busca. Este passo virou apenas uma
       rede de segurança para o intervalo entre digitar e a página chegar. */
    const term = paginacao.busca.trim().toLowerCase();
    return orders.filter((o) => {
      const c = custName(o.customerId);
      const items = Array.isArray(o.items) ? o.items : [];
      const matchTerm =
        !term ||
        String(o.number || "").toLowerCase().includes(term) ||
        (c && String(c.name || "").toLowerCase().includes(term)) ||
        (c && String(c.tradeName || "").toLowerCase().includes(term)) ||
        (c && String(c.document || "").toLowerCase().includes(term)) ||
        (c && String(c.phone || "").toLowerCase().includes(term)) ||
        items.some((i: Row) => String(i.description || "").toLowerCase().includes(term));

      if (!matchTerm) return false;
      if (filter === "atrasados") return dueInfo(o).late;
      if (filter === "ativos") return o.status !== "cancelado" && o.productionStatus !== "concluido";
      if (filter === "todos") return true;
      return o.productionStatus === filter || o.status === filter;
    });
  }, [orders, paginacao.busca, filter, custName, dueInfo]);

  /* Atualização de pedido sem recarga brusca.
   A API centraliza Kanban, Entrega e Financeiro para evitar divergência. */
  async function patchOrder(patchData: Record<string, unknown>, msg: string) {
    if (!order) return;
    try {
      await mutate("orders", "update", patchData, Number(order.id));
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error("Erro ao atualizar", e instanceof Error ? e.message : undefined);
    }
  }

  /* Cancelar pedido */
  const [cancelOpen, setCancelOpen] = useState(false);
  /* cobrança InfinitePay (v3.13.0) */
  const [charging, setCharging] = useState(false);
  const [chargeLink, setChargeLink] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function cancelOrder() {
    if (!order) return;
    if (cancelReason.trim().length < 3) return toast.error("Informe o motivo do cancelamento");
    setCancelling(true);
    try {
      await mutate("orders", "cancel", { reason: cancelReason }, Number(order.id));
      toast.success("Pedido cancelado");
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } catch (e) {
      toast.error("Erro ao cancelar", e instanceof Error ? e.message : undefined);
    } finally {
      setCancelling(false);
    }
  }

  /* Próxima etapa do fluxo */
  function nextOf(flow: string[], current: string): string | null {
    const i = flow.indexOf(current);
    return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
  }

  /* Submeter Arte */
  async function submitArt() {
    if (!order || !artName.trim()) return;
    const existing = approvals.filter((a) => Number(a.orderId) === Number(order.id));
    await mutate("art-approvals", "create", {
      orderId: Number(order.id),
      fileName: artName.trim(),
      version: existing.length + 1,
      status: "pendente",
    });
    await mutate("orders", "update", { artStatus: "pendente" }, Number(order.id));
    setArtName("");
    toast.success("Arte enviada para aprovação");
    router.refresh();
  }

  /* Decidir Aprovação de Arte */
  async function chargeOrder(id: number) {
    setCharging(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", orderId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao gerar cobrança");
      setChargeLink(json.row.checkoutUrl);
      toast.success("Link de pagamento gerado");
      router.refresh();
    } catch (e) {
      toast.error("Não foi possível cobrar", e instanceof Error ? e.message : undefined);
    } finally {
      setCharging(false);
    }
  }

  async function decideArt(a: Row, status: string) {
    await mutate(
      "art-approvals",
      "update",
      { status, approvedAt: status === "aprovado" ? new Date().toISOString() : null },
      Number(a.id)
    );
    await mutate("orders", "update", { artStatus: status === "aprovado" ? "aprovado" : "revisao" }, Number(a.orderId));
    toast.success(status === "aprovado" ? "Arte aprovada — produção liberada" : "Revisão solicitada");
    router.refresh();
  }

  /* Agendar Impressão */
  async function addSchedule() {
    if (!order || !schedForm.date) return toast.error("Informe a data de agendamento");
    await mutate("production-schedules", "create", {
      orderId: Number(order.id),
      printerId: schedForm.printerId || null,
      title: `Produção ${String(order.number)}`,
      scheduledDate: schedForm.date,
      startTime: schedForm.time,
      estimatedMinutes: Number(schedForm.minutes || 30),
      status: "planejado",
    });
    toast.success("Agendado na produção");
    router.refresh();
  }

  /* Abre formulário de novo pedido direto */
  function openNewOrder() {
    setEditOrder(null);
    setEditItems([{ description: "", quantity: 1, unitPrice: 0, total: 0 }]);
    setOrderForm({
      customerId: "",
      channel: "Atendimento",
      priority: "normal",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      paymentMethod: "PIX",
      financialStatus: "pago",
      sellerName: "TIAGO SOUZA",
      discount: "0",
      shippingFee: "0",
      notes: "",
    });
    setEditorOpen(true);
  }

  /* Salvar Pedido Criado / Editado */
  async function saveOrder() {
    if (editItems.length === 0) return toast.error("Adicione ao menos um item ao pedido");
    if (editItems.some((i) => !i.description.trim())) return toast.error("Preencha a descrição de todos os itens");

    setSaving(true);
    try {
      const subtotal = round2(editItems.reduce((s, i) => s + i.total, 0));
      const discount = applyDiscount(subtotal, orderForm.discount, "value");
      const shippingFee = toPositive(orderForm.shippingFee);
      const total = round2(subtotal - discount + shippingFee);

      const payload = {
        customerId: orderForm.customerId ? Number(orderForm.customerId) : null,
        channel: orderForm.channel || "Atendimento",
        priority: orderForm.priority || "normal",
        dueDate: orderForm.dueDate || null,
        paymentMethod: orderForm.paymentMethod || "A definir",
        financialStatus: orderForm.financialStatus || "pago",
        sellerName: orderForm.sellerName || "TIAGO SOUZA",
        discount,
        shippingFee,
        subtotal,
        total,
        notes: orderForm.notes || null,
        items: editItems.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
      };

      if (editOrder) {
        await mutate("orders", "update", payload, Number(editOrder.id));
        toast.success("Pedido atualizado!");
      } else {
        const res = await fetch("/api/crud/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "create", data: payload }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao criar pedido");
        toast.success("Pedido / OS Criado!", json.row?.number);
      }

      setEditorOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Erro ao salvar pedido", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const orderApprovals = order ? approvals.filter((a) => Number(a.orderId) === Number(order.id)) : [];
  const orderSchedules = order ? schedules.filter((s) => Number(s.orderId) === Number(order.id)) : [];
  const orderDelivery = order ? deliveries.find((d) => Number(d.orderId) === Number(order.id)) : null;

  const stats = [
    { k: "ativos", label: "Em aberto", n: paginacao.contadores.ativos ?? 0 },
    { k: "atrasados", label: "Atrasados", n: lateCount },
    { k: "aguardando", label: "Aguardando", n: paginacao.contadores.aguardando ?? 0 },
    { k: "em_producao", label: "Em produção", n: paginacao.contadores.em_producao ?? 0 },
    { k: "concluido", label: "Concluídos", n: paginacao.contadores.concluido ?? 0 },
  ];

  /* Opções de cliente para Combobox */
  const customerOptions = useMemo(
    () =>
      customersList.map((c) => ({
        value: String(c.id),
        label: `${c.name}${c.tradeName ? ` (${c.tradeName})` : ""}`,
        hint: [c.document, c.phone, c.district, c.city].filter(Boolean).join(" · "),
      })),
    [customersList]
  );

  /* Totais calculados no modal de edição */
  const formSubtotal = round2(editItems.reduce((s, i) => s + i.total, 0));
  const formDisc = applyDiscount(formSubtotal, orderForm.discount, "value");
  const formFreight = toPositive(orderForm.shippingFee);
  const formTotal = round2(formSubtotal - formDisc + formFreight);

  return (
    <div>
      <PageHeader
        eyebrow="Ordens de produção & Balcão"
        title="Pedidos & OS"
        icon="orders"
        description="Acompanhe o ciclo de produção, aprovação de arte, entrega e impressão profissional da Ordem de Produção."
        actions={
          <Button icon="plus" onClick={openNewOrder}>
            Novo Pedido / OS
          </Button>
        }
      />

      {/* ── BARRA DE FILTROS & BUSCA ── */}
      <div className="reveal mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <button
              key={s.k}
              onClick={() => setFilter(s.k)}
              className={cn(
                "focus-ring cursor-pointer rounded-lg border px-3.5 py-2 text-left transition-all",
                filter === s.k
                  ? "border-ink-900 bg-ink-900 text-white shadow-pop"
                  : "border-paper-300 bg-paper-50 text-ink-700 hover:border-ink-400"
              )}
            >
              <span className="block font-mono text-[17px] leading-none font-semibold tnum">{s.n}</span>
              <span
                className={cn(
                  "mt-1 block font-mono text-[9px] tracking-[0.14em] uppercase",
                  filter === s.k ? "text-ink-300" : "text-ink-400"
                )}
              >
                {s.label}
              </span>
            </button>
          ))}
          <button
            onClick={() => setFilter("todos")}
            className={cn(
              "focus-ring cursor-pointer self-center rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase",
              filter === "todos"
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-paper-300 bg-paper-50 text-ink-500"
            )}
          >
            Todos ({paginacao.contadores.todos ?? 0})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Icon name="search" size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pedido, cliente, item..."
            className="h-10 pl-9 text-[13px]"
          />
        </div>
      </div>

      {/* ── LISTA DE PEDIDOS EM CARDS ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="orders"
          title="Nenhum pedido encontrado"
          hint="Crie um novo pedido ou converta um orçamento aprovado."
          action={
            <Button icon="plus" onClick={openNewOrder}>
              Novo Pedido / OS
            </Button>
          }
        />
      ) : (
        <div className="reveal reveal-1 grid grid-cols-1 gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => {
            const c = custName(o.customerId);
            const items = Array.isArray(o.items) ? o.items : [];
            return (
              <div
                key={String(o.id)}
                className="group relative rounded-xl border border-paper-200 bg-paper-50 p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-pop flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[14px] font-bold text-ink-900">{String(o.number)}</p>
                      <p className="truncate text-[12.5px] font-semibold text-ink-700">
                        {c ? String(c.tradeName || c.name) : "Consumidor final"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        tone={
                          o.priority === "urgente"
                            ? "red"
                            : o.priority === "alta"
                              ? "amber"
                              : o.priority === "baixa"
                                ? "neutral"
                                : "cyan"
                        }
                      >
                        {String(o.priority || "normal")}
                      </Badge>
                      <StatusBadge value={String(o.productionStatus || "aguardando")} />
                    </div>
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-[11.5px] leading-snug text-ink-500">
                    {items.map((i: Row) => `${Number(i.quantity)}× ${i.description}`).join(" · ") ||
                      "Itens a definir"}
                  </p>

                  <div className="mt-3.5 space-y-2 border-t border-paper-200/80 pt-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-mono text-[8.5px] tracking-wider text-ink-400 uppercase">
                        Produção
                      </span>
                      <FlowSteps
                        flow={PROD_FLOW}
                        current={String(o.productionStatus)}
                        onAdvance={() => {}}
                        color="var(--color-proc-c)"
                      />
                      <span className="w-20 shrink-0 text-right font-mono text-[9.5px] text-ink-500 uppercase truncate">
                        {FLOW_LABEL[String(o.productionStatus)]}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-mono text-[8.5px] tracking-wider text-ink-400 uppercase">
                        Arte
                      </span>
                      <FlowSteps
                        flow={ART_FLOW}
                        current={String(o.artStatus)}
                        onAdvance={() => {}}
                        color="var(--color-proc-m)"
                      />
                      <span className="w-20 shrink-0 text-right font-mono text-[9.5px] text-ink-500 uppercase truncate">
                        {FLOW_LABEL[String(o.artStatus)] || o.artStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-mono text-[8.5px] tracking-wider text-ink-400 uppercase">
                        Entrega
                      </span>
                      <FlowSteps
                        flow={DELIVERY_FLOW}
                        current={String(o.deliveryStatus)}
                        onAdvance={() => {}}
                        color="#10b981"
                      />
                      <span className="w-20 shrink-0 text-right font-mono text-[9.5px] text-ink-500 uppercase truncate">
                        {FLOW_LABEL[String(o.deliveryStatus)] || o.deliveryStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-dashed border-paper-300 pt-2.5">
                  <div className="flex flex-col">
                    {(() => {
                      const d = dueInfo(o);
                      return (
                        <span
                          className={cn(
                            "flex items-center gap-1 font-mono text-[10px] tnum",
                            d.late
                              ? "font-semibold text-red-600"
                              : d.today
                                ? "font-semibold text-amber-600"
                                : "text-ink-400"
                          )}
                        >
                          <Icon name={d.late ? "alert" : "calendar"} size={11} />
                          {o.dueDate
                            ? new Date(`${o.dueDate}T12:00:00`).toLocaleDateString("pt-BR")
                            : "sem prazo"}
                          {d.late && (
                            <span className="rounded bg-red-100 px-1 text-[9px] font-bold uppercase">
                              {Math.abs(d.days)}d atraso
                            </span>
                          )}
                          {d.today && (
                            <span className="rounded bg-amber-100 px-1 text-[9px] font-bold uppercase">
                              hoje
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    <span className="font-mono text-[9.5px] text-ink-500 uppercase">
                      {o.paymentMethod || "A definir"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="soft"
                      size="xs"
                      icon="printer"
                      onClick={() => setPrintDoc({ order: o, mode: "a4" })}
                    >
                      Imprimir OS
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => setOpenId(Number(o.id))}>
                      Detalhes
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PAGINAÇÃO ──
         Duas formas para o mesmo estado: no celular um botão "carregar
         mais" (rolagem é o gesto natural); no computador páginas
         numeradas, que ajudam a saber onde se está e a voltar. */}
      {paginacao.total > 0 && (
        <div className="mt-5 flex flex-col items-center gap-3 border-t border-paper-200 pt-4">
          <p className="text-xs text-ink-500">
            Mostrando{"\u00a0"}
            <strong className="text-ink-700">
              {(paginacao.pagina - 1) * paginacao.porPagina + 1}
              {"\u00a0"}a{"\u00a0"}
              {Math.min(paginacao.pagina * paginacao.porPagina, paginacao.total)}
            </strong>
            {"\u00a0"}de{"\u00a0"}<strong className="text-ink-700">{paginacao.total}</strong>
            {"\u00a0"}
            {paginacao.total === 1 ? "pedido" : "pedidos"}
            {paginacao.busca ? ` para "${paginacao.busca}"` : ""}
          </p>

          {paginacao.totalPaginas > 1 && (
            <>
              {/* Celular */}
              <div className="flex w-full sm:hidden">
                {paginacao.pagina < paginacao.totalPaginas && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => irPara({ pagina: paginacao.pagina + 1 })}
                  >
                    Carregar mais
                  </Button>
                )}
              </div>

              {/* Computador */}
              <div className="hidden items-center gap-1.5 sm:flex">
                <Button
                  variant="outline"
                  disabled={paginacao.pagina <= 1}
                  onClick={() => irPara({ pagina: paginacao.pagina - 1 })}
                >
                  Anterior
                </Button>
                <span className="px-3 text-xs text-ink-500">
                  Página{"\u00a0"}
                  <strong className="text-ink-700">{paginacao.pagina}</strong>
                  {"\u00a0"}de{"\u00a0"}
                  <strong className="text-ink-700">{paginacao.totalPaginas}</strong>
                </span>
                <Button
                  variant="outline"
                  disabled={paginacao.pagina >= paginacao.totalPaginas}
                  onClick={() => irPara({ pagina: paginacao.pagina + 1 })}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DRAWER DO PEDIDO EM DETALHES ── */}
      <Drawer
        open={!!order}
        onClose={() => setOpenId(null)}
        title={order ? String(order.number) : ""}
        subtitle={
          order && (
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge value={String(order.status)} />
              <span className="font-bold text-ink-900">
                {custName(order.customerId)
                  ? String(custName(order.customerId)!.tradeName || custName(order.customerId)!.name)
                  : "Consumidor final"}
              </span>
              <span className="font-mono text-cyan-700 font-bold tnum">{formatBRL(Number(order.total || 0))}</span>
            </span>
          )
        }
        footer={
          order && (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant="soft"
                  icon="printer"
                  onClick={() => {
                    setPrintDoc({ order, mode: "a4" });
                  }}
                >
                  Imprimir OS (A4)
                </Button>
                {order.status !== "cancelado" && order.financialStatus !== "pago" && (
                  <Button
                    variant="ink"
                    icon="wallet"
                    loading={charging}
                    onClick={() => chargeOrder(Number(order.id))}
                  >
                    Cobrar via InfinitePay
                  </Button>
                )}
                {order.status !== "cancelado" && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon="x"
                    onClick={() => { setCancelReason(""); setCancelOpen(true); }}
                  >
                    Cancelar Pedido
                  </Button>
                )}
              </div>
              <Button variant="ghost" onClick={() => setOpenId(null)}>
                Fechar
              </Button>
            </div>
          )
        }
      >
        {order && (
          <div className="space-y-6">
            {/* Itens do Pedido */}
            <Card pad={false} className="overflow-hidden">
              <div className="bg-paper-100 px-4 py-2 border-b border-paper-200 font-mono text-[10.5px] font-semibold text-ink-600 uppercase">
                Itens do Pedido / OS
              </div>
              {(Array.isArray(order.items) ? order.items : []).map((i: Row, ix: number) => (
                <div
                  key={ix}
                  className="flex items-center justify-between gap-3 border-b border-paper-200/70 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-800">{String(i.description)}</p>
                    <p className="font-mono text-[10.5px] text-ink-400 tnum">
                      {Number(i.quantity)} × {formatBRL(Number(i.unitPrice || 0))}
                    </p>
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-ink-900 tnum">
                    {formatBRL(Number(i.total || 0))}
                  </span>
                </div>
              ))}
            </Card>

            {/* Trilho Produção */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                  Trilho de Produção
                </h4>
                <div className="flex gap-1.5">
                  <Select
                    value={String(order.priority || "normal")}
                    onChange={(e) => patchOrder({ priority: e.target.value }, "Prioridade atualizada")}
                    className="h-8 w-auto text-[11.5px]"
                  >
                    {["baixa", "normal", "alta", "urgente"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                  <Input
                    mono
                    type="date"
                    value={String(order.dueDate || "")}
                    onChange={(e) => patchOrder({ dueDate: e.target.value || null }, "Prazo atualizado")}
                    className="h-8 w-auto text-[11.5px]"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-paper-200 bg-white px-4 py-3">
                <FlowSteps
                  flow={PROD_FLOW}
                  current={String(order.productionStatus)}
                  onAdvance={(s) =>
                    patchOrder(
                      { productionStatus: s, status: s === "concluido" ? "concluido" : "confirmado" },
                      `Produção: ${FLOW_LABEL[s]}`
                    )
                  }
                />
                <div className="mt-2.5 flex items-center justify-between">
                  <StatusBadge value={String(order.productionStatus)} />
                  {nextOf(PROD_FLOW, String(order.productionStatus)) && (
                    <Button
                      size="xs"
                      variant="soft"
                      icon="arrow-right"
                      onClick={() =>
                        patchOrder(
                          {
                            productionStatus: nextOf(PROD_FLOW, String(order.productionStatus)),
                            status:
                              nextOf(PROD_FLOW, String(order.productionStatus)) === "concluido"
                                ? "concluido"
                                : "confirmado",
                          },
                          "Etapa avançada"
                        )
                      }
                    >
                      Avançar para {FLOW_LABEL[nextOf(PROD_FLOW, String(order.productionStatus))!]}
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {/* Trilho Arte */}
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                Aprovação de Arte
              </h4>
              <div className="mb-2 flex gap-2">
                <Input
                  value={artName}
                  onChange={(e) => setArtName(e.target.value)}
                  placeholder="Nome ou link da arte (ex.: arte-final.pdf)"
                />
                <Button size="sm" variant="ink" icon="send" onClick={submitArt}>
                  Enviar
                </Button>
              </div>
              <div className="space-y-1.5">
                {orderApprovals.map((a) => (
                  <div
                    key={String(a.id)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-paper-200 bg-white px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-semibold text-ink-800">
                        v{Number(a.version)} · {String(a.fileName)}
                      </p>
                      {a.clientComment && (
                        <p className="truncate text-[11px] text-ink-400">“{String(a.clientComment)}”</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge value={String(a.status)} />
                      {a.status === "pendente" && (
                        <>
                          <IconButton
                            size="sm"
                            name="circle-check"
                            label="Aprovar arte"
                            onClick={() => decideArt(a, "aprovado")}
                          />
                          <IconButton
                            size="sm"
                            name="refresh"
                            label="Pedir revisão"
                            onClick={() => decideArt(a, "revisao")}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {orderApprovals.length === 0 && (
                  <p className="rounded-lg border border-dashed border-paper-300 px-3 py-4 text-center text-[11.5px] text-ink-400">
                    Nenhuma arte vinculada ainda.
                  </p>
                )}
              </div>
            </section>

            {/* Agenda */}
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                Agenda de Impressão
              </h4>
              <div className="mb-2 grid grid-cols-[1fr_90px_1fr_80px_auto] gap-2">
                <Input
                  mono
                  type="date"
                  value={schedForm.date}
                  onChange={(e) => setSchedForm((f) => ({ ...f, date: e.target.value }))}
                />
                <Input
                  mono
                  type="time"
                  value={schedForm.time}
                  onChange={(e) => setSchedForm((f) => ({ ...f, time: e.target.value }))}
                />
                <Select
                  value={schedForm.printerId}
                  onChange={(e) => setSchedForm((f) => ({ ...f, printerId: e.target.value }))}
                >
                  <option value="">Máquina…</option>
                  {printers.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(p.name)}
                    </option>
                  ))}
                </Select>
                <Input
                  mono
                  value={schedForm.minutes}
                  onChange={(e) => setSchedForm((f) => ({ ...f, minutes: e.target.value }))}
                  placeholder="min"
                />
                <Button size="sm" icon="plus" onClick={addSchedule}>
                  Agendar
                </Button>
              </div>
              <div className="space-y-1.5">
                {orderSchedules.map((s) => (
                  <div
                    key={String(s.id)}
                    className="flex items-center justify-between gap-3 rounded-lg bg-paper-100 px-3.5 py-2"
                  >
                    <p className="min-w-0 truncate text-[12px] font-medium text-ink-700">
                      {new Date(`${s.scheduledDate}T12:00:00`).toLocaleDateString("pt-BR")} · {String(s.startTime)}{" "}
                      · {Number(s.estimatedMinutes)}min
                      {s.printerId && (
                        <span className="text-ink-400">
                          {" "}
                          · {printers.find((p) => Number(p.id) === Number(s.printerId))?.name}
                        </span>
                      )}
                    </p>
                    <StatusBadge value={String(s.status)} />
                  </div>
                ))}
                {orderSchedules.length === 0 && (
                  <p className="text-[11.5px] text-ink-400">Nada agendado para este pedido.</p>
                )}
              </div>
            </section>

            {/* Entrega */}
            {orderDelivery && (
              <section>
                <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                  Entrega / Retirada
                </h4>
                <div className="rounded-lg border border-paper-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={String(orderDelivery.method)}
                      onChange={(e) =>
                        mutate("deliveries", "update", { method: e.target.value }, Number(orderDelivery.id)).then(
                          () => router.refresh()
                        )
                      }
                      className="h-8 w-auto text-[11.5px]"
                    >
                      {["retirada", "motoboy", "correios", "transportadora"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                    <StatusBadge value={String(orderDelivery.status)} />
                    <span className="flex-1" />
                    {nextOf(DELIVERY_FLOW, String(orderDelivery.status)) && (
                      <Button
                        size="xs"
                        variant="soft"
                        icon="truck"
                        onClick={async () => {
                          const next = nextOf(DELIVERY_FLOW, String(orderDelivery.status))!;
                          await mutate(
                            "deliveries",
                            "update",
                            { status: next, deliveredAt: next === "entregue" ? new Date().toISOString() : null },
                            Number(orderDelivery.id)
                          );
                          await mutate("orders", "update", { deliveryStatus: next }, Number(order.id));
                          toast.success(`Entrega: ${FLOW_LABEL[next]}`);
                          router.refresh();
                        }}
                      >
                        {FLOW_LABEL[nextOf(DELIVERY_FLOW, String(orderDelivery.status))!]}
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            )}

            {order.notes && (
              <div className="rounded-lg bg-proc-y-soft px-4 py-3">
                <p className="font-mono text-[9.5px] font-semibold tracking-wider text-yellow-700 uppercase">
                  Observações
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">{String(order.notes)}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── MODAL CRIAR / EDITAR PEDIDO DIRETO ── */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editOrder ? "Editar Pedido / OS" : "Novo Pedido / OS"}
        subtitle="Crie ordens de produção diretamente no balcão com itens do catálogo ou avulsos."
        width="max-w-4xl"
        footer={
          <>
            <div className="mr-auto text-right">
              <p className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">Total do Pedido</p>
              <p className="font-mono text-[22px] leading-none font-bold text-proc-c-strong tnum">
                {formatBRL(formTotal)}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={saveOrder} icon="circle-check">
              Salvar Pedido / OS
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Field label="Cliente">
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <Combobox
                    value={orderForm.customerId || ""}
                    onChange={(v) => setOrderForm((f) => ({ ...f, customerId: v }))}
                    placeholder="Consumidor final"
                    options={customerOptions}
                  />
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  title="Cadastrar cliente (F8)"
                  onClick={() => setNewCustomerOpen(true)}
                  className="shrink-0 font-semibold"
                >
                  + Novo
                </Button>
              </div>
            </Field>

            <Field label="Canal de Entrada">
              <Select
                value={orderForm.channel || "Atendimento"}
                onChange={(e) => setOrderForm((f) => ({ ...f, channel: e.target.value }))}
              >
                {["Atendimento", "Balcão", "Instagram", "Site", "Indicação"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>

            <Field label="Previsão de Entrega">
              <Input
                mono
                type="date"
                value={orderForm.dueDate || ""}
                onChange={(e) => setOrderForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
            <Field label="Pagamento">
              <Select
                value={orderForm.paymentMethod || "PIX"}
                onChange={(e) => setOrderForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                {["PIX", "Dinheiro", "Débito", "Crédito", "Boleto", "50% entrada + 50% na entrega"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>

            <Field label="Situação Financeira">
              <Select
                value={orderForm.financialStatus || "pago"}
                onChange={(e) => setOrderForm((f) => ({ ...f, financialStatus: e.target.value }))}
              >
                <option value="pago">pago</option>
                <option value="pendente">pendente</option>
                <option value="parcial">parcial</option>
              </Select>
            </Field>

            <Field label="Prioridade">
              <Select
                value={orderForm.priority || "normal"}
                onChange={(e) => setOrderForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {["baixa", "normal", "alta", "urgente"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>

            <Field label="Vendedor / Atendente">
              <Input
                value={orderForm.sellerName || "TIAGO SOUZA"}
                onChange={(e) => setOrderForm((f) => ({ ...f, sellerName: e.target.value }))}
                placeholder="Ex.: TIAGO SOUZA"
              />
            </Field>
          </div>

          {/* Tabela de Itens do Pedido */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase">
                Itens da Ordem de Produção
              </h4>
              <Button
                size="sm"
                variant="outline"
                icon="plus"
                onClick={() =>
                  setEditItems((arr) => [
                    ...arr,
                    { description: "", quantity: 1, unitPrice: 0, total: 0 },
                  ])
                }
              >
                Item avulso
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-paper-200 space-y-1 bg-paper-100 p-1.5">
              {editItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-white p-2 border border-paper-200">
                  <Input
                    value={it.description}
                    onChange={(e) =>
                      setEditItems((arr) =>
                        arr.map((item, j) => (j === i ? { ...item, description: e.target.value } : item))
                      )
                    }
                    placeholder="Descrição do produto ou serviço"
                    className="flex-1 text-[13px]"
                  />
                  <Input
                    mono
                    value={String(it.quantity)}
                    onChange={(e) => {
                      const q = toPositive(e.target.value, 1);
                      setEditItems((arr) =>
                        arr.map((item, j) =>
                          j === i ? { ...item, quantity: q, total: round2(q * item.unitPrice) } : item
                        )
                      );
                    }}
                    className="w-20 text-right text-[12.5px]"
                    placeholder="qtd"
                  />
                  <Input
                    mono
                    value={String(it.unitPrice)}
                    onChange={(e) => {
                      const p = toPositive(e.target.value, 0);
                      setEditItems((arr) =>
                        arr.map((item, j) =>
                          j === i ? { ...item, unitPrice: p, total: round2(item.quantity * p) } : item
                        )
                      );
                    }}
                    className="w-28 text-right text-[12.5px]"
                    placeholder="R$ un"
                  />
                  <span className="w-24 shrink-0 text-right font-mono text-[13px] font-bold text-ink-900 tnum">
                    {formatBRL(it.total)}
                  </span>
                  <IconButton
                    size="sm"
                    name="trash"
                    label="Remover"
                    tone="danger"
                    onClick={() => setEditItems((arr) => arr.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 border-t border-paper-200 pt-3">
            <Field label="Desconto (R$)">
              <Input
                mono
                value={orderForm.discount || "0"}
                onChange={(e) => setOrderForm((f) => ({ ...f, discount: e.target.value }))}
              />
            </Field>

            <Field label="Frete (R$)">
              <Input
                mono
                value={orderForm.shippingFee || "0"}
                onChange={(e) => setOrderForm((f) => ({ ...f, shippingFee: e.target.value }))}
              />
            </Field>

            <div className="col-span-2 flex items-end justify-end gap-5 pb-1">
              <span className="text-right text-[11px] text-ink-500">
                Subtotal
                <span className="block font-mono text-[13px] font-semibold text-ink-800 tnum">
                  {formatBRL(formSubtotal)}
                </span>
              </span>
              <span className="text-right text-[11px] text-ink-500">
                Total Final
                <span className="block font-mono text-[16px] font-bold text-proc-c-strong tnum">
                  {formatBRL(formTotal)}
                </span>
              </span>
            </div>
          </div>

          <Field label="Observações de Produção / Geral">
            <Textarea
              value={orderForm.notes || ""}
              onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Instruções de acabamento, tipo de papel, observações da arte..."
            />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL CADASTRO RÁPIDO CLIENTE (F8) ── */}
      <QuickCustomerModal
        key={newCustomerOpen ? "customer-open" : "customer-closed"}
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={(newCust) => {
          setCustomersList((prev) => [newCust, ...prev]);
          setOrderForm((f) => ({ ...f, customerId: String(newCust.id) }));
          toast.success("Cliente cadastrado!", newCust.name);
        }}
      />

      {/* ── DRAWER / MODAL DE IMPRESSÃO PROFISSIONAL (EXATO À FOTO DE REFERÊNCIA) ── */}
      <Drawer
        open={!!printDoc}
        onClose={() => setPrintDoc(null)}
        title="Impressão da Ordem de Produção / Pedido"
        subtitle="Layout A4 Profissional idêntico ao modelo de balcão ou Cupom Térmico 80mm"
        width="max-w-4xl"
        footer={
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant={printDoc?.mode === "a4" ? "ink" : "outline"}
                size="sm"
                onClick={() => setPrintDoc((p) => p && { ...p, mode: "a4" })}
              >
                Folha A4 / OS
              </Button>
              <Button
                variant={printDoc?.mode === "thermal" ? "ink" : "outline"}
                size="sm"
                onClick={() => setPrintDoc((p) => p && { ...p, mode: "thermal" })}
              >
                Cupom 80 mm
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="soft"
                size="sm"
                icon="whatsapp"
                onClick={() => {
                  if (!printDoc) return;
                  const o = printDoc.order;
                  const c = custName(o.customerId);
                  const text = `*${company.name}*\n*ORDEM DE PRODUÇÃO ${o.number}*\nStatus: ${o.status}\nCliente: ${c ? c.name : "Consumidor final"}\nTotal: ${formatBRL(Number(o.total || 0))}\nPrazo: ${o.dueDate || "A definir"}`;

                  /* O cliente pode ter pedido para não receber WhatsApp.
                     Não preenchemos o destinatário: a mensagem abre em
                     branco e o operador decide. */
                  if (isWhatsAppBlocked(c)) {
                    toast.info(
                      "Cliente não aceita WhatsApp",
                      "O texto abrirá sem destinatário — escolha outro canal se possível."
                    );
                  }

                  const cleanPhone = whatsappNumber(c);
                  const url = cleanPhone
                    ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`
                    : `https://wa.me/?text=${encodeURIComponent(text)}`;
                  window.open(url, "_blank");
                }}
              >
                WhatsApp
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon="printer"
                onClick={() => {
                  window.print();
                }}
              >
                {printDoc?.mode === "a4" ? "Imprimir A4 / OS" : "Imprimir Cupom 80mm"}
              </Button>

              <Button variant="ghost" size="sm" onClick={() => setPrintDoc(null)}>
                Fechar
              </Button>
            </div>
          </div>
        }
      >
        {printDoc && (
          <div className="bg-paper-100 p-4 rounded-xl border border-paper-300 overflow-x-auto">
            {/* Reduz a folha inteira para caber na largura do aparelho.
               Uso `zoom` em vez de `scale` porque ele recalcula a altura
               do bloco — `scale` deixaria uma faixa vazia embaixo. No
               computador o valor volta a 1 e nada muda. */}
            <div className="[zoom:0.42] sm:[zoom:1] w-[800px] sm:mx-auto">
            {printDoc.mode === "a4" ? (
              <ProductionOrderA4
                order={printDoc.order}
                customer={custName(printDoc.order.customerId)}
                company={company}
              />
            ) : (
              <ThermalOrderReceipt
                order={printDoc.order}
                customer={custName(printDoc.order.customerId)}
                company={company}
              />
            )}
            </div>
          </div>
        )}
      </Drawer>

      {/* ── MODAL LINK DE COBRANÇA (InfinitePay) ── */}
      <Modal
        open={!!chargeLink}
        onClose={() => setChargeLink(null)}
        title="Link de pagamento gerado"
        width="max-w-md"
        footer={<Button icon="check" onClick={() => setChargeLink(null)}>Fechar</Button>}
      >
        <p className="text-[13px] text-ink-600">
          Envie ao cliente. Quando ele pagar, o pedido é quitado e a receita entra no Financeiro
          automaticamente.
        </p>
        <div className="mt-3 rounded-lg border border-paper-200 bg-paper-50 p-3">
          <p className="break-all font-mono text-[11.5px] text-proc-c-strong">{chargeLink}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon="copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(chargeLink));
                toast.success("Link copiado");
              } catch {
                toast.error("Não foi possível copiar");
              }
            }}
          >
            Copiar
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="whatsapp"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(`Segue o link para pagamento: ${chargeLink}`)}`,
                "_blank",
                "noopener"
              )
            }
          >
            WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="external"
            onClick={() => window.open(String(chargeLink), "_blank", "noopener")}
          >
            Abrir
          </Button>
        </div>
      </Modal>

      {/* ── MODAL CANCELAR PEDIDO ── */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar Pedido"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="danger" icon="x" loading={cancelling} onClick={cancelOrder}>
              Confirmar cancelamento
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-700 mb-3">
          Informe o motivo do cancelamento de <strong>{order?.number}</strong>.
        </p>
        <Field label="Motivo do cancelamento" required>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex.: Cliente desistiu, pagamento não confirmado..."
            autoFocus
          />
        </Field>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          O status do pedido será marcado como cancelado. Esta ação não exclui o registro.
        </p>
      </Modal>

      {/* ÁREA ISOLADA DE IMPRESSÃO A4 (EXATA À FOTO DE REFERÊNCIA) */}
      {printDoc && printDoc.mode === "a4" && (
        <div id="order-print-a4" className="hidden">
          <ProductionOrderA4
            order={printDoc.order}
            customer={custName(printDoc.order.customerId)}
            company={company}
            isPrint
          />
        </div>
      )}

      {/* ÁREA ISOLADA DE IMPRESSÃO TÉRMICA 80MM */}
      {printDoc && printDoc.mode === "thermal" && (
        <div id="order-print-80mm" className="hidden">
          <ThermalOrderReceipt
            order={printDoc.order}
            customer={custName(printDoc.order.customerId)}
            company={company}
            isPrint
          />
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   DOCUMENTO A4 DE ORDEM DE PRODUÇÃO / PEDIDO (IDÊNTICO À FOTO)
   ================================================================== */

function ProductionOrderA4({
  order,
  customer,
  company,
  isPrint,
}: {
  order: Row;
  customer: Row | null;
  company: PosCompany;
  isPrint?: boolean;
}) {
  const items = Array.isArray(order.items) ? order.items : [];
  /* Sem `Date.now()` no render: ler o relógio durante a renderização é
     impuro e daria datas diferentes entre servidor e cliente na OS. */
  const createdAtFormatted = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("pt-BR")
    : "—";
  const subtotal = toNumber(order.subtotal, 0);
  const discount = toNumber(order.discount, 0);
  const shippingFee = toNumber(order.shippingFee, 0);
  const total = toNumber(order.total, 0);

  return (
    <div
      className={cn(
        "font-sans text-ink-900 bg-white text-[12px] leading-snug select-text",
        /* Na tela o documento tem largura de folha; no celular ele era
           espremido para ~360px e as colunas colidiam uma sobre a outra
           (Subtotal por cima do valor, "AGUARDANDO"/"PAGO" embolados).
           A folha agora mantém a largura real e é reduzida por inteiro,
           que é como se lê um documento — não reflowada. A impressão
           usa `isPrint` e não passa por aqui. */
        isPrint ? "w-full p-8" : "w-[800px] shrink-0 p-8 shadow-sm rounded border border-paper-300"
      )}
      style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* ── CABEÇALHO DA EMPRESA ── */}
      <div className="flex items-start justify-between border-b border-paper-300 pb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink-950 tracking-tight leading-none">
            {company.name || "VTDIGITAL ART STUDIO"}
          </h1>
          <p className="text-[11px] font-semibold text-proc-c tracking-wider uppercase mt-1">
            GRÁFICA RÁPIDA E PERSONALIZADOS
          </p>
        </div>

        <div className="text-right text-[10.5px] text-ink-600 leading-tight">
          <p>{company.address}</p>
          <p>{company.phone} · {company.phone2}</p>
          <p>{company.email}</p>
          <p className="font-mono">
            CNPJ {company.document}
            {company.stateRegistration ? ` · IE ${company.stateRegistration}` : ""}
          </p>
        </div>
      </div>

      {/* ── BANNERS / DETALHES DA ORDEM DE PRODUÇÃO ── */}
      <div className="mt-4 flex items-center justify-between border-l-4 border-proc-c bg-proc-c-soft/40 px-4 py-3 rounded-r-lg">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-cyan-800 uppercase">
            ORDEM DE PRODUÇÃO
          </p>
          <h2 className="display-expanded text-[24px] font-extrabold text-ink-950 leading-none mt-0.5">
            {order.number}
          </h2>
        </div>

        <div className="text-right">
          <p className="font-mono text-[10px] text-ink-500 uppercase">Emissão</p>
          <p className="font-mono text-[15px] font-bold text-ink-900">{createdAtFormatted}</p>
          <span className="mt-1 inline-block rounded bg-proc-c px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
            {order.status || "APROVADO"}
          </span>
        </div>
      </div>

      {/* ── DADOS DO CLIENTE ── */}
      <div className="mt-5">
        <h3 className="border-b border-proc-c font-mono text-[12px] font-bold text-ink-900 uppercase pb-1 mb-2">
          Dados do cliente
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[11.5px]">
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">CLIENTE</span>
            <span className="font-bold text-ink-900">{customer ? customer.name : "Consumidor final"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">CPF/CNPJ</span>
            <span className="font-mono">{customer?.document || "—"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">CONTATO</span>
            <span>{customer?.phone || customer?.whatsapp || "—"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">E-MAIL</span>
            <span className="truncate block">{customer?.email || "—"}</span>
          </div>
        </div>
        {/* PJ: dados fiscais do destinatário, iguais aos do orçamento. */}
        {customer?.type === "pj" && (
          <div className="mt-2 grid grid-cols-4 gap-2 text-[11.5px]">
            <div>
              <span className="block font-mono text-[9px] text-ink-400 uppercase">RAZÃO SOCIAL</span>
              <span>{String(customer?.name || "—")}</span>
            </div>
            <div>
              <span className="block font-mono text-[9px] text-ink-400 uppercase">INSC. ESTADUAL</span>
              <span className="font-mono">{String(customer?.stateRegistration || "ISENTO")}</span>
            </div>
            <div>
              <span className="block font-mono text-[9px] text-ink-400 uppercase">INSC. MUNICIPAL</span>
              <span className="font-mono">{String(customer?.municipalRegistration || "—")}</span>
            </div>
            <div>
              <span className="block font-mono text-[9px] text-ink-400 uppercase">A/C</span>
              <span>{String(customer?.contactName || "—")}</span>
            </div>
          </div>
        )}

        <div className="mt-2 text-[11.5px]">
          <span className="block font-mono text-[9px] text-ink-400 uppercase">ENDEREÇO</span>
          <span>
            {customer && (customer.street || customer.district)
              ? [
                  customer.street,
                  customer.number,
                  customer.complement,
                  customer.district,
                  customer.city,
                  customer.state,
                  customer.cep ? `CEP ${formatCEP(customer.cep)}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "—"}
          </span>
        </div>
      </div>

      {/* ── CONDIÇÕES DO PEDIDO ── */}
      <div className="mt-5">
        <h3 className="border-b border-proc-c font-mono text-[12px] font-bold text-ink-900 uppercase pb-1 mb-2">
          Condições do pedido
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[11.5px]">
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">CANAL</span>
            <span className="font-medium">{order.channel || "Atendimento"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">PAGAMENTO</span>
            <span className="font-medium">{order.paymentMethod || "A definir"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">ETAPA ATUAL</span>
            <span className="font-bold text-cyan-800 uppercase">{FLOW_LABEL[order.productionStatus] || order.productionStatus}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">SITUAÇÃO FINANCEIRA</span>
            <span className="font-bold uppercase text-emerald-700">{order.financialStatus || "pago"}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11.5px] mt-2">
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">ENTREGA</span>
            <span className="font-medium">{order.deliveryStatus || "Balcão"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">PREVISÃO</span>
            <span className="font-mono font-bold text-ink-900">
              {order.dueDate ? new Date(`${order.dueDate}T12:00:00`).toLocaleDateString("pt-BR") : "A combinar"}
            </span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">RESPONSÁVEL</span>
            <span>{order.sellerName || "TIAGO SOUZA"}</span>
          </div>
        </div>
      </div>

      {/* ── TABELA DE PRODUTOS / SERVIÇOS ── */}
      <div className="mt-5">
        <table className="w-full text-left text-[11.5px] border-collapse">
          <thead>
            <tr className="bg-proc-c text-white font-mono text-[10px] uppercase">
              <th className="py-1.5 px-3 w-10">#</th>
              <th className="py-1.5 px-3">Descrição do produto / serviço</th>
              <th className="py-1.5 px-3 text-center w-16">Qtd.</th>
              <th className="py-1.5 px-3 text-right w-24">Unitário</th>
              <th className="py-1.5 px-3 text-right w-28">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200 border-b border-paper-200">
            {items.map((i: Row, idx: number) => (
              <tr key={idx} className="even:bg-paper-50/50">
                <td className="py-2 px-3 font-mono text-[10.5px] text-ink-500">{String(idx + 1).padStart(2, "0")}</td>
                <td className="py-2 px-3 font-semibold text-ink-900">{String(i.description)}</td>
                <td className="py-2 px-3 text-center font-mono tnum">{Number(i.quantity)}</td>
                <td className="py-2 px-3 text-right font-mono tnum">{formatBRL(Number(i.unitPrice))}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-ink-900 tnum">
                  {formatBRL(Number(i.total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── ANOTAÇÕES, CHECKLIST & BLOCO DE TOTAIS ── */}
      <div className="mt-5 grid grid-cols-12 gap-4">
        {/* Esquerda: Anotações & Checklist */}
        <div className="col-span-7 space-y-3">
          <div>
            <h4 className="border-b border-proc-c font-mono text-[11px] font-bold text-ink-900 uppercase pb-0.5 mb-1.5">
              Informações / anotações / observações
            </h4>
            <p className="text-[11px] text-ink-700 leading-relaxed italic">
              {order.notes || "Sem observações registradas."}
            </p>
          </div>

          <div className="pt-2">
            <p className="font-mono text-[9px] font-bold text-ink-400 uppercase mb-1.5">Checklist de Produção</p>
            <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono text-ink-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="rounded text-proc-c" /> Arte conferida
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="rounded text-proc-c" /> Material separado
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="rounded text-proc-c" /> Produção revisada
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="rounded text-proc-c" /> Embalado
              </label>
            </div>
          </div>
        </div>

        {/* Direita: Totais com Faixa Destaque Ciano */}
        <div className="col-span-5 space-y-1 font-mono text-[12px] text-ink-800">
          <div className="flex justify-between py-0.5">
            <span className="text-ink-500">Subtotal</span>
            <span className="font-bold">{formatBRL(subtotal)}</span>
          </div>

          {shippingFee > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500">Frete</span>
              <span className="font-bold">{formatBRL(shippingFee)}</span>
            </div>
          )}

          {discount > 0 && (
            <div className="flex justify-between py-0.5 text-emerald-700">
              <span>Desconto</span>
              <span className="font-bold">− {formatBRL(discount)}</span>
            </div>
          )}

          <div className="mt-2 flex justify-between items-center bg-proc-c text-white font-bold text-[15px] px-3 py-2 rounded">
            <span>Total</span>
            <span className="text-[17px]">{formatBRL(total)}</span>
          </div>
        </div>
      </div>

      {/* ── ASSINATURAS ── */}
      <div className="mt-12 pt-4 grid grid-cols-2 gap-12 text-center text-[10.5px] text-ink-500">
        <div>
          <div className="border-t border-ink-400 mb-1" />
          <p>Responsável pela produção</p>
        </div>
        <div>
          <div className="border-t border-ink-400 mb-1" />
          <p>Cliente / retirada / recebimento</p>
        </div>
      </div>

      {/* RODAPÉ DO DOCUMENTO */}
      <div className="mt-8 border-t border-paper-200 pt-3 text-center font-mono text-[9.5px] text-ink-400">
        {company.name} • Pedido sem valor fiscal.
      </div>
    </div>
  );
}

/* ==================================================================
   RECIBO TÉRMICO DE BALCÃO PARA PEDIDOS (80MM)
   ================================================================== */

function ThermalOrderReceipt({
  order,
  customer,
  company,
  isPrint,
}: {
  order: Row;
  customer: Row | null;
  company: PosCompany;
  isPrint?: boolean;
}) {
  const items = Array.isArray(order.items) ? order.items : [];
  /* idem: relógio fora do render */
  const createdAtFormatted = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("pt-BR")
    : "—";

  return (
    <div
      className={cn(
        "font-mono text-[11px] leading-[1.25] text-black bg-white select-text",
        isPrint ? "w-[80mm] p-0" : "p-5 border border-dashed border-gray-400 rounded shadow-sm max-w-[340px] mx-auto"
      )}
      style={{ fontFamily: "'IBM Plex Mono', 'Courier New', Courier, monospace" }}
    >
      <div className="text-left font-bold text-[12px] uppercase">{company.name}</div>
      <div className="text-left text-[11px] uppercase">{company.address}</div>
      <div className="text-left text-[11px] uppercase">Tel: {company.phone} / CNPJ: {company.document}</div>
      {company.stateRegistration && (
        <div className="text-left text-[11px] uppercase">IE: {company.stateRegistration}</div>
      )}
      <div className="my-1.5 border-b border-dashed border-black" />

      <div className="font-bold text-[12px]">ORDEM DE PRODUÇÃO {order.number}</div>
      <div>EMISSÃO: {createdAtFormatted}</div>
      <div className="my-1.5 border-b border-dashed border-black" />

      {customer && (
        <>
          <div className="font-bold uppercase">CLIENTE: {customer.name}</div>
          {/* documento e contato PJ: a via de produção também serve de
              comprovante de entrega (v3.23.0) */}
          {customer.document ? <div>CPF/CNPJ: {formatDocumentAuto(String(customer.document))}</div> : null}
          {customer.contactName ? <div className="uppercase">A/C: {String(customer.contactName)}</div> : null}
          {customer.phone && <div>TEL: {formatPhone(customer.phone)}</div>}
          <div className="my-1.5 border-b border-dashed border-black" />
        </>
      )}

      <div className="font-bold uppercase">ITENS:</div>
      {items.map((i: Row, idx: number) => (
        <div key={idx} className="mt-1">
          <p className="font-semibold">{i.description}</p>
          <p className="flex justify-between">
            <span>{i.quantity} x {formatBRL(Number(i.unitPrice))}</span>
            <span className="font-bold">{formatBRL(Number(i.total))}</span>
          </p>
        </div>
      ))}

      <div className="my-1.5 border-b border-dashed border-black" />
      <div className="flex justify-between font-bold text-[13px]">
        <span>TOTAL</span>
        <span>{formatBRL(Number(order.total || 0))}</span>
      </div>
      <div className="my-1.5 border-b border-dashed border-black" />
      <div className="text-[10px]">
        <p>Vendedor: {order.sellerName || "TIAGO SOUZA"}</p>
        <p>Prazo: {order.dueDate || "A combinar"}</p>
        <p>{order.notes}</p>
      </div>
    </div>
  );
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
  onCreated: (cust: Row) => void;
}) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);

  /* Reset por `key` no pai: remontar é mais barato (e correto no
     React 19) que zerar nove estados dentro de um efeito. */

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
      /* ignora erro ViaCEP */
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
        document: document.trim() || null,
        phone: phone.trim() || null,
        whatsapp: phone.trim() || null,
        cep: cep.trim() || null,
        street: street.trim() || null,
        number: number.trim() || null,
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

      onCreated(json.row);
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
            placeholder="Ex.: ANA OLIVEIRA"
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
              placeholder="(11) 99871-2001"
            />
          </Field>
        </div>

        <div className="border-t border-paper-200 pt-2 space-y-2">
          <p className="font-semibold text-ink-800 text-[11.5px]">Endereço</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CEP" hint={fetchingCep ? "buscando..." : undefined}>
              <Input
                mono
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={handleCepBlur}
                placeholder="00000-000"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Rua / Logradouro">
                <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Logradouro" />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Número">
              <Input mono value={number} onChange={(e) => setNumber(e.target.value)} placeholder="100" />
            </Field>
            <Field label="Bairro">
              <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Bairro" />
            </Field>
            <Field label="Cidade/UF">
              <Input
                value={city ? `${city}/${state}` : ""}
                onChange={(e) => setCity(e.target.value)}
                placeholder="São Paulo/SP"
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
