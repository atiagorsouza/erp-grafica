"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { formatMoney } from "@/lib/pricing";
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
  StatusBadge,
  TableWrap,
  Td,
  Th,
  Tr,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { PeriodPicker } from "@/components/modules/PeriodPicker";
import { baixarCsv, tabelaParaCsv } from "@/lib/csv";

type Row = Record<string, unknown>;

type Summary = {
  received: number;
  toReceive: number;
  overdueReceivable: number;
  expensesPaid: number;
  expensesOpen: number;
  overduePayable: number;
  balance: number;
  result: number;
  lateCount: number;
};

const CATEGORY_OPTIONS = [
  "venda",
  "pedido",
  "servico",
  "compra",
  "insumo",
  "taxa_cartao",
  "taxa_infinitepay",
  "frete",
  "energia",
  "aluguel",
  "salario",
  "imposto",
  "sangria",
  "suprimento",
  "geral",
];

const CATEGORY_LABELS: Record<string, string> = {
  venda: "Venda PDV",
  pedido: "Pedido / OS",
  servico: "Serviço",
  compra: "Compra de insumo",
  insumo: "Insumo",
  taxa_cartao: "Taxa de cartão",
  taxa_infinitepay: "Tarifa InfinitePay",
  frete: "Frete / etiqueta",
  estorno: "Estorno",
  estorno_taxa: "Estorno de taxa",
  estorno_pedido: "Estorno de pedido",
  sangria: "Sangria de caixa",
  suprimento: "Suprimento de caixa",
  quebra_caixa: "Quebra de caixa",
  sobra_caixa: "Sobra de caixa",
  energia: "Energia",
  aluguel: "Aluguel",
  salario: "Salário",
  imposto: "Imposto",
  geral: "Geral",
};

const label = (c: unknown) => CATEGORY_LABELS[String(c || "geral")] || String(c || "geral").replace(/_/g, " ");
const fmtDate = (v: unknown) => {
  const t = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "—";
  const [y, m, d] = t.split("-");
  return `${d}/${m}/${y}`;
};

const PAGE_SIZE = 40;

