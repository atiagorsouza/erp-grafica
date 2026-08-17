"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { Button, Field, IconButton, Input, Modal, PageHeader, Select, Textarea, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { formatBRL, toNumber } from "@/lib/money";

type Row = Record<string, any>;

const COLS = [
  { id: "backlog", label: "Backlog", color: "#94a3b8" },
  { id: "producao", label: "Em produção", color: "var(--color-proc-c)" },
  { id: "revisao", label: "Revisão / QC", color: "var(--color-proc-y)" },
  { id: "pronto", label: "Pronto", color: "var(--color-proc-m)" },
  { id: "entregue", label: "Entregue", color: "#10b981" },
  { id: "cancelado", label: "Cancelados", color: "#64748b" },
];

// exportado para que KanbanClient possa ser usado como prop de KanbanBoard
export type KanbanCard = Row;

const PRI_COLOR: Record<string, string> = {
  baixa: "#94a3b8",
  normal: "var(--color-proc-c)",
  alta: "var(--color-proc-y)",
  urgente: "#dc2626",
};

export function KanbanClient({ cards }: { cards: Row[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  /* card sob o cursor: mostra onde a peça vai entrar na fila */
  const [overCard, setOverCard] = useState<number | null>(null);
  const [modal, setModal] = useState<null | { edit?: Row; column?: string }>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Cards de uma coluna, na ordem salva (empate → mais antigo primeiro). */
  const cardsOf = useCallback(
    (col: string) =>
      cards
        .filter((c: Row) => c.column === col)
        .sort(
          (a: Row, b: Row) =>
            toNumber(a.order, 0) - toNumber(b.order, 0) || Number(a.id) - Number(b.id)
        ),
    [cards]
  );

  /** Solta no vazio da coluna: vai para o fim da fila. */
  async function drop(col: string) {
    if (dragId === null) return;
    const card = cards.find((c: Row) => Number(c.id) === dragId);
    if (!card) return;
    if (card.column === col) {
      await reorderInto(col, dragId, null);
      return;
    }
    try {
      await mutate("kanban", "update", { column: col }, dragId);
      toast.success("Card movido", "Pedidos vinculados foram sincronizados automaticamente.");
      refresh();
    } catch (e) {
      toast.error("Não foi possível mover", e instanceof Error ? e.message : undefined);
    } finally {
      setDragId(null);
      setOverCol(null);
    }
  }

  /**
   * Reordena a coluna colocando `id` antes de `beforeId` (ou no fim
   * quando `beforeId` é nulo).
   *
   * A fila de produção não tinha como ser priorizada: o campo `order`
   * existia no banco e a API também, mas a tela nunca os usava — todos
   * os cards ficavam com ordem 0. `allowMove` avisa o servidor quando o
   * card vem de outra coluna, para que ele sincronize o Pedido.
   */
  async function reorderInto(col: string, id: number, beforeId: number | null) {
    const atual = cardsOf(col).map((c) => Number(c.id));
    const veioDeFora = !atual.includes(id);
    const semEle = atual.filter((x: number) => x !== id);
    const alvo = beforeId !== null ? semEle.indexOf(beforeId) : -1;
    const ordem =
      alvo >= 0
        ? [...semEle.slice(0, alvo), id, ...semEle.slice(alvo)]
        : [...semEle, id];

    /* nada mudou: evita ida ao servidor a cada clique sem arrasto */
    if (!veioDeFora && ordem.join(",") === atual.join(",")) {
      setDragId(null);
      setOverCol(null);
      return;
    }

    try {
      await mutate("kanban", "reorder", undefined, undefined, {
        column: col,
        ids: ordem,
        allowMove: veioDeFora,
      });
      toast.success(
        veioDeFora ? "Card movido" : "Ordem atualizada",
        veioDeFora ? "Pedidos vinculados foram sincronizados." : undefined
      );
      refresh();
    } catch (e) {
      toast.error("Não foi possível reordenar", e instanceof Error ? e.message : undefined);
    } finally {
      setDragId(null);
      setOverCol(null);
    }
  }

  async function save() {
    if (!form.title?.trim()) return toast.error("Informe o título do card");
    setSaving(true);
    try {
      const data = {
        title: form.title,
        description: form.description || null,
        column: form.column || "backlog",
        customerName: form.customerName || null,
        customerId: form.customerId ? Number(form.customerId) : undefined,
        orderId: form.orderId ? Number(form.orderId) : undefined,
        quoteId: form.quoteId ? Number(form.quoteId) : undefined,
        productId: form.productId ? Number(form.productId) : undefined,
        priority: form.priority || "normal",
        dueDate: form.dueDate || null,
        estimatedValue: form.estimatedValue ? toNumber(form.estimatedValue, 0) : null,
      };
      if (modal?.edit) await mutate("kanban", "update", data, Number(modal.edit.id));
      else await mutate("kanban", "create", data);
      setModal(null);
      toast.success("Card salvo");
      refresh();
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(c: Row) {
    setDeleting(true);
    try {
      await mutate("kanban", "delete", undefined, Number(c.id));
      setDeleteConfirm(null);
      toast.success("Card removido");
      refresh();
    } catch (e) {
      toast.error("Erro ao excluir", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Fluxo visual da produção"
        title="Kanban de Produção"
        icon="kanban"
        description="Arraste os cards entre as etapas — do backlog à entrega. Prioridades ficam visíveis à distância."
        actions={
          <Button icon="plus" onClick={() => { setForm({ column: "backlog", priority: "normal" }); setModal({ column: "backlog" }); }}>
            Novo card
          </Button>
        }
      />

      <div className="reveal grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLS.map((col) => {
          const colCards = cardsOf(col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.id);
              }}
              onDragLeave={() => {
                setOverCol((v) => (v === col.id ? null : v));
                setOverCard(null);
              }}
              onDrop={() => drop(col.id)}
              className={cn(
                "flex min-h-[420px] flex-col rounded-xl border bg-paper-200/40 p-2.5 transition-all duration-150",
                overCol === col.id ? "border-proc-c bg-proc-c-soft/50 ring-2 ring-proc-c/40" : "border-paper-200"
              )}
            >
              <div className="mb-2.5 flex items-center justify-between px-1.5">
                <span className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: col.color }} />
                  {col.label}
                </span>
                <span className="rounded-md bg-paper-50 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-500 shadow-card tnum">{colCards.length}</span>
              </div>
              <div className="flex-1 space-y-2">
                {colCards.map((c) => (
                  <div
                    key={String(c.id)}
                    draggable
                    onDragStart={() => setDragId(Number(c.id))}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                      setOverCard(null);
                    }}
                    /* Soltar SOBRE um card insere antes dele — é o que
                       permite priorizar a fila, não só trocar de etapa. */
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOverCol(col.id);
                      if (dragId !== null && dragId !== Number(c.id)) setOverCard(Number(c.id));
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      if (dragId === null) return;
                      void reorderInto(col.id, dragId, Number(c.id));
                    }}
                    className={cn(
                      "group cursor-grab rounded-lg border bg-paper-50 p-3 shadow-card transition-all select-none active:cursor-grabbing",
                      overCard === Number(c.id) && dragId !== null
                        ? "border-proc-c border-t-2 border-t-proc-c"
                        : "border-paper-200",
                      dragId === Number(c.id) ? "rotate-2 opacity-50" : "hover:-translate-y-0.5 hover:shadow-pop"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12.5px] leading-snug font-semibold text-ink-900">{String(c.title)}</p>
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: PRI_COLOR[String(c.priority || "normal")] }} title={String(c.priority)} />
                    </div>
                    {c.description && <p className="mt-1 line-clamp-2 text-[11px] text-ink-500">{String(c.description)}</p>}
                    {(c.orderId || c.quoteId) && (
                      <div className="mt-1.5 flex gap-1">
                        {c.orderId && <span className="rounded bg-proc-m-soft px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-proc-m">OS #{c.orderId}</span>}
                        {c.quoteId && <span className="rounded bg-proc-c-soft px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-proc-c-strong">ORC #{c.quoteId}</span>}
                      </div>
                    )}
                        <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-paper-200 pt-2">
                       <div className="min-w-0">
                         <span className="truncate font-mono text-[9.5px] text-ink-400 uppercase">{c.customerName || "interno"}</span>
                         {toNumber(c.estimatedValue, 0) > 0 && (
                           <span className="block font-mono text-[9.5px] font-semibold text-proc-c-strong tnum">
                             {formatBRL(toNumber(c.estimatedValue, 0))}
                           </span>
                         )}
                       </div>
                       <span className="flex items-center gap-1.5">
                         {c.dueDate && (
                           <span className="flex items-center gap-1 font-mono text-[9.5px] text-ink-400 tnum">
                             <Icon name="clock" size={10} />
                             {new Date(`${c.dueDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                           </span>
                         )}
                         <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                           <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                             setForm({
                               title: String(c.title),
                               description: String(c.description || ""),
                               column: String(c.column),
                               customerName: String(c.customerName || ""),
                               customerId: String(c.customerId || ""),
                               orderId: String(c.orderId || ""),
                               quoteId: String(c.quoteId || ""),
                               productId: String(c.productId || ""),
                               priority: String(c.priority || "normal"),
                               dueDate: String(c.dueDate || ""),
                               estimatedValue: String(c.estimatedValue || ""),
                             });
                             setModal({ edit: c });
                           }} />
                           {!c.orderId && (
                             <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={() => setDeleteConfirm(c)} />
                           )}
                         </span>
                       </span>
                     </div>
                  </div>
                ))}
                {col.id !== "cancelado" && (
                  <button
                    onClick={() => { setForm({ column: col.id, priority: "normal" }); setModal({ column: col.id }); }}
                    className="focus-ring flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-paper-300 py-2 text-[11px] font-semibold text-ink-400 transition-colors hover:border-proc-c hover:text-proc-c-strong"
                  >
                    <Icon name="plus" size={12} />
                    Card
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.edit ? "Editar card" : "Novo card de produção"}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={save}>Salvar</Button></>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Título" required className="sm:col-span-2"><Input value={form.title || ""} onChange={set("title")} placeholder="Ex.: 100 cartões Pão Quente" autoFocus /></Field>
          <Field label="Cliente"><Input value={form.customerName || ""} onChange={set("customerName")} placeholder="Nome do cliente" /></Field>
          <Field label="Coluna">
            <Select value={form.column || "backlog"} onChange={set("column")}>
              {COLS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority || "normal"} onChange={set("priority")}>
              {["baixa", "normal", "alta", "urgente"].map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Prazo"><Input mono type="date" value={form.dueDate || ""} onChange={set("dueDate")} /></Field>
          <Field label="Valor estimado (R$)" hint="Opcional — aparece no card">
            <Input mono value={form.estimatedValue || ""} onChange={set("estimatedValue")} placeholder="0,00" />
          </Field>
          <Field label="Descrição" className="sm:col-span-2"><Textarea value={form.description || ""} onChange={set("description")} placeholder="Detalhes do serviço, tipo de acabamento, referências..." /></Field>
        </div>
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir card?"
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="danger" icon="trash" loading={deleting} onClick={() => deleteConfirm && deleteCard(deleteConfirm)}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-700">
          O card <strong>&ldquo;{deleteConfirm?.title}&rdquo;</strong> será removido permanentemente do quadro.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </div>
  );
}
