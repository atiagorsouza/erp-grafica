"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  TableWrap,
  Td,
  Th,
  Tr,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { formatMoney } from "@/lib/pricing";
import { ShippingQuote, type QuoteOption } from "@/components/modules/ShippingQuote";

type Row = Record<string, unknown>;

type Account = {
  id: string;
  name: string;
  email: string;
  balance: number;
  shipmentsAvailable: number;
};

const STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "red" | "amber"> = {
  cotado: "neutral",
  no_carrinho: "amber",
  pago: "blue",
  postado: "blue",
  em_transito: "blue",
  entregue: "green",
  cancelado: "red",
  erro: "red",
};

const STATUS_LABEL: Record<string, string> = {
  cotado: "Cotado",
  no_carrinho: "No carrinho",
  pago: "Pago",
  postado: "Postado",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  cancelado: "Cancelado",
  erro: "Erro",
};

const fmtDateTime = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export function ShippingClient({
  shipments,
  orders,
  customers,
  account,
  accountError,
  config,
}: {
  shipments: Row[];
  orders: Row[];
  customers: Row[];
  account: Account | null;
  accountError: string | null;
  config: {
    configured: boolean;
    environment: string;
    cepOrigin: string;
    pkg: { weight: number; height: number; width: number; length: number };
  };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [confirmPay, setConfirmPay] = useState<Row | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  /* ---- novo envio ---- */
  const [orderId, setOrderId] = useState("");
  const [option, setOption] = useState<QuoteOption | null>(null);
  const [creating, setCreating] = useState(false);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [Number(c.id), c])),
    [customers]
  );

  const selectedOrder = orders.find((o) => String(o.id) === orderId);
  const selectedCustomer = selectedOrder ? customerById.get(Number(selectedOrder.customerId)) : null;

  const quoteItems = useMemo(() => {
    if (!selectedOrder || !Array.isArray(selectedOrder.items)) return [];
    return (selectedOrder.items as { productId?: number | null; quantity?: number }[]).map((i) => ({
      productId: i.productId ?? null,
      quantity: Number(i.quantity || 1),
    }));
  }, [selectedOrder]);

  const filtered = shipments.filter((s) => {
    const ms = statusFilter === "all" || s.status === statusFilter;
    const term = search.trim().toLowerCase();
    const mq =
      !term ||
      String(s.trackingCode || "").toLowerCase().includes(term) ||
      String(s.serviceName || "").toLowerCase().includes(term) ||
      String(s.addressSnapshot || "").toLowerCase().includes(term);
    return ms && mq;
  });

  function fail(e: unknown, fallback: string) {
    const msg = e instanceof Error ? e.message : "";
    toast.error(fallback, msg && msg.length < 220 ? msg : undefined);
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Falha na operação");
    return json;
  }

  async function createShipment() {
    if (!orderId) return toast.error("Selecione o pedido");
    if (!option) return toast.error("Escolha o serviço de frete");
    setCreating(true);
    try {
      const json = await post({ op: "cart", orderId: Number(orderId), serviceId: option.serviceId });
      toast.success("Envio adicionado ao carrinho", "Pague a etiqueta para gerar o rastreio.");
      if (json.usedFallbackPackage) {
        toast.info("Pacote padrão usado", "Cadastre peso e dimensões nos produtos para cotar melhor.");
      }
      setNewModal(false);
      setOrderId("");
      setOption(null);
      refresh();
    } catch (e) {
      fail(e, "Não foi possível criar o envio");
    } finally {
      setCreating(false);
    }
  }

  async function act(id: number, op: string, extra: Record<string, unknown> = {}, okMsg = "Pronto") {
    setBusyId(id);
    try {
      const json = await post({ op, id, ...extra });
      if (op === "label" && json.url) {
        window.open(json.url, "_blank", "noopener");
      }
      toast.success(okMsg);
      refresh();
      return json;
    } catch (e) {
      fail(e, "Operação não concluída");
    } finally {
      setBusyId(null);
    }
  }

  const totalSpent = shipments
    .filter((s) => ["pago", "postado", "em_transito", "entregue"].includes(String(s.status)))
    .reduce((sum, s) => sum + Number(s.price || 0), 0);
  const inTransit = shipments.filter((s) =>
    ["pago", "postado", "em_transito"].includes(String(s.status))
  ).length;
  const delivered = shipments.filter((s) => s.status === "entregue").length;

  return (
    <div>
      <PageHeader
        eyebrow="Logística & Correios"
        title="Envios"
        icon="truck"
        description="Cotação, etiqueta e rastreio via SuperFrete. Cada envio alimenta Entregas, Pedidos e Financeiro."
        actions={
          <Button icon="plus" disabled={!config.configured} onClick={() => setNewModal(true)}>
            Novo envio
          </Button>
        }
      />

      {/* A regra da casa, escrita onde ela é aplicada (v3.56.0).
          O sistema NÃO impede — toda regra tem exceção e o operador
          decide. Mas quem abre esta tela precisa lembrar dela sem
          ter de perguntar. */}
      <div className="reveal mb-5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-ink-700">
          <strong>Quando usar o SuperFrete:</strong> entregas para{" "}
          <strong>fora do município</strong>, fora do estado, ou itens volumosos.
          <br />
          Dentro da cidade, o normal é motoboy/Uber/99 — que o cliente paga direto —
          ou retirada agendada, confirmando antes se está pronto.
        </p>
      </div>

      {!config.configured && (
        <Card className="reveal mb-5 border-yellow-300 bg-yellow-50">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={18} />
            <div>
              <p className="text-[13px] font-semibold text-ink-900">SuperFrete não configurado</p>
              <p className="mt-1 text-[12px] text-ink-600">
                Vá em <strong>Painel de Controle → Envios &amp; Frete</strong> e informe o token da API.
                Sem ele, a cotação e a etiqueta ficam indisponíveis.
              </p>
            </div>
          </div>
        </Card>
      )}

      {config.configured && (
        <div className="reveal mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-proc-c" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
              Saldo SuperFrete
            </p>
            <p
              className={cn(
                "mt-2 font-mono text-[22px] leading-none font-semibold tnum",
                (account?.balance ?? 0) < 20 ? "text-red-600" : "text-ink-900"
              )}
            >
              {account ? formatMoney(account.balance) : "—"}
            </p>
            <p className="mt-1 text-[10.5px] text-ink-400">
              {account ? `${account.shipmentsAvailable} envio(s) disponível(is)` : accountError || "conta indisponível"}
            </p>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-proc-y" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Em trânsito</p>
            <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-ink-900 tnum">{inTransit}</p>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Entregues</p>
            <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-emerald-700 tnum">{delivered}</p>
          </Card>
          <Card className="halftone-light relative overflow-hidden bg-ink-900">
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-400 uppercase">
              Gasto com frete
            </p>
            <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-cyan-300 tnum">
              {formatMoney(totalSpent)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink-400 uppercase">
              origem {config.cepOrigin || "não definida"} ·{" "}
              {config.environment === "sandbox" ? "SANDBOX" : "produção"}
            </p>
          </Card>
        </div>
      )}

      <div className="reveal mb-3 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Input
          className="w-auto min-w-[180px] flex-1 sm:max-w-[280px]"
          placeholder="Buscar rastreio, serviço ou endereço…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="ml-auto font-mono text-[11px] text-ink-400 tnum">{filtered.length} envios</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="truck"
          title="Nenhum envio"
          hint={
            config.configured
              ? "Crie um envio a partir de um pedido para cotar e gerar a etiqueta."
              : "Configure o token da SuperFrete no Painel de Controle."
          }
        />
      ) : (
        <TableWrap className="reveal reveal-1">
          <thead>
            <tr>
              <Th>Serviço</Th>
              <Th>Destino</Th>
              <Th>Rastreio</Th>
              <Th>Status</Th>
              <Th right>Valor</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const id = Number(s.id);
              const busy = busyId === id;
              const status = String(s.status);
              return (
                <Tr key={id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-proc-c-soft text-proc-c-strong">
                        <Icon name="truck" size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-800">
                          {String(s.serviceName || "Envio")}
                        </span>
                        <span className="font-mono text-[9.5px] text-ink-400 uppercase">
                          {String(s.carrier || "—")} · {fmtDateTime(s.createdAt)}
                        </span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="block max-w-[240px] truncate text-[12px] text-ink-600">
                      {String(s.addressSnapshot || "—")}
                    </span>
                    <span className="font-mono text-[9.5px] text-ink-400">
                      CEP {String(s.cepDestination || "—")}
                    </span>
                  </Td>
                  <Td mono>
                    {s.trackingCode ? (
                      <a
                        href={`https://rastreamento.correios.com.br/app/index.php?objeto=${s.trackingCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-proc-c-strong underline-offset-2 hover:underline"
                      >
                        {String(s.trackingCode)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[status] || "neutral"}>{STATUS_LABEL[status] || status}</Badge>
                    {Boolean(s.lastError) && status === "erro" && (
                      <span className="mt-0.5 block max-w-[180px] truncate text-[10px] text-red-600">
                        {String(s.lastError)}
                      </span>
                    )}
                  </Td>
                  <Td right mono className="font-semibold">
                    {formatMoney(Number(s.price || 0))}
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-0.5">
                      {status === "no_carrinho" && (
                        <IconButton
                          size="sm"
                          name="wallet"
                          label="Pagar etiqueta (consome saldo)"
                          tone="primary"
                          loading={busy}
                          onClick={() => setConfirmPay(s)}
                        />
                      )}
                      {["pago", "postado", "em_transito", "entregue"].includes(status) && (
                        <IconButton
                          size="sm"
                          name="printer"
                          label="Imprimir etiqueta"
                          loading={busy}
                          onClick={() => act(id, "label", {}, "Etiqueta gerada")}
                        />
                      )}
                      {["pago", "postado", "em_transito"].includes(status) && (
                        <IconButton
                          size="sm"
                          name="refresh"
                          label="Atualizar rastreio"
                          loading={busy}
                          onClick={() => act(id, "track", {}, "Rastreio atualizado")}
                        />
                      )}
                      {!["entregue", "cancelado"].includes(status) && (
                        <IconButton
                          size="sm"
                          name="trash"
                          label="Cancelar envio"
                          tone="danger"
                          loading={busy}
                          onClick={() => {
                            setCancelTarget(s);
                            setCancelReason("");
                          }}
                        />
                      )}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {/* ---------- novo envio ---------- */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Novo envio"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewModal(false)}>Cancelar</Button>
            <Button loading={creating} icon="check" disabled={!option} onClick={createShipment}>
              Adicionar ao carrinho
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Pedido" required hint="Só pedidos não cancelados">
            <Select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setOption(null);
              }}
            >
              <option value="">Selecione…</option>
              {orders.map((o) => {
                const c = customerById.get(Number(o.customerId));
                return (
                  <option key={String(o.id)} value={String(o.id)}>
                    {String(o.number)} — {String(c?.tradeName || c?.name || "Consumidor final")} ·{" "}
                    {formatMoney(Number(o.total || 0))}
                  </option>
                );
              })}
            </Select>
          </Field>

          {selectedOrder && !selectedCustomer && (
            <p className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-[12px] text-ink-700">
              Este pedido não tem cliente vinculado. A etiqueta exige destinatário com endereço completo.
            </p>
          )}

          {selectedCustomer && (
            <>
              <div className="rounded-lg border border-paper-200 bg-white px-3 py-2">
                <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">Destinatário</p>
                <p className="mt-1 text-[12.5px] font-medium text-ink-800">
                  {String(selectedCustomer.tradeName || selectedCustomer.name)}
                </p>
                <p className="text-[11.5px] text-ink-500">
                  {[
                    selectedCustomer.street,
                    selectedCustomer.number,
                    selectedCustomer.district,
                    selectedCustomer.city,
                    selectedCustomer.state,
                    selectedCustomer.cep,
                  ]
                    .filter(Boolean)
                    .join(", ") || "sem endereço cadastrado"}
                </p>
              </div>

              <ShippingQuote
                cep={String(selectedCustomer.cep || "")}
                items={quoteItems}
                declaredValue={Number(selectedOrder?.total || 0)}
                selectedServiceId={option?.serviceId ?? null}
                onSelect={setOption}
                autoQuote
              />
            </>
          )}
        </div>
      </Modal>

      {/* ---------- confirmação de pagamento ---------- */}
      <Modal
        open={!!confirmPay}
        onClose={() => setConfirmPay(null)}
        title="Pagar etiqueta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPay(null)}>Cancelar</Button>
            <Button
              icon="wallet"
              loading={busyId === Number(confirmPay?.id)}
              onClick={async () => {
                const target = confirmPay;
                setConfirmPay(null);
                if (target) await act(Number(target.id), "checkout", {}, "Etiqueta paga");
              }}
            >
              Confirmar e pagar
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-600">
          Esta ação <strong className="text-ink-900">debita o saldo real</strong> da sua conta SuperFrete e gera a
          etiqueta dos Correios.
        </p>
        <div className="mt-3 space-y-1.5 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2.5 font-mono text-[11.5px]">
          <p className="flex justify-between">
            <span className="text-ink-500">Serviço</span>
            <span className="font-semibold text-ink-900">{String(confirmPay?.serviceName || "—")}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-ink-500">Valor da etiqueta</span>
            <span className="font-semibold text-ink-900 tnum">{formatMoney(Number(confirmPay?.price || 0))}</span>
          </p>
          <p className="flex justify-between border-t border-paper-200 pt-1.5">
            <span className="text-ink-500">Saldo atual</span>
            <span
              className={cn(
                "font-semibold tnum",
                (account?.balance ?? 0) < Number(confirmPay?.price || 0) ? "text-red-600" : "text-emerald-700"
              )}
            >
              {account ? formatMoney(account.balance) : "—"}
            </span>
          </p>
        </div>
        {account && account.balance < Number(confirmPay?.price || 0) && (
          <p className="mt-2 text-[12px] font-medium text-red-600">
            Saldo insuficiente. Recarregue em superfrete.com antes de continuar.
          </p>
        )}
      </Modal>

      {/* ---------- cancelamento ---------- */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar envio"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button
              variant="danger"
              icon="trash"
              loading={busyId === Number(cancelTarget?.id)}
              onClick={async () => {
                const target = cancelTarget;
                setCancelTarget(null);
                if (target) await act(Number(target.id), "cancel", { reason: cancelReason }, "Envio cancelado");
              }}
            >
              Cancelar envio
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-ink-600">
          Envios já pagos são cancelados também na SuperFrete. O reembolso segue a política deles.
        </p>
        <Field label="Motivo" required>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: cliente desistiu" />
        </Field>
      </Modal>
    </div>
  );
}
