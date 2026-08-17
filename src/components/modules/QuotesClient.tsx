"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "@/lib/mutate";
import {
  Badge,
  Button,
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
  TableWrap,
  Td,
  Textarea,
  Th,
  Tr,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { applyDiscount, formatBRL, round2, toNumber, toPositive } from "@/lib/money";

/* ==================================================================
   TIPOS
   ================================================================== */

type Row = Record<string, any>;

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
  /* IE do emitente (v3.23.0) */
  stateRegistration?: string;
};

type Item = {
  description: string;
  productId?: number | null;
  serviceId?: number | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

const STATUSES = ["rascunho", "enviado", "aprovado", "recusado", "expirado"];

/* ==================================================================
   COMPONENTE PRINCIPAL DE ORÇAMENTOS / PROPOSTAS
   ================================================================== */

export function QuotesClient({
  quotes,
  items,
  customers: initialCustomers,
  products,
  services,
  orders,
  company,
}: {
  quotes: Row[];
  items: Row[];
  customers: Row[];
  products: Row[];
  services: Row[];
  orders: Row[];
  company: PosCompany;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [customersList, setCustomersList] = useState<Row[]>(initialCustomers);

  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /* Trava do botão "virar pedido": o índice único no banco já impede a
     duplicata, mas travar aqui evita a ida e volta desnecessária. */
  const [converting, setConverting] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editItems, setEditItems] = useState<Item[]>([]);
  const [viewId, setViewId] = useState<number | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<{ quote: Row; mode: "a4" | "thermal" } | null>(null);

  const view = useMemo(() => quotes.find((q) => Number(q.id) === viewId) || null, [quotes, viewId]);
  const viewItems = useMemo(
    () => (view ? items.filter((i) => Number(i.quoteId) === Number(view.id)) : []),
    [view, items]
  );

  const custName = useCallback(
    (id: unknown) => customersList.find((c) => Number(c.id) === Number(id)) || null,
    [customersList]
  );

  /* Busca inteligente + filtro */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return quotes.filter((quote) => {
      const c = custName(quote.customerId);
      const qItems = items.filter((i) => Number(i.quoteId) === Number(quote.id));
      const matchTerm =
        !term ||
        String(quote.number || "").toLowerCase().includes(term) ||
        (c && String(c.name || "").toLowerCase().includes(term)) ||
        (c && String(c.tradeName || "").toLowerCase().includes(term)) ||
        (c && String(c.document || "").toLowerCase().includes(term)) ||
        qItems.some((i) => String(i.description || "").toLowerCase().includes(term));

      if (!matchTerm) return false;
      return filter === "all" || quote.status === filter;
    });
  }, [quotes, q, filter, custName, items]);

  /* Cálculo de totais com money.ts */
  const totals = useMemo(() => {
    const subtotal = round2(editItems.reduce((s, i) => s + i.total, 0));
    const disc = applyDiscount(subtotal, form.discount, "value");
    const shippingFee = toPositive(form.shippingFee);
    // taxPct: usa o valor digitado pelo usuário (padrão 0 para não surpreender)
    const taxPct = toPositive(form.taxPct, 0);
    const taxes = taxPct > 0 ? round2((subtotal - disc) * (taxPct / 100)) : 0;
    const total = round2(subtotal - disc + shippingFee + taxes);
    return { subtotal, disc, shippingFee, taxes, total };
  }, [editItems, form.discount, form.shippingFee, form.taxPct]);

  function openNew(customerId?: string) {
    setEditId(null);
    setEditItems([{ description: "", quantity: 1, unitPrice: 0, total: 0 }]);
    setForm({
      customerId: customerId || "",
      status: "rascunho",
      validUntil: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      paymentMethod: "PIX",
      channel: "Atendimento",
      sellerName: "OPERADOR",
      discount: "0",
      shippingFee: "0",
      taxPct: "0",
      notes: "Validade da proposta de 10 dias. Pagamento 50% na aprovação e 50% na entrega.",
    });
    setEditorOpen(true);
  }

  /* Abertura automática via ?novo=1 (vinda do CRM/atalhos).
     `startTransition` evita a cascata de render que o React 19 sinaliza
     quando um efeito chama setState de forma síncrona. */
  useEffect(() => {
    if (params.get("novo") !== "1") return;
    const preset = params.get("customerId") || undefined;
    startTransition(() => openNew(preset));
    // abre somente na entrada da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(q: Row) {
    setEditId(Number(q.id));
    setEditItems(
      items
        .filter((i) => Number(i.quoteId) === Number(q.id))
        .map((i) => ({
          description: String(i.description),
          productId: i.productId,
          serviceId: i.serviceId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
        }))
    );
    // Recalcula taxPct a partir dos valores salvos (taxes / (subtotal - discount) * 100)
    const sub = toNumber(q.subtotal, 0);
    const disc = toNumber(q.discount, 0);
    const taxes = toNumber(q.taxes, 0);
    const base = sub - disc;
    const taxPctCalc = base > 0 ? round2((taxes / base) * 100) : 0;

    setForm({
      customerId: q.customerId ? String(q.customerId) : "",
      status: String(q.status),
      validUntil: String(q.validUntil || ""),
      paymentMethod: String(q.paymentMethod || "PIX"),
      channel: String(q.channel || "Atendimento"),
      sellerName: String(q.sellerName || "TIAGO SOUZA"),
      discount: String(q.discount ?? 0),
      shippingFee: String(q.shippingFee ?? 0),
      taxPct: String(taxPctCalc),
      notes: String(q.notes || ""),
    });
    setEditorOpen(true);
  }

  function addItem(kind: "product" | "service" | "free", idOrDesc?: string) {
    if (kind === "product" && idOrDesc) {
      const p = products.find((x) => String(x.id) === idOrDesc);
      if (p)
        setEditItems((arr) => [
          ...arr,
          {
            description: String(p.name),
            productId: Number(p.id),
            quantity: 1,
            unitPrice: Number(p.finalPrice || 0),
            total: Number(p.finalPrice || 0),
          },
        ]);
    } else if (kind === "service" && idOrDesc) {
      const s = services.find((x) => String(x.id) === idOrDesc);
      if (s)
        setEditItems((arr) => [
          ...arr,
          {
            description: String(s.name),
            serviceId: Number(s.id),
            quantity: 1,
            unitPrice: Number(s.baseCost || 0),
            total: Number(s.baseCost || 0),
          },
        ]);
    } else {
      setEditItems((arr) => [...arr, { description: "", quantity: 1, unitPrice: 0, total: 0 }]);
    }
  }

  function patchItem(i: number, patch: Partial<Item>) {
    setEditItems((arr) =>
      arr.map((it, j) => {
        if (j !== i) return it;
        const qty = patch.quantity !== undefined ? toPositive(patch.quantity, 1) : it.quantity;
        const price = patch.unitPrice !== undefined ? toPositive(patch.unitPrice, 0) : it.unitPrice;
        return {
          ...it,
          ...patch,
          quantity: qty,
          unitPrice: price,
          total: round2(qty * price),
        };
      })
    );
  }

  async function save() {
    if (editItems.length === 0) return toast.error("Adicione ao menos um item à proposta");
    setSaving(true);
    try {
      const data = {
        customerId: form.customerId || null,
        status: form.status || "rascunho",
        validUntil: form.validUntil || null,
        paymentMethod: form.paymentMethod || "PIX",
        channel: form.channel || "Atendimento",
        sellerName: form.sellerName || "TIAGO SOUZA",
        subtotal: totals.subtotal,
        discount: totals.disc,
        shippingFee: totals.shippingFee,
        taxes: totals.taxes,
        total: totals.total,
        notes: form.notes || null,
        items: editItems.map((i) => ({ ...i, description: i.description || "Item avulso" })),
      };
      const saved = editId
        ? await mutate("quotes", "update", data, editId)
        : await mutate("quotes", "create", data);

      toast.success("Orçamento salvo com sucesso!", `Total ${formatBRL(totals.total)}`);

      /* Preço fora da tabela não bloqueia — orçamento é negociação —,
         mas o vendedor precisa saber que saiu do preço de catálogo. */
      const warnings: string[] = Array.isArray(saved?.warnings) ? saved.warnings : [];
      if (warnings.length > 0) {
        toast.info(
          warnings.length === 1 ? "Preço fora da tabela" : `${warnings.length} preços fora da tabela`,
          warnings.join(" · ")
        );
      }

      setEditorOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(q: Row, status: string) {
    try {
      await mutate("quotes", "update", { status }, Number(q.id));
      toast.success(`Orçamento marcado como ${status}`);
      router.refresh();
    } catch (e) {
      toast.error("Não foi possível mudar o status", e instanceof Error ? e.message : undefined);
    }
  }

  /* Orçamento aprovado é acordo fechado: o servidor recusa alteração de
     valor. Reabrir devolve para rascunho e registra o valor anterior nas
     observações, para a renegociação ficar rastreável. */
  async function reopenQuote(q: Row) {
    const total = formatBRL(toNumber(q.total, 0));
    if (
      !confirm(
        `Reabrir o orçamento ${q.number} para renegociação?\n\nEle volta para "rascunho" e o valor aprovado (${total}) fica registrado nas observações.`
      )
    ) {
      return;
    }
    try {
      await mutate("quotes", "update", { reopen: true, discount: toNumber(q.discount, 0) }, Number(q.id));
      toast.success("Orçamento reaberto", `${q.number} voltou para rascunho`);
      router.refresh();
    } catch (e) {
      toast.error("Não foi possível reabrir", e instanceof Error ? e.message : undefined);
    }
  }

  async function convertToOrder(q: Row) {
    if (converting !== null) return;
    setConverting(Number(q.id));
    try {
      const res = await fetch("/api/orders/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: Number(q.id) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível converter");

      toast.success(
        json.existing ? `Já existia: ${json.order.number}` : "Pedido & OS Gerado!",
        `Número ${json.order.number}`
      );
      router.refresh();
    } catch (e) {
      toast.error("Erro na conversão", e instanceof Error ? e.message : undefined);
    } finally {
      setConverting(null);
    }
  }

  const hasOrder = (quoteId: number) => orders.some((o) => Number(o.quoteId) === quoteId);
  const counts = STATUSES.map((s) => ({ s, n: quotes.filter((q) => q.status === s).length }));

  const customerOptions = useMemo(
    () =>
      customersList.map((c) => ({
        value: String(c.id),
        label: `${c.name}${c.tradeName ? ` (${c.tradeName})` : ""}`,
        hint: [c.document, c.phone, c.district, c.city].filter(Boolean).join(" · "),
      })),
    [customersList]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Propostas comerciais & Vendas"
        title="Orçamentos"
        icon="quote"
        description="Elabore propostas profissionais com produtos do motor de precificação, imprima propostas e converta orçamentos aprovados em Ordens de Produção."
        actions={
          <Button icon="plus" onClick={() => openNew()}>
            Novo orçamento
          </Button>
        }
      />

      {/* ── BARRA DE FILTROS & BUSCA ── */}
      <div className="reveal mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "focus-ring cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors",
              filter === "all"
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400"
            )}
          >
            Todos · {quotes.length}
          </button>
          {counts.map(({ s, n }) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "focus-ring cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors",
                filter === s
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400"
              )}
            >
              {s} · {n}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Icon name="search" size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proposta, cliente, item..."
            className="h-10 pl-9 text-[13px]"
          />
        </div>
      </div>

      {/* ── TABELA DE ORÇAMENTOS ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="quote"
          title="Nenhum orçamento encontrado"
          hint="Crie uma nova proposta comercial em segundos."
          action={
            <Button icon="plus" onClick={() => openNew()}>
              Criar orçamento
            </Button>
          }
        />
      ) : (
        <TableWrap className="reveal reveal-1">
          <thead>
            <tr>
              <Th>Número</Th>
              <Th>Cliente</Th>
              <Th>Validade</Th>
              <Th right>Total</Th>
              <Th>Status</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => {
              const c = custName(q.customerId);
              return (
                <Tr key={String(q.id)} onClick={() => setViewId(Number(q.id))}>
                  <Td mono className="font-bold text-ink-900">
                    {String(q.number)}
                  </Td>
                  <Td>
                    <p className="font-semibold text-ink-900">
                      {c ? String(c.tradeName || c.name) : <span className="text-ink-400">Consumidor final</span>}
                    </p>
                    <p className="font-mono text-[10.5px] text-ink-400">
                      Criado em {new Date(q.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </Td>
                  <Td mono>
                    {q.validUntil ? new Date(`${q.validUntil}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                  </Td>
                  <Td right mono className="font-bold text-proc-c-strong">
                    {formatBRL(Number(q.total || 0))}
                  </Td>
                  <Td>
                    <StatusBadge value={String(q.status)} />
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="xs"
                        variant="soft"
                        icon="printer"
                        onClick={() => setPrintDoc({ quote: q, mode: "a4" })}
                      >
                        Imprimir
                      </Button>
                      {q.status === "rascunho" && (
                        <IconButton
                          size="sm"
                          name="send"
                          label="Marcar enviado"
                          onClick={() => setStatus(q, "enviado")}
                        />
                      )}
                      {q.status === "enviado" && (
                        <IconButton
                          size="sm"
                          name="circle-check"
                          label="Marcar aprovado"
                          onClick={() => setStatus(q, "aprovado")}
                        />
                      )}
                      {q.status === "aprovado" && !hasOrder(Number(q.id)) && (
                        <button
                          onClick={() => convertToOrder(q)}
                          disabled={converting !== null}
                          className="focus-ring flex h-7 cursor-pointer items-center gap-1 rounded-md bg-proc-c-strong px-2.5 font-mono text-[10px] font-bold text-white uppercase transition-colors hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Icon name="arrow-right" size={11} />{" "}
                          {converting === Number(q.id) ? "convertendo…" : "virar pedido"}
                        </button>
                      )}
                      {q.status === "aprovado" && !hasOrder(Number(q.id)) && (
                        <IconButton
                          size="sm"
                          name="refresh"
                          label="Reabrir para renegociação"
                          onClick={() => reopenQuote(q)}
                        />
                      )}
                      {hasOrder(Number(q.id)) && <Badge tone="green">pedido gerado</Badge>}
                      <IconButton
                        size="sm"
                        name="pencil"
                        label="Editar"
                        onClick={() => openEdit(q)}
                      />
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {/* ── EDITOR / FORMULÁRIO DO ORÇAMENTO ── */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editId ? "Editar Orçamento" : "Novo Orçamento Comercial"}
        subtitle="Adicione itens do catálogo ou serviços do motor de precificação."
        width="max-w-4xl"
        footer={
          <>
            <div className="mr-auto text-right">
              <p className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">
                Total da proposta
              </p>
              <p className="font-mono text-[22px] leading-none font-bold text-proc-c-strong tnum">
                {formatBRL(totals.total)}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={save} icon="circle-check">
              Salvar Orçamento
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
                    value={form.customerId || ""}
                    onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
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

            <Field label="Validade da Proposta">
              <Input
                mono
                type="date"
                value={form.validUntil || ""}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Field>

            <Field label="Condição de Pagamento">
              <Select
                value={form.paymentMethod || "PIX"}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                {["PIX", "Dinheiro", "Débito", "Crédito", "Boleto", "50% entrada + 50% na entrega"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Field label="Canal Comercial">
              <Select
                value={form.channel || "Atendimento"}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
              >
                {["Atendimento", "Balcão", "Instagram", "Site", "Indicação"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>

            <Field label="Vendedor / Atendente">
              <Input
                value={form.sellerName || "TIAGO SOUZA"}
                onChange={(e) => setForm((f) => ({ ...f, sellerName: e.target.value }))}
                placeholder="Ex.: TIAGO SOUZA"
              />
            </Field>

            <Field label="Status Inicial">
              <Select
                value={form.status || "rascunho"}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* ITENS DA PROPOSTA */}
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase">
                Itens da Proposta
              </h4>
              <div className="flex flex-wrap gap-1.5">
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addItem("product", e.target.value);
                  }}
                  className="h-8 w-auto text-[12px]"
                >
                  <option value="">＋ Produto do catálogo…</option>
                  {products
                    .filter((p) => p.active !== false)
                    .map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.name)} — {formatBRL(Number(p.finalPrice || 0))}
                      </option>
                    ))}
                </Select>

                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addItem("service", e.target.value);
                  }}
                  className="h-8 w-auto text-[12px]"
                >
                  <option value="">＋ Serviço…</option>
                  {services.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.name)} — {formatBRL(Number(s.baseCost || 0))}
                    </option>
                  ))}
                </Select>

                <Button size="sm" variant="outline" icon="plus" onClick={() => addItem("free")}>
                  Item livre
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-paper-200 space-y-1 bg-paper-100 p-1.5">
              {editItems.length === 0 && (
                <p className="bg-white p-6 text-center text-[12px] text-ink-400">
                  Adicione produtos, serviços ou itens avulsos.
                </p>
              )}
              {editItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-white p-2 border border-paper-200">
                  <Input
                    value={it.description}
                    onChange={(e) => patchItem(i, { description: e.target.value })}
                    placeholder="Descrição do produto ou serviço"
                    className="flex-1 text-[13px]"
                  />
                  <Input
                    mono
                    value={String(it.quantity)}
                    onChange={(e) => patchItem(i, { quantity: Number(e.target.value) || 0 })}
                    className="w-20 text-right text-[12.5px]"
                    placeholder="qtd"
                  />
                  <Input
                    mono
                    value={String(it.unitPrice)}
                    onChange={(e) => patchItem(i, { unitPrice: Number(e.target.value) || 0 })}
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
                value={form.discount || "0"}
                onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              />
            </Field>

            <Field label="Frete / Entrega (R$)">
              <Input
                mono
                value={form.shippingFee || "0"}
                onChange={(e) => setForm((f) => ({ ...f, shippingFee: e.target.value }))}
              />
            </Field>

            <Field label="Impostos (%)">
              <Input
                mono
                value={form.taxPct || "0"}
                onChange={(e) => setForm((f) => ({ ...f, taxPct: e.target.value }))}
                placeholder="0"
              />
            </Field>

            <div className="flex items-end justify-end gap-4 pb-1">
              <span className="text-right text-[11px] text-ink-500">
                Subtotal
                <span className="block font-mono text-[13px] font-semibold text-ink-800 tnum">
                  {formatBRL(totals.subtotal)}
                </span>
              </span>
              {totals.taxes > 0 && (
                <span className="text-right text-[11px] text-ink-500">
                  Impostos
                  <span className="block font-mono text-[13px] font-semibold text-amber-700 tnum">
                    +{formatBRL(totals.taxes)}
                  </span>
                </span>
              )}
              <span className="text-right text-[11px] text-ink-500">
                Total Final
                <span className="block font-mono text-[16px] font-bold text-proc-c-strong tnum">
                  {formatBRL(totals.total)}
                </span>
              </span>
            </div>
          </div>

          <Field label="Observações e Condições">
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Prazo de produção, condições de pagamento, validade, instruções da arte..."
            />
          </Field>
        </div>
      </Modal>

      {/* ── CADASTRO RÁPIDO DE CLIENTE (F8) ── */}
      <QuickCustomerModal
        key={newCustomerOpen ? "customer-open" : "customer-closed"}
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={(newCust) => {
          setCustomersList((prev) => [newCust, ...prev]);
          setForm((f) => ({ ...f, customerId: String(newCust.id) }));
          toast.success("Cliente cadastrado!", newCust.name);
        }}
      />

      {/* ── DRAWER / MODAL DE VISUALIZAÇÃO & IMPRESSÃO ── */}
      <Drawer
        open={!!view}
        onClose={() => setViewId(null)}
        title={view ? String(view.number) : ""}
        subtitle={
          view && (
            <span className="flex items-center gap-2">
              <StatusBadge value={String(view.status)} />
              <span className="font-bold text-ink-900">
                {custName(view.customerId)
                  ? String(custName(view.customerId)!.tradeName || custName(view.customerId)!.name)
                  : "Consumidor final"}
              </span>
            </span>
          )
        }
        footer={
          view && (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2">
                {view.status === "rascunho" && (
                  <Button
                    variant="outline"
                    icon="send"
                    onClick={() => {
                      setStatus(view, "enviado");
                      setViewId(null);
                    }}
                  >
                    Marcar Enviado
                  </Button>
                )}
                {view.status === "enviado" && (
                  <Button
                    variant="outline"
                    icon="circle-check"
                    onClick={() => {
                      setStatus(view, "aprovado");
                      setViewId(null);
                    }}
                  >
                    Aprovar
                  </Button>
                )}
                {view.status === "aprovado" && !hasOrder(Number(view.id)) && (
                  <>
                    <Button
                      variant="outline"
                      icon="refresh"
                      onClick={() => {
                        reopenQuote(view);
                        setViewId(null);
                      }}
                    >
                      Reabrir
                    </Button>
                    <Button
                      icon="arrow-right"
                      onClick={() => {
                        convertToOrder(view);
                        setViewId(null);
                      }}
                    >
                      Converter em Pedido
                    </Button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ink"
                  icon="printer"
                  onClick={() => {
                    setPrintDoc({ quote: view, mode: "a4" });
                  }}
                >
                  Imprimir Proposta A4
                </Button>
              </div>
            </div>
          )
        }
      >
        {view && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { k: "Subtotal", v: formatBRL(Number(view.subtotal || 0)) },
                { k: "Desconto", v: `− ${formatBRL(Number(view.discount || 0))}` },
                { k: "Frete", v: `+ ${formatBRL(Number(view.shippingFee || 0))}` },
              ].map((x) => (
                <div key={x.k} className="rounded-lg border border-paper-200 bg-white px-3 py-2.5 text-center">
                  <p className="font-mono text-[9px] tracking-wider text-ink-400 uppercase">{x.k}</p>
                  <p className="mt-0.5 font-mono text-[13px] font-semibold text-ink-800 tnum">{x.v}</p>
                </div>
              ))}
            </div>

            <div className="halftone-light rounded-xl bg-ink-900 px-5 py-4 text-right">
              <p className="font-mono text-[10px] tracking-[0.18em] text-ink-400 uppercase">
                Total da proposta
              </p>
              <p className="font-mono text-[28px] leading-tight font-bold text-cyan-300 tnum">
                {formatBRL(Number(view.total || 0))}
              </p>
              <p className="font-mono text-[10.5px] text-ink-400">
                {String(view.paymentMethod || "pagamento a combinar")}
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                Itens da Proposta
              </h4>
              <div className="overflow-hidden rounded-lg border border-paper-200">
                {viewItems.map((i) => (
                  <div
                    key={String(i.id)}
                    className="flex items-center justify-between gap-3 border-b border-paper-200/70 bg-white px-3.5 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink-800">{String(i.description)}</p>
                      <p className="font-mono text-[10.5px] text-ink-400 tnum">
                        {Number(i.quantity)} × {formatBRL(Number(i.unitPrice))}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[13px] font-bold text-ink-900 tnum">
                      {formatBRL(Number(i.total))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {view.notes && (
              <div className="rounded-lg bg-proc-y-soft px-4 py-3">
                <p className="font-mono text-[9.5px] font-semibold tracking-wider text-yellow-700 uppercase">
                  Observações
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">{String(view.notes)}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── MODAL IMPRESSÃO DA PROPOSTA COMERCIAL A4 ── */}
      <Drawer
        open={!!printDoc}
        onClose={() => setPrintDoc(null)}
        title="Impressão da Proposta Comercial"
        subtitle="Documento A4 para apresentação ao cliente"
        width="max-w-4xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="ink"
              icon="printer"
              onClick={() => {
                window.print();
              }}
            >
              Imprimir A4
            </Button>
            <Button variant="ghost" onClick={() => setPrintDoc(null)}>
              Fechar
            </Button>
          </div>
        }
      >
        {printDoc && (
          <div className="bg-paper-100 p-4 rounded-xl border border-paper-300">
            <CommercialProposalA4
              quote={printDoc.quote}
              quoteItems={items.filter((i) => Number(i.quoteId) === Number(printDoc.quote.id))}
              customer={custName(printDoc.quote.customerId)}
              company={company}
            />
          </div>
        )}
      </Drawer>

      {/* ÁREA ISOLADA DE IMPRESSÃO A4 PROPOSTA COMERCIAL */}
      {printDoc && (
        <div id="quote-print-a4" className="hidden">
          <CommercialProposalA4
            quote={printDoc.quote}
            quoteItems={items.filter((i) => Number(i.quoteId) === Number(printDoc.quote.id))}
            customer={custName(printDoc.quote.customerId)}
            company={company}
            isPrint
          />
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   DOCUMENTO A4 DE PROPOSTA COMERCIAL / ORÇAMENTO PROFISSIONAL
   ================================================================== */

function CommercialProposalA4({
  quote,
  quoteItems: qItems,
  customer,
  company,
  isPrint,
}: {
  quote: Row;
  quoteItems: Row[];
  customer: Row | null;
  company: PosCompany;
  isPrint?: boolean;
}) {
  /* Sem `Date.now()` no render: ler o relógio durante a renderização é
     impuro (o React 19 acusa) e ainda daria datas diferentes entre
     servidor e cliente na proposta impressa. */
  const createdAtFormatted = quote.createdAt
    ? new Date(quote.createdAt).toLocaleDateString("pt-BR")
    : "—";
  const subtotal = toNumber(quote.subtotal, 0);
  const discount = toNumber(quote.discount, 0);
  const shippingFee = toNumber(quote.shippingFee, 0);
  const total = toNumber(quote.total, 0);

  return (
    <div
      className={cn(
        "font-sans text-ink-900 bg-white text-[12px] leading-snug select-text",
        isPrint ? "w-full p-8" : "p-8 max-w-[800px] mx-auto shadow-sm rounded border border-paper-300"
      )}
      style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* ── CABEÇALHO DA EMPRESA ── */}
      <div className="flex items-start justify-between border-b border-paper-300 pb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink-950 tracking-tight leading-none">
            {company.name || "PrintFlow Gráfica Criativa"}
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

      {/* ── BANNERS / DETALHES DO ORÇAMENTO ── */}
      <div className="mt-4 flex items-center justify-between border-l-4 border-proc-c bg-proc-c-soft/40 px-4 py-3 rounded-r-lg">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-cyan-800 uppercase">
            PROPOSTA COMERCIAL / ORÇAMENTO
          </p>
          <h2 className="display-expanded text-[24px] font-extrabold text-ink-950 leading-none mt-0.5">
            {quote.number}
          </h2>
        </div>

        <div className="text-right">
          <p className="font-mono text-[10px] text-ink-500 uppercase">Emissão</p>
          <p className="font-mono text-[15px] font-bold text-ink-900">{createdAtFormatted}</p>
          <span className="mt-1 inline-block rounded bg-proc-c px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
            VÁLIDO ATÉ {quote.validUntil ? new Date(`${quote.validUntil}T12:00:00`).toLocaleDateString("pt-BR") : "A COMBINAR"}
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

        {/* PJ: mesmos dados fiscais que a OS já imprime, para os dois
            documentos não saírem divergentes da mesma gráfica. */}
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

        {(customer?.street || customer?.city) && (
          <div className="mt-2 text-[11.5px]">
            <span className="block font-mono text-[9px] text-ink-400 uppercase">ENDEREÇO</span>
            <span>
              {[
                customer?.street,
                customer?.number,
                customer?.complement,
                customer?.district,
                customer?.city,
                customer?.state,
                customer?.cep ? `CEP ${customer.cep}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* ── CONDIÇÕES DA PROPOSTA ── */}
      <div className="mt-5">
        <h3 className="border-b border-proc-c font-mono text-[12px] font-bold text-ink-900 uppercase pb-1 mb-2">
          Condições comerciais
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[11.5px]">
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">CANAL</span>
            <span className="font-medium">{quote.channel || "Atendimento"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">PAGAMENTO</span>
            <span className="font-medium">{quote.paymentMethod || "A combinar"}</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">VALIDADE</span>
            <span className="font-bold text-cyan-800">
              {quote.validUntil ? new Date(`${quote.validUntil}T12:00:00`).toLocaleDateString("pt-BR") : "10 dias"}
            </span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-ink-400 uppercase">VENDEDOR</span>
            <span>{quote.sellerName || "TIAGO SOUZA"}</span>
          </div>
        </div>
      </div>

      {/* ── TABELA DE ITENS ── */}
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
            {qItems.map((i: Row, idx: number) => (
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

      {/* ── OBSERVAÇÕES & TOTAIS ── */}
      <div className="mt-5 grid grid-cols-12 gap-4">
        <div className="col-span-7">
          <h4 className="border-b border-proc-c font-mono text-[11px] font-bold text-ink-900 uppercase pb-0.5 mb-1.5">
            Observações / Condições do Serviço
          </h4>
          <p className="text-[11px] text-ink-700 leading-relaxed italic">
            {quote.notes || "Garantia de qualidade da impressão. Cores sujeitas a variação de até 10% referente ao monitor."}
          </p>
        </div>

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
            <span>Total Proposta</span>
            <span className="text-[17px]">{formatBRL(total)}</span>
          </div>
        </div>
      </div>

      {/* ── APROVAÇÃO DO CLIENTE ── */}
      <div className="mt-12 pt-4 grid grid-cols-2 gap-12 text-center text-[10.5px] text-ink-500">
        <div>
          <div className="border-t border-ink-400 mb-1" />
          <p>{company.name}</p>
        </div>
        <div>
          <div className="border-t border-ink-400 mb-1" />
          <p>De acordo do Cliente / Assinatura</p>
        </div>
      </div>

      {/* RODAPÉ */}
      <div className="mt-8 border-t border-paper-200 pt-3 text-center font-mono text-[9.5px] text-ink-400">
        {company.name} • Proposta Comercial válida por {quote.validUntil || "10 dias"}.
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

  /* O reset dos campos é feito pelo `key` no componente pai: remontar é
     mais barato (e mais correto no React 19) que zerar nove estados
     dentro de um efeito. */

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
        whatsapp: null,
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
