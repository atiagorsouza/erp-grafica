"use client";

import { useState } from "react";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function FinanceClient({ transactions }: { transactions: Row[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<null | { edit?: Row }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const received = transactions.filter((t) => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount || 0), 0);
  const toReceive = transactions.filter((t) => t.type === "receita" && t.status !== "pago").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = transactions.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expensesPaid = transactions.filter((t) => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount || 0), 0);
  const balance = received - expensesPaid;
  const late = transactions.filter((t) => t.status === "atrasado").length;

  const filtered = transactions.filter((t) => {
    const mt = typeFilter === "all" || t.type === typeFilter;
    const ms = statusFilter === "all" || t.status === statusFilter;
    return mt && ms;
  });

  async function save(id?: number) {
    if (!form.description?.trim()) return toast.error("Informe a descrição");
    setSaving(true);
    try {
      const data = {
        type: form.type || "receita",
        category: form.category || null,
        description: form.description,
        amount: form.amount || "0",
        dueDate: form.dueDate || null,
        paidDate: form.status === "pago" ? form.paidDate || new Date().toISOString().slice(0, 10) : null,
        status: form.status || "pendente",
        method: form.method || null,
      };
      if (id) await mutate("transactions", "update", data, id);
      else await mutate("transactions", "create", data);
      setModal(null);
      toast.success("Lançamento salvo");
      refresh();
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(t: Row) {
    await mutate("transactions", "update", { status: "pago", paidDate: new Date().toISOString().slice(0, 10) }, Number(t.id));
    toast.success("Baixa registrada");
    refresh();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Contas & fluxo de caixa"
        title="Financeiro"
        icon="wallet"
        description="Receitas e despesas com baixa rápida. Vendas do PDV e pedidos alimentam as receitas; compras, as despesas."
        actions={<Button icon="plus" onClick={() => { setForm({ type: "receita", status: "pendente", method: "PIX", dueDate: new Date().toISOString().slice(0, 10) }); setModal({}); }}>Lançamento</Button>}
      />

      {/* painel */}
      <div className="reveal mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Recebido</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-emerald-700 tnum">{formatMoney(received)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-proc-y" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">A receber</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-yellow-700 tnum">{formatMoney(toReceive)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-proc-m" />
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Despesas</p>
          <p className="mt-2 font-mono text-[22px] leading-none font-semibold text-proc-m tnum">{formatMoney(expenses)}</p>
          <p className="mt-1 text-[10.5px] text-ink-400">{formatMoney(expenses - expensesPaid)} em aberto</p>
        </Card>
        <Card className="halftone-light relative overflow-hidden bg-ink-900">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-400 uppercase">Saldo do período</p>
          <p className={cn("mt-2 font-mono text-[22px] leading-none font-semibold tnum", balance >= 0 ? "text-cyan-300" : "text-red-400")}>{formatMoney(balance)}</p>
          {late > 0 && <p className="mt-1 font-mono text-[10.5px] text-red-400">{late} lançamento(s) atrasado(s)</p>}
        </Card>
      </div>

      <div className="reveal mb-3 flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
          <option value="all">Receitas + Despesas</option>
          <option value="receita">Só receitas</option>
          <option value="despesa">Só despesas</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="pago">Pagos</option>
          <option value="atrasado">Atrasados</option>
        </Select>
        <span className="ml-auto font-mono text-[11px] text-ink-400 tnum">{filtered.length} lançamentos</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="wallet" title="Nenhum lançamento" hint="Registre receitas e despesas para acompanhar o caixa." />
      ) : (
        <TableWrap className="reveal reveal-1">
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
            {filtered.map((t) => (
              <Tr key={String(t.id)}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", t.type === "receita" ? "bg-emerald-50 text-emerald-600" : "bg-proc-m-soft text-proc-m")}>
                      <Icon name={t.type === "receita" ? "arrow-up-right" : "arrow-right"} size={13} />
                    </span>
                    <span className="font-medium text-ink-800">{String(t.description)}</span>
                  </div>
                </Td>
                <Td><Badge tone="neutral">{String(t.category || "geral")}</Badge></Td>
                <Td mono>{t.dueDate ? new Date(`${t.dueDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</Td>
                <Td><span className="font-mono text-[11px] text-ink-500 uppercase">{t.method || "—"}</span></Td>
                <Td><StatusBadge value={String(t.status)} /></Td>
                <Td right mono className={cn("font-semibold", t.type === "receita" ? "text-emerald-700" : "text-proc-m")}>
                  {t.type === "receita" ? "+" : "−"} {formatMoney(Number(t.amount || 0))}
                </Td>
                <Td right>
                  <span className="flex justify-end gap-0.5">
                    {t.status !== "pago" && <IconButton size="sm" name="check" label="Dar baixa" onClick={() => markPaid(t)} />}
                    <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                      const f: Record<string, string> = {};
                      for (const [k, v] of Object.entries(t)) if (v !== null && typeof v !== "object") f[k] = String(v);
                      setForm(f);
                      setModal({ edit: t });
                    }} />
                    <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={async () => { if (confirm("Excluir lançamento?")) { await mutate("transactions", "delete", undefined, Number(t.id)); refresh(); } }} />
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.edit ? "Editar lançamento" : "Novo lançamento"}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => save(modal?.edit ? Number(modal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={form.type || "receita"} onChange={set("type")}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </Select>
          </Field>
          <Field label="Categoria">
            <Input value={form.category || ""} onChange={set("category")} placeholder="Vendas, Insumos, Energia…" />
          </Field>
          <Field label="Descrição" required className="sm:col-span-2"><Input value={form.description || ""} onChange={set("description")} /></Field>
          <Field label="Valor (R$)"><Input mono value={form.amount || ""} onChange={set("amount")} /></Field>
          <Field label="Vencimento"><Input mono type="date" value={form.dueDate || ""} onChange={set("dueDate")} /></Field>
          <Field label="Método">
            <Select value={form.method || "PIX"} onChange={set("method")}>
              {["PIX", "Dinheiro", "Débito", "Crédito", "Boleto", "Transferência"].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status || "pendente"} onChange={set("status")}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
