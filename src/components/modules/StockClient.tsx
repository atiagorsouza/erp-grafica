"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { formatMoney } from "@/lib/pricing";
import {
  Badge,
  Button,
  Combobox,
  EmptyState,
  Field,
  IconButton,
  InkBar,
  Input,
  Modal,
  PageHeader,
  Segmented,
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

 
type Row = Record<string, any>;

export function StockClient({ materials, suppliers, purchases, materialCats, movements }: {
  materials: Row[];
  suppliers: Row[];
  purchases: Row[];
  materialCats: Row[];
  movements: Row[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [tab, setTab] = useState<"materiais" | "movimentos" | "fornecedores" | "compras">("materiais");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [matModal, setMatModal] = useState<null | { edit?: Row }>(null);
  const [movModal, setMovModal] = useState<null | { material?: Row }>(null);
  const [supModal, setSupModal] = useState<null | { edit?: Row }>(null);
  const [buyModal, setBuyModal] = useState(false);
  const [buyItems, setBuyItems] = useState<{ materialId: string; quantity: string; unitCost: string }[]>([]);
  const [onlyLow, setOnlyLow] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const catName = (id: unknown) => materialCats.find((c) => Number(c.id) === Number(id));

  const lowCount = materials.filter((m) => Number(m.stock) <= Number(m.minStock || 0)).length;
  const shown = materials.filter((m) => !onlyLow || Number(m.stock) <= Number(m.minStock || 0));

  /* ── Agrupamento por categoria (v3.57.0) ──────────────────────
     A lista era plana, com a categoria só numa coluna. Com papelaria,
     gráfica rápida, brindes e 3D no mesmo lugar, isso vira uma
     mistura de papel, copo e filamento em ordem alfabética.

     Agrupado, cada bloco responde a uma pergunta prática: "tenho
     filamento?" é uma olhada, não uma varredura.

     A ordem dos blocos é a de `item_categories.order` — pensada por
     frequência de uso, não alfabética. O que mais sai fica em cima.
     "Sem categoria" vai por último, funcionando como lista de
     pendências: material que aparece ali é material a classificar. */
  const grupos = (() => {
    const porId = new Map<string, { cat: Record<string, unknown> | undefined; itens: typeof shown }>();
    for (const m of shown) {
      const chave = m.categoryId == null ? "" : String(m.categoryId);
      if (!porId.has(chave)) porId.set(chave, { cat: catName(m.categoryId), itens: [] });
      porId.get(chave)!.itens.push(m);
    }
    return [...porId.values()].sort((a, b) => {
      if (!a.cat) return 1;              // sem categoria por último
      if (!b.cat) return -1;
      const oa = Number(a.cat.order ?? 999);
      const ob = Number(b.cat.order ?? 999);
      if (oa !== ob) return oa - ob;
      return String(a.cat.name).localeCompare(String(b.cat.name), "pt-BR");
    });
  })();
  const matName = (id: unknown) => materials.find((m) => Number(m.id) === Number(id))?.name;
  const supName = (id: unknown) => suppliers.find((s) => Number(s.id) === Number(id))?.name;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setSaving(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
      return true;
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const saveMat = (id?: number) =>
    run(async () => {
      const data = {
        name: form.name,
        categoryId: form.categoryId || null,
        unit: form.unit || "unidade",
        unitCost: form.unitCost || "0",
        packName: form.packName || null,
        packQuantity: form.packQuantity || "0",
        packCost: form.packCost || "0",
        supplier: form.supplier || null,
        stock: form.stock ?? "0",
        minStock: form.minStock ?? "0",
        notes: form.notes || null,
      };
      if (id) await mutate("materials", "update", data, id);
      else await mutate("materials", "create", data);
      setMatModal(null);
    }, "Material salvo");

  async function saveMov() {
    const mat = movModal?.material;
    if (!mat) return;
    const qty = Number(form.quantity || 0);
    const kind = form.kind || "entrada";

    /* No ajuste a quantidade é o saldo contado, então zero é um valor
       legítimo (contagem encontrou o material acabado). Entrada e saída
       continuam exigindo quantidade positiva. */
    if (!Number.isFinite(qty) || qty < 0) return toast.error("Quantidade inválida");
    if (kind !== "ajuste" && qty <= 0) return toast.error("Quantidade deve ser maior que zero");

    const atual = Number(mat.stock || 0);
    if (kind === "ajuste" && qty === atual) {
      return toast.info("Saldo já está correto", `O estoque atual já é ${atual} ${String(mat.unit || "")}.`);
    }

    await run(async () => {
      await mutate("stock-movements", "create", {
        kind,
        targetType: "material",
        targetId: Number(mat.id),
        quantity: String(qty),
        unitCost: String(mat.unitCost || 0),
        reason: form.reason || "ajuste",
        notes: form.notes || null,
      });
      setMovModal(null);
    }, kind === "entrada" ? "Entrada registrada" : kind === "saida" ? "Saída registrada" : `Saldo ajustado para ${qty}`);
  }

  const saveSup = (id?: number) =>
    run(async () => {
      const data = {
        name: form.name,
        tradeName: form.tradeName || null,
        document: form.document || null,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        city: form.city || null,
        state: form.state || null,
        paymentTerms: form.paymentTerms || null,
        leadTimeDays: Number(form.leadTimeDays || 0),
        notes: form.notes || null,
        active: form.active !== "false",
      };
      if (id) await mutate("suppliers", "update", data, id);
      else await mutate("suppliers", "create", data);
      setSupModal(null);
    }, "Fornecedor salvo");

  async function saveBuy() {
    const items = buyItems.filter((i) => i.materialId && Number(i.quantity) > 0);
    if (items.length === 0) return toast.error("Adicione itens à compra");
    await run(async () => {
      await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create",
          data: {
            supplierId: form.supplierId || null,
            status: "pedido",
            items: items.map((i) => ({ materialId: Number(i.materialId), quantity: Number(i.quantity), unitCost: Number(i.unitCost || 0), label: matName(i.materialId) })),
            freight: form.freight || "0",
            expectedDate: form.expectedDate || null,
            notes: form.notes || null,
          },
        }),
      });
      setBuyModal(false);
      setBuyItems([]);
    }, "Compra registrada");
  }

  async function receive(p: Row) {
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "receive", purchaseId: Number(p.id) }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error("Erro no recebimento", json.error);
    toast.success("Compra recebida", "Estoque e custo médio atualizados automaticamente.");
    refresh();
  }

  const buyTotal = buyItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitCost || 0), 0);

  /* Prévia do custo por unidade enquanto o usuário digita a embalagem:
     ver "R$ 0,056 por folha" aparecer sozinho é o que ensina a regra. */
  const packQty = Number(form.packQuantity || 0);
  const packCost = Number(form.packCost || 0);
  const packUnitCost = packQty > 0 && packCost > 0 ? packCost / packQty : null;

  return (
    <div>
      <PageHeader
        eyebrow="Suprimentos & reposição"
        title="Estoque & Compras"
        icon="boxes"
        description="Materiais com mínimo de segurança, movimentações auditáveis, fornecedores e compras com recebimento que alimenta o estoque sozinho."
        actions={
          <>
            <Button variant="outline" icon="plus" onClick={() => { setForm({ active: "true", leadTimeDays: "0" }); setSupModal({}); }}>Fornecedor</Button>
            <Button variant="outline" icon="plus" onClick={() => { setForm({}); setBuyItems([{ materialId: "", quantity: "1", unitCost: "" }]); setBuyModal(true); }}>Nova compra</Button>
            <Button icon="plus" onClick={() => { setForm({ unit: "folha" }); setMatModal({}); }}>Material</Button>
          </>
        }
      />

      <div className="reveal mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "materiais", label: "Materiais", count: materials.length },
            { value: "movimentos", label: "Movimentações", count: movements.length },
            { value: "fornecedores", label: "Fornecedores", count: suppliers.length },
            { value: "compras", label: "Compras", count: purchases.length },
          ]}
        />
        {tab === "materiais" && (
          <button onClick={() => setOnlyLow((v) => !v)} className={cn("focus-ring flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors", onlyLow ? "border-red-300 bg-red-50 text-red-700" : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400")}>
            <Icon name="alert" size={12} />
            Críticos · {lowCount}
          </button>
        )}
      </div>

      {/* ── MATERIAIS ── */}
      {tab === "materiais" && (
        shown.length === 0 ? (
          <EmptyState icon="boxes" title="Nenhum material" hint="Cadastre papéis, tintas, etiquetas e insumos com estoque mínimo." />
        ) : (
          <div className="space-y-5">
          {grupos.map((g) => {
            const criticos = g.itens.filter(
              (x) => Number(x.stock) <= Number(x.minStock || 0)
            ).length;
            const cor = g.cat ? String(g.cat.color) : "#94a3b8";
            return (
            <div key={g.cat ? String(g.cat.id) : "sem"} className="reveal reveal-1">
              {/* Cabeçalho do bloco: nome, quantos itens e quantos
                  críticos. O número de críticos ao lado do título
                  evita ter que percorrer o bloco para saber se há
                  algo faltando ali. */}
              <div className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: cor }} />
                <h3 className="text-[13px] font-bold text-ink-900">
                  {g.cat?.icon ? `${String(g.cat.icon)} ` : ""}
                  {g.cat ? String(g.cat.name) : "Sem categoria"}
                </h3>
                <span className="font-mono text-[11px] text-ink-400 tnum">
                  {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
                </span>
                {criticos > 0 && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-700 tnum">
                    {criticos} em falta
                  </span>
                )}
                {!g.cat && (
                  <span className="text-[11px] text-ink-400">
                    — abra o material e escolha uma categoria
                  </span>
                )}
              </div>

            <TableWrap>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th right>Custo unit.</Th>
                <Th>Nível de estoque</Th>
                <Th right>Atual / Mín</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {g.itens.map((m) => {
                const stock = Number(m.stock || 0);
                const min = Number(m.minStock || 0);
                const low = stock <= min;
                const pct = min > 0 ? (stock / (min * 2.5)) * 100 : stock > 0 ? 100 : 0;
                return (
                  <Tr key={String(m.id)}>
                    <Td>
                      <p className="font-semibold text-ink-900">{String(m.name)}</p>
                      <p className="font-mono text-[10.5px] text-ink-400">{m.supplier || "—"}</p>
                    </Td>
                    <Td right mono>
                      {formatMoney(Number(m.unitCost || 0))}<span className="text-[10px] text-ink-400">/{String(m.unit || "un")}</span>
                      {Number(m.packQuantity || 0) > 0 && (
                        <p className="text-[9.5px] text-ink-400">
                          {m.packName ? String(m.packName) : `${Number(m.packQuantity).toLocaleString("pt-BR")} ${String(m.unit || "un")}`} · {formatMoney(Number(m.packCost || 0))}
                        </p>
                      )}
                    </Td>
                    <Td className="min-w-[150px]">
                      <InkBar percent={pct} color={low ? "#dc2626" : pct < 60 ? "#d97706" : "#10b981"} />
                      {low && <p className="mt-1 font-mono text-[9.5px] font-semibold tracking-wide text-red-600 uppercase">repor agora</p>}
                    </Td>
                    <Td right mono>
                      <span className={cn("font-semibold", low ? "text-red-700" : "text-ink-900")}>{stock.toLocaleString("pt-BR")}</span>
                      <span className="text-ink-400"> / {min.toLocaleString("pt-BR")}</span>
                    </Td>
                    <Td right>
                      <span className="flex justify-end gap-0.5">
                        <IconButton size="sm" name="plus" label="Entrada" onClick={() => { setForm({ kind: "entrada", reason: "compra" }); setMovModal({ material: m }); }} />
                        <IconButton size="sm" name="download" label="Saída" onClick={() => { setForm({ kind: "saida", reason: "producao" }); setMovModal({ material: m }); }} />
                        <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                          const f: Record<string, string> = {};
                          for (const [k, v] of Object.entries(m)) if (v !== null && typeof v !== "object") f[k] = String(v);
                          setForm(f);
                          setMatModal({ edit: m });
                        }} />
                        <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={async () => { if (confirm("Arquivar/remover material? Materiais com histórico ou saldo serão apenas arquivados nas observações.")) { await mutate("materials", "delete", { reason: "Arquivado pelo usuário" }, Number(m.id)); refresh(); } }} />
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
            </TableWrap>
            </div>
            );
          })}
          </div>
        )
      )}

      {/* ── MOVIMENTOS ── */}
      {tab === "movimentos" && (
        movements.length === 0 ? (
          <EmptyState icon="refresh" title="Sem movimentações" hint="Vendas, compras e ajustes aparecem aqui automaticamente." />
        ) : (
          <TableWrap className="reveal reveal-1">
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Item</Th>
                <Th right>Qtd</Th>
                <Th>Motivo</Th>
                <Th>Referência</Th>
                <Th right>Data</Th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 80).map((mv) => (
                <Tr key={String(mv.id)}>
                  <Td>
                    <Badge tone={mv.kind === "entrada" ? "green" : mv.kind === "saida" ? "red" : "amber"}>
                      {mv.kind === "entrada" ? "↑ entrada" : mv.kind === "saida" ? "↓ saída" : "ajuste"}
                    </Badge>
                  </Td>
                  <Td className="font-medium text-ink-800">{matName(mv.materialId) || (mv.productId ? `Produto #${mv.productId}` : "—")}</Td>
                  <Td right mono className="font-semibold">{Number(mv.quantity).toLocaleString("pt-BR")}</Td>
                  <Td><span className="font-mono text-[11px] text-ink-500 uppercase">{String(mv.reason || "")}</span></Td>
                  <Td mono>{mv.reference || (mv.automatic ? "auto" : "manual")}</Td>
                  <Td right mono>{new Date(mv.createdAt).toLocaleDateString("pt-BR")}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )
      )}

      {/* ── FORNECEDORES ── */}
      {tab === "fornecedores" && (
        suppliers.length === 0 ? (
          <EmptyState icon="truck" title="Nenhum fornecedor" hint="Cadastre quem abastece sua gráfica para agilizar compras." />
        ) : (
          <div className="reveal reveal-1 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suppliers.map((s) => (
              <div key={String(s.id)} className="group rounded-xl border border-paper-200 bg-paper-50 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-ink-900">{String(s.tradeName || s.name)}</p>
                    <p className="truncate font-mono text-[10.5px] text-ink-400">{String(s.document || s.name)}</p>
                  </div>
                  <StatusBadge value={s.active ? "ativo" : "inativo"} />
                </div>
                <div className="mt-3 space-y-1 text-[12px] text-ink-600">
                  {s.contactName && <p className="flex items-center gap-2"><Icon name="person" size={13} className="text-ink-400" />{String(s.contactName)}</p>}
                  {s.phone && <p className="flex items-center gap-2"><Icon name="phone" size={13} className="text-ink-400" />{String(s.phone)}</p>}
                  {s.email && <p className="flex items-center gap-2 truncate"><Icon name="mail" size={13} className="text-ink-400" />{String(s.email)}</p>}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-dashed border-paper-300 pt-2.5">
                  <span className="font-mono text-[10px] text-ink-400 uppercase">{s.paymentTerms || "—"} · lead {Number(s.leadTimeDays || 0)}d</span>
                  <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                      const f: Record<string, string> = {};
                      for (const [k, v] of Object.entries(s)) if (v !== null && typeof v !== "object") f[k] = String(v);
                      setForm(f);
                      setSupModal({ edit: s });
                    }} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── COMPRAS ── */}
      {tab === "compras" && (
        purchases.length === 0 ? (
          <EmptyState icon="truck" title="Nenhuma compra" hint="Crie pedidos de compra e receba com baixa automática de estoque." action={<Button icon="plus" onClick={() => { setForm({}); setBuyItems([{ materialId: "", quantity: "1", unitCost: "" }]); setBuyModal(true); }}>Nova compra</Button>} />
        ) : (
          <TableWrap className="reveal reveal-1">
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Fornecedor</Th>
                <Th>Itens</Th>
                <Th right>Total</Th>
                <Th>Previsão</Th>
                <Th>Status</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const its = Array.isArray(p.items) ? p.items : [];
                return (
                  <Tr key={String(p.id)}>
                    <Td mono className="font-semibold text-ink-900">{String(p.number)}</Td>
                    <Td>{supName(p.supplierId) || "—"}</Td>
                    <Td><span className="line-clamp-1 max-w-[260px] text-[11.5px] text-ink-500">{its.map((i: Row) => `${Number(i.quantity)}× ${i.label || matName(i.materialId)}`).join(" · ")}</span></Td>
                    <Td right mono className="font-semibold">{formatMoney(Number(p.total || 0))}</Td>
                    <Td mono>{p.expectedDate ? new Date(`${p.expectedDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</Td>
                    <Td><StatusBadge value={String(p.status)} /></Td>
                    <Td right>
                      {p.status !== "recebido" && p.status !== "cancelado" && (
                        <Button size="xs" variant="soft" icon="check" onClick={() => receive(p)}>Receber</Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )
      )}

      {/* ── MODAL MATERIAL ── */}
      <Modal open={!!matModal} onClose={() => setMatModal(null)} title={matModal?.edit ? "Editar material" : "Novo material"} subtitle="Insumos alimentam o custo dos produtos e o estoque mínimo alerta reposição."
        footer={<><Button variant="ghost" onClick={() => setMatModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => saveMat(matModal?.edit ? Number(matModal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2"><Input value={form.name || ""} onChange={set("name")} placeholder="Papel Couché 150g A4" /></Field>
          <Field label="Categoria">
            <Select value={form.categoryId || ""} onChange={set("categoryId")}>
              <option value="">Sem categoria</option>
              {materialCats.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.icon)} {String(c.name)}</option>)}
            </Select>
          </Field>
          <Field label="Unidade">
            <Select value={form.unit || "unidade"} onChange={set("unit")}>
              {["folha", "unidade", "metro", "kg", "rolo", "pacote", "caixa"].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
          {/* ── EMBALAGEM DE COMPRA ──
              Você compra a resma, o sistema calcula a folha. */}
          <div className="sm:col-span-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
            <p className="mb-3 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wide text-cyan-800 uppercase">
              <Icon name="boxes" size={12} />
              Como você compra este insumo
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Embalagem" hint="Rótulo do que você compra">
                <Input value={form.packName || ""} onChange={set("packName")} placeholder="Resma 500 folhas" />
              </Field>
              <Field label={`Rende quantos "${form.unit || "unidade"}"`} hint="Unidades por embalagem">
                <Input mono value={form.packQuantity || ""} onChange={set("packQuantity")} placeholder="500" />
              </Field>
              <Field label="Preço da embalagem (R$)" hint="O que você paga fechado">
                <Input mono value={form.packCost || ""} onChange={set("packCost")} placeholder="28,00" />
              </Field>
            </div>
            {packUnitCost !== null ? (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-[12px] text-ink-700">
                <span className="text-ink-400">{formatMoney(packCost)} ÷ {packQty.toLocaleString("pt-BR")} = </span>
                <strong className="text-cyan-700">{formatMoney(packUnitCost)}</strong>
                <span className="text-ink-500"> por {String(form.unit || "unidade")}</span>
                <span className="ml-1 text-ink-400">— é este valor que entra no custo dos produtos.</span>
              </p>
            ) : (
              <p className="mt-3 font-mono text-[10.5px] text-ink-400">
                Deixe em branco para digitar o custo unitário direto no campo abaixo.
              </p>
            )}
          </div>

          <Field label="Custo unitário (R$)" hint={packUnitCost !== null ? "Calculado pela embalagem acima" : `Por ${form.unit || "unidade"}`}>
            <Input mono disabled={packUnitCost !== null} value={packUnitCost !== null ? packUnitCost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : (form.unitCost || "")} onChange={set("unitCost")} />
          </Field>
          <Field label="Fornecedor (texto)"><Input value={form.supplier || ""} onChange={set("supplier")} /></Field>
          <Field label="Estoque atual"><Input mono value={form.stock || "0"} onChange={set("stock")} /></Field>
          <Field label="Estoque mínimo"><Input mono value={form.minStock || "0"} onChange={set("minStock")} /></Field>
        </div>
      </Modal>

      {/* ── MODAL MOVIMENTAÇÃO ── */}
      <Modal open={!!movModal} onClose={() => setMovModal(null)} title="Movimentar estoque" subtitle={movModal?.material ? `${String(movModal.material.name)} · saldo ${Number(movModal.material.stock).toLocaleString("pt-BR")} ${movModal.material.unit}` : ""}
        footer={<><Button variant="ghost" onClick={() => setMovModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={saveMov}>Registrar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={form.kind || "entrada"} onChange={set("kind")}>
              <option value="entrada">Entrada (+)</option>
              <option value="saida">Saída (−)</option>
              <option value="ajuste">Ajuste — definir saldo (=)</option>
            </Select>
          </Field>
          <Field
            label={form.kind === "ajuste" ? "Saldo contado" : "Quantidade"}
            hint={
              form.kind === "ajuste"
                ? `O estoque passa a valer exatamente este número (atual: ${Number(movModal?.material?.stock || 0).toLocaleString("pt-BR")})`
                : undefined
            }
          >
            <Input mono value={form.quantity || ""} onChange={set("quantity")} />
          </Field>
          <Field label="Motivo">
            <Select value={form.reason || "ajuste"} onChange={set("reason")}>
              {["compra", "venda", "producao", "perda", "devolucao", "ajuste"].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Notas"><Input value={form.notes || ""} onChange={set("notes")} /></Field>
        </div>
      </Modal>

      {/* ── MODAL FORNECEDOR ── */}
      <Modal open={!!supModal} onClose={() => setSupModal(null)} title={supModal?.edit ? "Editar fornecedor" : "Novo fornecedor"}
        footer={<><Button variant="ghost" onClick={() => setSupModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => saveSup(supModal?.edit ? Number(supModal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Razão social" required><Input value={form.name || ""} onChange={set("name")} /></Field>
          <Field label="Nome fantasia"><Input value={form.tradeName || ""} onChange={set("tradeName")} /></Field>
          <Field label="CNPJ"><Input mono value={form.document || ""} onChange={set("document")} /></Field>
          <Field label="Contato"><Input value={form.contactName || ""} onChange={set("contactName")} /></Field>
          <Field label="E-mail"><Input value={form.email || ""} onChange={set("email")} /></Field>
          <Field label="Telefone"><Input mono value={form.phone || ""} onChange={set("phone")} /></Field>
          <Field label="Cidade / UF">
            <div className="flex gap-2">
              <Input value={form.city || ""} onChange={set("city")} />
              <Input value={form.state || ""} onChange={set("state")} className="w-16" />
            </div>
          </Field>
          <Field label="Condição de pagamento"><Input value={form.paymentTerms || ""} onChange={set("paymentTerms")} placeholder="28 dias" /></Field>
          <Field label="Lead time (dias)"><Input mono value={form.leadTimeDays || "0"} onChange={set("leadTimeDays")} /></Field>
          <Field label="Ativo?">
            <Select value={form.active ?? "true"} onChange={set("active")}><option value="true">Sim</option><option value="false">Não</option></Select>
          </Field>
        </div>
      </Modal>

      {/* ── MODAL COMPRA ── */}
      <Modal open={buyModal} onClose={() => setBuyModal(false)} title="Nova compra" subtitle="Ao receber, o estoque e o custo médio dos materiais são atualizados sozinhos."
        footer={
          <>
            <div className="mr-auto">
              <p className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">Total da compra</p>
              <p className="font-mono text-[18px] leading-none font-semibold text-proc-c-strong tnum">{formatMoney(buyTotal + Number(form.freight || 0))}</p>
            </div>
            <Button variant="ghost" onClick={() => setBuyModal(false)}>Cancelar</Button>
            <Button loading={saving} icon="check" onClick={saveBuy}>Registrar compra</Button>
          </>
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fornecedor">
            <Combobox value={form.supplierId || ""} onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} placeholder="Selecionar…" options={suppliers.map((s) => ({ value: String(s.id), label: String(s.tradeName || s.name) }))} />
          </Field>
          <Field label="Previsão de entrega"><Input mono type="date" value={form.expectedDate || ""} onChange={set("expectedDate")} /></Field>
          <Field label="Frete (R$)"><Input mono value={form.freight || "0"} onChange={set("freight")} /></Field>
        </div>
        <div className="mt-4 space-y-2">
          {buyItems.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_120px_32px] items-center gap-2">
              <Combobox value={it.materialId} onChange={(v) => {
                const m = materials.find((x) => String(x.id) === v);
                setBuyItems((arr) => arr.map((x, j) => (j === i ? { ...x, materialId: v, unitCost: x.unitCost || String(m?.unitCost || "") } : x)));
              }} placeholder="Material…" options={materials.map((m) => ({ value: String(m.id), label: String(m.name), hint: formatMoney(Number(m.unitCost || 0)) }))} />
              <Input mono value={it.quantity} onChange={(e) => setBuyItems((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} placeholder="qtd" />
              <Input mono value={it.unitCost} onChange={(e) => setBuyItems((arr) => arr.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} placeholder="R$ un" />
              <IconButton size="sm" name="trash" label="Remover" tone="danger" onClick={() => setBuyItems((arr) => arr.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="xs" variant="outline" icon="plus" onClick={() => setBuyItems((arr) => [...arr, { materialId: "", quantity: "1", unitCost: "" }])}>Item</Button>
        </div>
      </Modal>
    </div>
  );
}
