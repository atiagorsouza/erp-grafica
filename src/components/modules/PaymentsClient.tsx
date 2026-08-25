"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { whatsappNumber, type WhatsAppTarget } from "@/lib/validators";
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

type Row = Record<string, unknown>;

const STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "red" | "amber"> = {
  pendente: "amber",
  pago: "green",
  expirado: "neutral",
  cancelado: "red",
  erro: "red",
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando",
  pago: "Pago",
  expirado: "Expirado",
  cancelado: "Cancelado",
  erro: "Erro",
};

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Crédito",
  debit_card: "Débito",
};

const fmtDateTime = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export function PaymentsClient({
  charges,
  summary,
  orders,
  customers,
  config,
}: {
  charges: Row[];
  summary: { pending: number; paid: number; pendingCount: number; paidCount: number };
  orders: Row[];
  customers: Row[];
  config: {
    configured: boolean;
    handle: string;
    manualLink: string | null;
    methods: string[];
    webhookUrl: string;
    hasBaseUrl: boolean;
  };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [created, setCreated] = useState<Row | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [mode, setMode] = useState<"order" | "avulso">("order");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [creating, setCreating] = useState(false);

  const customerById = useMemo(() => new Map(customers.map((c) => [Number(c.id), c])), [customers]);
  const selectedOrder = orders.find((o) => String(o.id) === orderId);

  const filtered = charges.filter((c) => {
    const ms = statusFilter === "all" || c.status === statusFilter;
    const term = search.trim().toLowerCase();
    const mq =
      !term ||
      String(c.description || "").toLowerCase().includes(term) ||
      String(c.orderNsu || "").toLowerCase().includes(term);
    return ms && mq;
  });

  function fail(e: unknown, fallback: string) {
    const msg = e instanceof Error ? e.message : "";
    toast.error(fallback, msg && msg.length < 220 ? msg : undefined);
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Falha na operação");
    return json;
  }

  async function createCharge() {
    if (mode === "order" && !orderId) return toast.error("Selecione o pedido");
    if (mode === "avulso" && !amount.trim()) return toast.error("Informe o valor");
    setCreating(true);
    try {
      const json = await post({
        op: "create",
        ...(mode === "order"
          ? { orderId: Number(orderId) }
          : {
              amount: amount.replace(",", "."),
              description: description || undefined,
              /* Quem pagou: cobrança avulsa sem cliente virava receita
                 impossível de identificar no Financeiro (25/08). */
              ...(customerId ? { customerId: Number(customerId) } : {}),
            }),
      });
      setNewModal(false);
      setCreated(json.row);
      setOrderId("");
      setAmount("");
      setDescription("");
      setCustomerId("");
      toast.success("Link de pagamento criado");
      refresh();
    } catch (e) {
      fail(e, "Não foi possível criar a cobrança");
    } finally {
      setCreating(false);
    }
  }

  async function act(id: number, op: string, extra: Record<string, unknown> = {}, okMsg = "Pronto") {
    setBusyId(id);
    try {
      const json = await post({ op, id, ...extra });
      if (op === "check") {
        if (json.paid) toast.success("Pagamento confirmado!", "Documento quitado e receita lançada.");
        else if (json.underpaid) toast.error("Valor pago menor que o cobrado", "Confira antes de quitar.");
        else toast.info("Ainda não consta como pago", "Tente novamente em instantes.");
      } else {
        toast.success(okMsg);
      }
      refresh();
    } catch (e) {
      fail(e, "Operação não concluída");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar", text);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Recebimentos online"
        title="Cobranças"
        icon="wallet"
        description="Links de pagamento InfinitePay com Pix e cartão. Pagamento confirmado quita o pedido e lança a receita automaticamente."
        actions={
          <Button icon="plus" disabled={!config.configured} onClick={() => setNewModal(true)}>
            Nova cobrança
          </Button>
        }
      />

      {!config.configured && (
        <Card className="reveal mb-5 border-yellow-300 bg-yellow-50">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={18} />
            <div>
              <p className="text-[13px] font-semibold text-ink-900">InfinitePay não configurada</p>
              <p className="mt-1 text-[12px] text-ink-600">
                Informe sua <strong>InfiniteTag</strong> em <strong>Painel de Controle → Pagamentos</strong>.
                É o seu usuário no app InfinitePay, sem o símbolo <code>$</code>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {config.configured && !config.hasBaseUrl && (
        <Card className="reveal mb-5 border-yellow-300 bg-yellow-50">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={18} />
            <div>
              <p className="text-[13px] font-semibold text-ink-900">URL pública não configurada</p>
              <p className="mt-1 text-[12px] text-ink-600">
                Sem ela a InfinitePay não consegue avisar quando o cliente paga, e a baixa só acontece se
                você clicar em <em>Verificar</em>. Preencha em <strong>Painel de Controle → Pagamentos</strong>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {config.configured && (
        <div className="reveal mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-proc-y" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">A receber</p>
            <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-yellow-700 tnum">
              {formatMoney(summary.pending)}
            </p>
            <p className="mt-1 text-[10.5px] text-ink-400">{summary.pendingCount} cobrança(s) aberta(s)</p>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Recebido</p>
            <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-emerald-700 tnum">
              {formatMoney(summary.paid)}
            </p>
            <p className="mt-1 text-[10.5px] text-ink-400">{summary.paidCount} pagamento(s)</p>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-proc-c" />
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Conta</p>
            <p className="mt-2 truncate font-mono text-[15px] leading-none font-semibold text-ink-900">
              ${config.handle}
            </p>
            <p className="mt-1.5 text-[10.5px] text-ink-400">
              {config.methods.map((m) => METHOD_LABEL[m] || m).join(" · ")}
            </p>
          </Card>
          <Card className="halftone-light relative overflow-hidden bg-ink-900">
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-400 uppercase">Link da loja</p>
            <p className="mt-2 truncate font-mono text-[12px] text-cyan-300">{config.manualLink}</p>
            <button
              type="button"
              onClick={() => config.manualLink && copy(config.manualLink)}
              className="mt-2 font-mono text-[10px] tracking-wide text-ink-400 uppercase transition hover:text-paper-50"
            >
              copiar link manual
            </button>
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
          placeholder="Buscar descrição ou referência…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="ml-auto font-mono text-[11px] text-ink-400 tnum">{filtered.length} cobranças</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="Nenhuma cobrança"
          hint={
            config.configured
              ? "Crie uma cobrança a partir de um pedido e envie o link ao cliente."
              : "Configure sua InfiniteTag no Painel de Controle."
          }
        />
      ) : (
        <TableWrap className="reveal reveal-1">
          <thead>
            <tr>
              <Th>Cobrança</Th>
              <Th>Forma</Th>
              <Th>Criada em</Th>
              <Th>Status</Th>
              <Th right>Valor</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const id = Number(c.id);
              const busy = busyId === id;
              const status = String(c.status);
              const paidDiff =
                c.paidAmount != null && Math.abs(Number(c.paidAmount) - Number(c.amount)) > 0.05;
              return (
                <Tr key={id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          status === "pago" ? "bg-emerald-50 text-emerald-600" : "bg-proc-c-soft text-proc-c-strong"
                        )}
                      >
                        <Icon name={status === "pago" ? "check" : "wallet"} size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-800">{String(c.description)}</span>
                        <span className="font-mono text-[9.5px] text-ink-400">{String(c.orderNsu)}</span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {c.captureMethod ? (
                      <span className="font-mono text-[11px] text-ink-600 uppercase">
                        {METHOD_LABEL[String(c.captureMethod)] || String(c.captureMethod)}
                        {Number(c.installments || 1) > 1 && ` ${c.installments}x`}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-400">—</span>
                    )}
                  </Td>
                  <Td mono>{fmtDateTime(c.createdAt)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[status] || "neutral"}>{STATUS_LABEL[status] || status}</Badge>
                    {Boolean(c.confirmedBy) && status === "pago" && (
                      <span className="mt-0.5 block font-mono text-[9px] text-ink-400 uppercase">
                        via {String(c.confirmedBy)}
                      </span>
                    )}
                    {paidDiff && (
                      <span className="mt-0.5 block text-[10px] font-medium text-red-600">
                        pago {formatMoney(Number(c.paidAmount))}
                      </span>
                    )}
                  </Td>
                  <Td right mono className="font-semibold">
                    {formatMoney(Number(c.amount || 0))}
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-0.5">
                      {Boolean(c.checkoutUrl) && status !== "cancelado" && (
                        <>
                          <IconButton
                            size="sm"
                            name="copy"
                            label="Copiar link"
                            onClick={() => copy(String(c.checkoutUrl))}
                          />
                          <IconButton
                            size="sm"
                            name="external"
                            label="Abrir checkout"
                            onClick={() => window.open(String(c.checkoutUrl), "_blank", "noopener")}
                          />
                        </>
                      )}
                      {status === "pendente" && (
                        <IconButton
                          size="sm"
                          name="refresh"
                          label="Verificar pagamento"
                          tone="primary"
                          loading={busy}
                          onClick={() => act(id, "check")}
                        />
                      )}
                      {Boolean(c.receiptUrl) && (
                        <IconButton
                          size="sm"
                          name="file"
                          label="Ver comprovante"
                          onClick={() => window.open(String(c.receiptUrl), "_blank", "noopener")}
                        />
                      )}
                      {["pendente", "erro"].includes(status) && (
                        <IconButton
                          size="sm"
                          name="trash"
                          label="Cancelar cobrança"
                          tone="danger"
                          loading={busy}
                          onClick={() => {
                            setCancelTarget(c);
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

      {/* ---------- nova cobrança ---------- */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Nova cobrança"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewModal(false)}>Cancelar</Button>
            <Button loading={creating} icon="check" onClick={createCharge}>Gerar link</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex overflow-hidden rounded-lg border border-paper-200">
            {(["order", "avulso"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 px-3 py-2 text-[12px] font-semibold transition",
                  mode === m ? "bg-ink-900 text-paper-50" : "bg-paper-50 text-ink-600 hover:bg-paper-100"
                )}
              >
                {m === "order" ? "De um pedido" : "Valor avulso"}
              </button>
            ))}
          </div>

          {mode === "order" ? (
            <>
              <Field label="Pedido" required>
                <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {orders.map((o) => {
                    const c = customerById.get(Number(o.customerId));
                    return (
                      <option key={String(o.id)} value={String(o.id)}>
                        {String(o.number)} — {String(c?.tradeName || c?.name || "Consumidor final")} ·{" "}
                        {formatMoney(Number(o.total || 0))}
                        {o.financialStatus === "pago" ? " (já pago)" : ""}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              {selectedOrder?.financialStatus === "pago" && (
                <p className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-[12px] text-ink-700">
                  Este pedido já está quitado — a cobrança será recusada.
                </p>
              )}
            </>
          ) : (
            <>
              <Field label="Valor (R$)" required hint="Aceita 1.234,56">
                <Input mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Descrição">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Sinal do serviço" />
              </Field>
              <Field label="Cliente" hint="Identifica a receita no Financeiro">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Consumidor final (sem cliente)</option>
                  {customers.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.tradeName || c.name)}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <p className="rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 text-[11.5px] text-ink-500">
            O cliente poderá pagar com {config.methods.map((m) => METHOD_LABEL[m] || m).join(" ou ")}. A
            confirmação é verificada na API antes de qualquer baixa.
          </p>
        </div>
      </Modal>

      {/* ---------- link criado ---------- */}
      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Link pronto para enviar"
        footer={<Button icon="check" onClick={() => setCreated(null)}>Fechar</Button>}
      >
        <p className="text-[13px] text-ink-600">
          Envie o link para o cliente. Assim que ele pagar, o sistema confirma na InfinitePay e quita o
          documento sozinho.
        </p>
        <div className="mt-3 rounded-lg border border-paper-200 bg-paper-50 p-3">
          <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">Checkout</p>
          <p className="mt-1 break-all font-mono text-[11.5px] text-proc-c-strong">
            {String(created?.checkoutUrl || "")}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon="copy" onClick={() => copy(String(created?.checkoutUrl || ""))}>
            Copiar link
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="external"
            onClick={() => window.open(String(created?.checkoutUrl || ""), "_blank", "noopener")}
          >
            Abrir
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="whatsapp"
            onClick={() => {
              /* Cliente conhecido → wa.me já com o número dele (a cobrança
                 sabe quem é). Sem cliente → abre em branco, como antes. */
              let d = whatsappNumber(
                created?.customerId
                  ? (customerById.get(Number(created.customerId)) as WhatsAppTarget | undefined)
                  : null
              );
              if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
              const valor = created?.amount
                ? ` de R$ ${Number(created.amount).toFixed(2).replace(".", ",")}`
                : "";
              const msg = `Segue o link para pagamento${valor}: ${created?.checkoutUrl}`;
              window.open(
                d
                  ? `https://wa.me/55${d}?text=${encodeURIComponent(msg)}`
                  : `https://wa.me/?text=${encodeURIComponent(msg)}`,
                "_blank",
                "noopener"
              );
            }}
          >
            WhatsApp
          </Button>
        </div>
      </Modal>

      {/* ---------- cancelamento ---------- */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar cobrança"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button
              variant="danger"
              icon="trash"
              loading={busyId === Number(cancelTarget?.id)}
              onClick={async () => {
                const t = cancelTarget;
                setCancelTarget(null);
                if (t) await act(Number(t.id), "cancel", { reason: cancelReason }, "Cobrança cancelada");
              }}
            >
              Cancelar cobrança
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-ink-600">
          O link deixa de ser válido no sistema. Se o cliente já tiver pago, use <em>Verificar</em> antes.
        </p>
        <Field label="Motivo">
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex.: cliente desistiu" />
        </Field>
      </Modal>
    </div>
  );
}