export function FinanceClient({
  transactions,
  summary,
  upcoming,
  period,
  periodLabel,
  includeArchived,
}: {
  transactions: Row[];
  summary: Summary;
  upcoming: Row[];
  period: { from: string; to: string };
  periodLabel: string;
  includeArchived: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<null | { edit?: Row }>(null);
  const [confirmArchive, setConfirmArchive] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      const mt = typeFilter === "all" || t.type === typeFilter;
      const ms = statusFilter === "all" || t.status === statusFilter;
      const mq =
        !term ||
        String(t.description || "").toLowerCase().includes(term) ||
        label(t.category).toLowerCase().includes(term);
      return mt && ms && mq;
    });
  }, [transactions, typeFilter, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /**
   * Exporta CSV do que está na tela (v3.72.1): os filtros de tipo,
   * status e busca são aplicados em `filtered` — o CSV respeita o que
   * o operador está vendo, e traz TODOS os lançamentos do filtro, não
   * só a página atual. Despesas saem com sinal negativo para o total
   * fechar no Excel.
   */
  function exportCsv() {
    const STATUS: Record<string, string> = {
      pendente: "Pendente",
      pago: "Pago",
      atrasado: "Atrasado",
    };
    const TIPO: Record<string, string> = { receita: "Receita", despesa: "Despesa" };

    const rows = filtered
      .slice()
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))
      .map((t) => [
        fmtDate(t.dueDate),
        fmtDate(t.paidDate),
        String(t.description || ""),
        TIPO[String(t.type)] || String(t.type || ""),
        label(t.category),
        STATUS[String(t.status)] || String(t.status || ""),
        String(t.method || ""),
        ((t.type === "receita" ? 1 : -1) * Number(t.amount || 0)).toFixed(2),
        t.automatic ? "automático" : "manual",
        t.archivedAt ? "arquivado" : "",
        String(t.notes || ""),
      ]);

    baixarCsv(
      `financeiro-${period.from}-a-${period.to}`,
      tabelaParaCsv(
        [
          "Vencimento",
          "Pagamento",
          "Descrição",
          "Tipo",
          "Categoria",
          "Status",
          "Método",
          "Valor",
          "Origem",
          "Arquivado",
          "Observações",
        ],
        rows
      )
    );
  }

  /** Traduz o erro da API. O handler antigo devolvia o SQL inteiro. */
  function fail(e: unknown, fallback: string) {
    const msg = e instanceof Error ? e.message : "";
    toast.error(fallback, msg && msg.length < 200 ? msg : undefined);
  }

  async function save(id?: number) {
    if (!String(form.description || "").trim()) return toast.error("Informe a descrição");
    setSaving(true);
    try {
      const data = {
        type: form.type || "receita",
        category: form.category || "geral",
        description: form.description,
        /* o valor vai como texto: o servidor aceita "1.234,56" e valida */
        amount: form.amount ?? "0",
        dueDate: form.dueDate || null,
        paidDate: form.paidDate || null,
        status: form.status || "pendente",
        method: form.method || null,
        notes: form.notes || null,
      };
      if (id) await mutate("transactions", "update", data, id);
      else await mutate("transactions", "create", data);
      setModal(null);
      toast.success(id ? "Lançamento atualizado" : "Lançamento criado");
      refresh();
    } catch (e) {
      fail(e, "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  async function settle(t: Row) {
    const id = Number(t.id);
    setBusyId(id);
    try {
      await mutate("transactions", "settle", undefined, id);
      toast.success("Baixa registrada");
      refresh();
    } catch (e) {
      fail(e, "Não foi possível dar baixa");
    } finally {
      setBusyId(null);
    }
  }

  async function reopen(t: Row) {
    const id = Number(t.id);
    setBusyId(id);
    try {
      await mutate("transactions", "reopen", undefined, id);
      toast.success("Baixa estornada");
      refresh();
    } catch (e) {
      fail(e, "Não foi possível reabrir");
    } finally {
      setBusyId(null);
    }
  }

  async function archive(t: Row) {
    const id = Number(t.id);
    setBusyId(id);
    try {
      await mutate("transactions", "delete", undefined, id);
      toast.success("Lançamento arquivado");
      setConfirmArchive(null);
      refresh();
    } catch (e) {
      fail(e, "Não foi possível arquivar");
      setConfirmArchive(null);
    } finally {
      setBusyId(null);
    }
  }

  const openNew = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ type: "receita", status: "pendente", method: "PIX", category: "geral", dueDate: today });
    setModal({});
  };

  return (
    <div>
      <PageHeader
        eyebrow="Contas & fluxo de caixa"
        title="Financeiro"
        icon="wallet"
        description="Receitas e despesas com baixa rápida. PDV, pedidos, compras e movimentos de caixa lançam aqui automaticamente."
        actions={
          <>
            <Button variant="ghost" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>
              CSV
            </Button>
            <Button icon="plus" onClick={openNew}>Lançamento</Button>
          </>
        }
      />

      <PeriodPicker
        period={period}
        label={periodLabel}
        extra={
          <a
            href={`/financeiro?from=${period.from}&to=${period.to}${includeArchived ? "" : "&archived=1"}`}
            className={cn(
              "rounded-md border px-2.5 py-1.5 font-mono text-[10.5px] font-medium uppercase transition",
              includeArchived
                ? "border-ink-900 bg-ink-900 text-paper-50"
                : "border-paper-200 bg-paper-50 text-ink-600 hover:border-ink-300 hover:text-ink-900"
            )}
          >
            Arquivados
          </a>
        }
      />

      {/* painel */}
      <div className="reveal mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Recebido</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-emerald-700 tnum">
            {formatMoney(summary.received)}
          </p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-proc-y" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">A receber</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-yellow-700 tnum">
            {formatMoney(summary.toReceive)}
          </p>
          {summary.overdueReceivable > 0 && (
            <p className="mt-1 text-[10.5px] text-red-600">{formatMoney(summary.overdueReceivable)} vencido</p>
          )}
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-proc-m" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Despesas</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-proc-m tnum">
            {formatMoney(summary.expensesPaid + summary.expensesOpen)}
          </p>
          <p className="mt-1 text-[10.5px] text-ink-400">{formatMoney(summary.expensesOpen)} em aberto</p>
        </Card>
        <Card className="halftone-light relative overflow-hidden bg-ink-900">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-400 uppercase">Saldo em caixa</p>
          <p
            className={cn(
              "mt-2 font-mono text-[22px] leading-none font-semibold tnum",
              summary.balance >= 0 ? "text-cyan-300" : "text-red-400"
            )}
          >
            {formatMoney(summary.balance)}
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink-400">
            resultado {formatMoney(summary.result)}
            {summary.lateCount > 0 && <span className="text-red-400"> · {summary.lateCount} atrasado(s)</span>}
          </p>
        </Card>
      </div>

      {/* agenda de vencimentos */}
      {upcoming.length > 0 && (
        <Card className="reveal mb-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="clock" size={14} />
            <h3 className="display-expanded text-[13px] font-bold text-ink-900">Vence nos próximos 30 dias</h3>
            <span className="ml-auto font-mono text-[10.5px] text-ink-400 tnum">{upcoming.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 8).map((t) => (
              <span
                key={String(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px]",
                  t.type === "receita"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-paper-200 bg-paper-50 text-ink-700"
                )}
              >
                <span className="font-mono text-[10px] text-ink-400">{fmtDate(t.dueDate)}</span>
                <span className="max-w-[180px] truncate font-medium">{String(t.description)}</span>
                <span className="font-mono font-semibold tnum">{formatMoney(Number(t.amount || 0))}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="reveal mb-3 flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-auto">
          <option value="all">Receitas + Despesas</option>
          <option value="receita">Só receitas</option>
          <option value="despesa">Só despesas</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-auto">
          <option value="all">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="pago">Pagos</option>
          <option value="atrasado">Atrasados</option>
        </Select>
        <Input
          className="w-auto min-w-[180px] flex-1 sm:max-w-[260px]"
          placeholder="Buscar descrição…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <span className="ml-auto font-mono text-[11px] text-ink-400 tnum">{filtered.length} lançamentos</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="Nenhum lançamento no período"
          hint="Ajuste o período acima ou registre uma receita/despesa."
        />
      ) : (
        <>
          {/* ---------- mobile: cartões ---------- */}
          <div className="reveal reveal-1 space-y-2 sm:hidden">
            {visible.map((t) => (
              <div
                key={String(t.id)}
                className={cn(
                  "rounded-xl border border-paper-200 bg-paper-50 p-3 shadow-card",
                  t.archivedAt ? "opacity-60" : undefined
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink-800">{String(t.description)}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-400 uppercase">
                      {label(t.category)} · {fmtDate(t.dueDate)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[13px] font-semibold tnum",
                      t.type === "receita" ? "text-emerald-700" : "text-proc-m"
                    )}
                  >
                    {t.type === "receita" ? "+" : "−"} {formatMoney(Number(t.amount || 0))}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge value={String(t.status)} />
                  {Boolean(t.automatic) && <Badge tone="neutral">auto</Badge>}
                  <span className="ml-auto flex gap-0.5">
                    {t.status !== "pago" && !t.archivedAt && (
                      <IconButton size="sm" name="check" label="Dar baixa" loading={busyId === Number(t.id)} onClick={() => settle(t)} />
                    )}
                    {!t.automatic && !t.archivedAt && (
                      <IconButton
                        size="sm"
                        name="pencil"
                        label="Editar"
                        onClick={() => { setForm(toForm(t)); setModal({ edit: t }); }}
                      />
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ---------- desktop: tabela ---------- */}
          <TableWrap className="reveal reveal-1 hidden sm:block">
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Vencimento</Th>
                <Th>Método</Th>
                <Th>Status</Th>
                <Th right>Valor</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const auto = Boolean(t.automatic);
                const archived = Boolean(t.archivedAt);
                const busy = busyId === Number(t.id);
                return (
                  <Tr key={String(t.id)} className={cn(archived ? "opacity-55" : undefined)}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                            t.type === "receita" ? "bg-emerald-50 text-emerald-600" : "bg-proc-m-soft text-proc-m"
                          )}
                        >
                          <Icon name={t.type === "receita" ? "arrow-up-right" : "arrow-right"} size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-800">{String(t.description)}</span>
                          {archived && (
                            <span className="font-mono text-[9.5px] text-ink-400 uppercase">
                              arquivado{t.archiveReason ? ` · ${t.archiveReason}` : ""}
                            </span>
                          )}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <Badge tone="neutral">{label(t.category)}</Badge>
                        {auto && (
                          <span
                            title="Gerado automaticamente pelo sistema"
                            className="font-mono text-[9px] tracking-wide text-ink-400 uppercase"
                          >
                            auto
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td mono>{fmtDate(t.dueDate)}</Td>
                    <Td>
                      <span className="font-mono text-[11px] text-ink-500 uppercase">{String(t.method || "—")}</span>
                    </Td>
                    <Td><StatusBadge value={String(t.status)} /></Td>
                    <Td
                      right
                      mono
                      className={cn("font-semibold", t.type === "receita" ? "text-emerald-700" : "text-proc-m")}
                    >
                      {t.type === "receita" ? "+" : "−"} {formatMoney(Number(t.amount || 0))}
                    </Td>
                    <Td right>
                      <span className="flex justify-end gap-0.5">
                        {archived ? (
                          <IconButton
                            size="sm"
                            name="check"
                            label="Restaurar"
                            loading={busy}
                            onClick={async () => {
                              setBusyId(Number(t.id));
                              try {
                                await mutate("transactions", "restore", undefined, Number(t.id));
                                toast.success("Lançamento restaurado");
                                refresh();
                              } catch (e) {
                                fail(e, "Não foi possível restaurar");
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          />
                        ) : (
                          <>
                            {t.status !== "pago" && (
                              <IconButton size="sm" name="check" label="Dar baixa" loading={busy} onClick={() => settle(t)} />
                            )}
                            {t.status === "pago" && (
                              <IconButton size="sm" name="arrow-right" label="Estornar baixa" loading={busy} onClick={() => reopen(t)} />
                            )}
                            <IconButton
                              size="sm"
                              name="pencil"
                              label={auto ? "Lançamento automático — edite o documento de origem" : "Editar"}
                              disabled={auto}
                              onClick={() => { setForm(toForm(t)); setModal({ edit: t }); }}
                            />
                            <IconButton
                              size="sm"
                              name="trash"
                              label={auto ? "Automático — cancele o documento de origem" : "Arquivar"}
                              tone="danger"
                              disabled={auto}
                              onClick={() => setConfirmArchive(t)}
                            />
                          </>
                        )}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button size="sm" variant="ghost" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                Anterior
              </Button>
              <span className="font-mono text-[11px] text-ink-500 tnum">
                {current} / {pageCount}
              </span>
              <Button size="sm" variant="ghost" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      {/* modal de lançamento */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.edit ? "Editar lançamento" : "Novo lançamento"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button loading={saving} icon="check" onClick={() => save(modal?.edit ? Number(modal.edit.id) : undefined)}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={form.type || "receita"} onChange={set("type")}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={form.category || "geral"} onChange={set("category")}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição" required className="sm:col-span-2">
            <Input value={form.description || ""} onChange={set("description")} />
          </Field>
          <Field label="Valor (R$)" hint="Aceita 1.234,56">
            <Input mono inputMode="decimal" value={form.amount || ""} onChange={set("amount")} placeholder="0,00" />
          </Field>
          <Field label="Vencimento">
            <Input mono type="date" value={form.dueDate || ""} onChange={set("dueDate")} />
          </Field>
          <Field label="Método">
            <Select value={form.method || "PIX"} onChange={set("method")}>
              {["PIX", "Dinheiro", "Débito", "Crédito", "Boleto", "Transferência"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status || "pendente"} onChange={set("status")}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </Select>
          </Field>
          {form.status === "pago" && (
            <Field label="Data do pagamento" className="sm:col-span-2">
              <Input mono type="date" value={form.paidDate || ""} onChange={set("paidDate")} />
            </Field>
          )}
        </div>
      </Modal>

      {/* confirmação de arquivamento — substitui o confirm() nativo */}
      <Modal
        open={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        title="Arquivar lançamento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmArchive(null)}>Cancelar</Button>
            <Button
              variant="danger"
              icon="trash"
              loading={busyId === Number(confirmArchive?.id)}
              onClick={() => confirmArchive && archive(confirmArchive)}
            >
              Arquivar
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-600">
          O lançamento <strong className="text-ink-900">{String(confirmArchive?.description || "")}</strong> sai dos
          totais do período, mas continua no histórico e pode ser restaurado a qualquer momento.
        </p>
      </Modal>
    </div>
  );
}

function toForm(t: Row): Record<string, string> {
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue;
    f[k] = String(v);
  }
  if (f.amount) f.amount = String(Number(f.amount).toFixed(2)).replace(".", ",");
  return f;
}
