"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import {
  computeBatchProduct,
  computeProduct,
  formatMoney,
  type ColorMode,
  type FinishingLike,
  type MaterialLike,
  type ServiceLike,
} from "@/lib/pricing";

const asLike = <T,>(v: unknown): T | undefined => (v ?? undefined) as T | undefined;
import {
  Badge,
  Button,
  Card,
  Combobox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  TableWrap,
  Td,
  Textarea,
  Th,
  Tr,
  Toggle,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CategoriasManager } from "@/components/modules/CategoriasManager";
import { cn } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

export function ProductsClient({
  catalog,
  products,
  finishings,
  materials,
  priceTiers = [],
  taxRate,
  cardFeeRate,
  laborHourlyRate,
}: {
  catalog: {
    categories: Row[];
    consumables: Row[];
    printers: Row[];
    materials: Row[];
    finishings: Row[];
    services: Row[];
    pricingTables: Row[];
    formats: Row[];
    itemCategories?: Row[];
  };
  products: Row[];
  finishings: Row[];
  materials: Row[];
  priceTiers?: Row[];
  taxRate: number;
  cardFeeRate: number;
  laborHourlyRate: number;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  /* ── editor state ── */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [calcMode, setCalcMode] = useState<"unit" | "batch">("unit");
  const [colorMode, setColorMode] = useState<ColorMode>("color");
  const [compFinishings, setCompFinishings] = useState<{ id: string; quantity: string; chargeMode: string; batchSize: string }[]>([]);
  const [compMaterials, setCompMaterials] = useState<{ id: string; quantity: string }[]>([]);
  const [tiers, setTiers] = useState<{ minQuantity: string; unitPrice: string; label: string }[]>([]);
  const [simQty, setSimQty] = useState<string>("");

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const productCats = catalog.itemCategories ?? [];

  /* ── cálculo ao vivo ── */
  const printer = catalog.printers.find((p) => String(p.id) === form.printerId);
  const printerCat = catalog.categories.find((c) => String(c.id) === (form.printerCategoryId || String(printer?.categoryId || "")));
  const consumables = catalog.consumables.filter((c) => String(c.categoryId) === String(printerCat?.id || ""));
  const format = catalog.formats.find((f) => String(f.id) === form.printFormatId);
  const baseMaterial = asLike<MaterialLike>(catalog.materials.find((m) => String(m.id) === form.baseMaterialId));
  const service = asLike<ServiceLike>(catalog.services.find((s) => String(s.id) === form.baseServiceId));
  const pricingTableRow = catalog.pricingTables.find((t) => String(t.id) === form.basePricingTableId);
  const finLines = compFinishings
    .map((f) => ({ finishing: asLike<FinishingLike>(catalog.finishings.find((x) => String(x.id) === f.id)), quantity: num(f.quantity, 1), chargeMode: f.chargeMode, batchSize: num(f.batchSize, 1) }));
  const matLines = compMaterials
    .map((m) => ({ material: asLike<MaterialLike>(catalog.materials.find((x) => String(x.id) === m.id)), quantity: num(m.quantity, 1) }));

  const liveCalc = useMemo(() => {
    if (!printerCat) return null;
    if (calcMode === "batch") {
      const qty = num(simQty || form.defaultQuantity, 1);
      const r = computeBatchProduct({
        printer,
        category: printerCat,
        consumables,
        format,
        colorMode,
        requestedQuantity: qty,
        piecesPerSheet: num(form.piecesPerSheet, 1),
        printSides: num(form.printSides, 1),
        wastePercent: num(form.wastePercent, 0) / 100,
        setupSheets: num(form.setupSheets, 0),
        materialSheetsPerPrintedSheet: num(form.baseMaterialQty, 1),
        baseMaterial,
        extraMaterials: matLines,
        finishings: finLines,
        service,
        operationalRate: num(form.operationalRate, 0) / 100,
        laborHourlyRate,
        taxRate,
        paymentRate: cardFeeRate,
        profitRate: num(form.margin, 40) / 100,
        roundingStep: num(form.roundingStep, 0.01),
      });
      return {
        mode: "batch" as const,
        qty,
        lines: r.lines,
        baseCost: r.directCost,
        sellPrice: r.finalPrice,
        finalPrice: r.finalPrice,
        unitPrice: r.unitPrice,
        finalSheets: r.finalSheets,
        valid: r.valid,
        error: r.error,
        marginAmount: r.profitAmount,
        taxAmount: r.taxAmount,
        feeAmount: r.paymentAmount,
        opAmount: r.operationalAmount,
      };
    }
    const r = computeProduct({
      category: printerCat,
      consumables,
      printer,
      format,
      colorMode,
      pagesPerUnit: num(form.pagesPerUnit, 1),
      copies: num(form.copies, 1),
      machineMinutes: num(form.machineMinutes, 0),
      baseMaterial,
      baseMaterialQty: num(form.baseMaterialQty, 1),
      basePricingTable: pricingTableRow as never,
      basePricingTableQty: num(form.basePricingTableQty, 1),
      basePricingTablePieces: num(form.basePricingTablePieces, 0),
      finishings: finLines,
      extraMaterials: matLines,
      service,
      margin: num(form.margin, 40) / 100,
      laborHourlyRate,
      taxRate,
      cardFeeRate,
    });
    return {
      mode: "unit" as const,
      qty: 1,
      lines: r.lines,
      baseCost: r.baseCost,
      sellPrice: r.sellPrice,
      finalPrice: r.finalPrice,
      unitPrice: r.unitPrice,
      valid: true,
      marginAmount: r.marginAmount,
      taxAmount: r.taxAmount,
      feeAmount: r.cardFeeAmount,
      opAmount: 0,
    };
  }, [printer, printerCat, consumables, format, baseMaterial, service, pricingTableRow, finLines, matLines, calcMode, colorMode, form, simQty, taxRate, cardFeeRate, laborHourlyRate]);

  /* ── abrir editor ── */
  function openNew() {
    setEditId(null);
    setCalcMode("unit");
    setColorMode("color");
    setCompFinishings([]);
    setCompMaterials([]);
    setTiers([]);
    setSimQty("");
    setForm({ margin: "40", pagesPerUnit: "1", copies: "1", baseMaterialQty: "1", defaultQuantity: "100", piecesPerSheet: "1", printSides: "1", wastePercent: "5", setupSheets: "0", minOrderQty: "1", operationalRate: "15", roundingStep: "0.01",
      leadTimeCreation: "0", leadTimeProduction: "1", leadTimeFinishing: "0", leadTimeSerial: "false" });
    setEditorOpen(true);
  }

  function openEdit(p: Row) {
    setEditId(Number(p.id));
    setCalcMode(p.calculationMode === "batch" ? "batch" : "unit");
    setColorMode((p.colorMode as ColorMode) || "color");
    setSimQty("");
    setCompFinishings(
      finishings.filter((f) => Number(f.productId) === Number(p.id)).map((f) => ({ id: String(f.finishingId), quantity: String(f.quantity), chargeMode: String(f.chargeMode || "per_piece"), batchSize: String(f.batchSize || 1) }))
    );
    setCompMaterials(
      materials.filter((m) => Number(m.productId) === Number(p.id)).map((m) => ({ id: String(m.materialId), quantity: String(m.quantity) }))
    );
    setTiers(
      priceTiers
        .filter((t) => Number(t.productId) === Number(p.id))
        .sort((a, b) => num(a.minQuantity) - num(b.minQuantity))
        .map((t) => ({ minQuantity: String(num(t.minQuantity)), unitPrice: String(num(t.unitPrice)), label: String(t.label || "") }))
    );
    setForm({
      name: String(p.name || ""),
      description: String(p.description || ""),
      productCategoryId: p.productCategoryId ? String(p.productCategoryId) : "",
      printerId: p.printerId ? String(p.printerId) : "",
      printFormatId: p.printFormatId ? String(p.printFormatId) : "",
      pagesPerUnit: String(p.pagesPerUnit ?? 1),
      copies: String(p.copies ?? 1),
      baseMaterialId: p.baseMaterialId ? String(p.baseMaterialId) : "",
      baseMaterialQty: String(p.baseMaterialQty ?? 1),
      baseServiceId: p.baseServiceId ? String(p.baseServiceId) : "",
      basePricingTableId: p.basePricingTableId ? String(p.basePricingTableId) : "",
      basePricingTableQty: String(p.basePricingTableQty ?? 1),
      basePricingTablePieces: String(p.basePricingTablePieces ?? 0),
      defaultQuantity: String(p.defaultQuantity ?? 1),
      piecesPerSheet: String(p.piecesPerSheet ?? 1),
      printSides: String(p.printSides ?? 1),
      machineMinutes: String(p.machineMinutes ?? 0),
      wastePercent: String(num(p.wastePercent) * 100),
      setupSheets: String(p.setupSheets ?? 0),
      minOrderQty: String(p.minOrderQty ?? 1),
      leadTimeCreation: String(p.leadTimeCreation ?? 0),
      leadTimeProduction: String(p.leadTimeProduction ?? 1),
      leadTimeFinishing: String(p.leadTimeFinishing ?? 0),
      leadTimeSerial: p.leadTimeSerial ? "true" : "false",
      operationalRate: String(num(p.operationalRate) * 100),
      roundingStep: String(p.roundingStep ?? 0.01),
      margin: String(num(p.margin, 0.4) * 100),
      stock: String(p.stock ?? 0),
      minStock: String(p.minStock ?? 0),
      shipWeight: String(p.shipWeight ?? 0),
      shipHeight: String(p.shipHeight ?? 0),
      shipWidth: String(p.shipWidth ?? 0),
      shipLength: String(p.shipLength ?? 0),
      active: String(p.active ?? true),
      trackStock: String(p.trackStock ?? false),
    });
    setEditorOpen(true);
  }

  async function save() {
    if (!form.name?.trim()) return toast.error("Informe o nome do produto");
    setSaving(true);
    try {
      const data = {
        name: form.name,
        description: form.description || null,
        productCategoryId: form.productCategoryId || null,
        printerId: form.printerId || null,
        printerCategoryId: printerCat ? Number(printerCat.id) : null,
        printFormatId: form.printFormatId || null,
        colorMode,
        pagesPerUnit: form.pagesPerUnit || 1,
        copies: form.copies || 1,
        calculationMode: calcMode,
        defaultQuantity: form.defaultQuantity || 1,
        piecesPerSheet: form.piecesPerSheet || 1,
        printSides: Number(form.printSides || 1),
        machineMinutes: num(form.machineMinutes, 0),
        wastePercent: String(num(form.wastePercent, 0) / 100),
        setupSheets: Number(form.setupSheets || 0),
        minOrderQty: form.minOrderQty || 1,
        leadTimeCreation: num(form.leadTimeCreation, 0),
        leadTimeProduction: num(form.leadTimeProduction, 1),
        leadTimeFinishing: num(form.leadTimeFinishing, 0),
        leadTimeSerial: form.leadTimeSerial === "true",
        operationalRate: String(num(form.operationalRate, 0) / 100),
        roundingStep: form.roundingStep || 0.01,
        baseMaterialId: form.baseMaterialId || null,
        baseMaterialQty: form.baseMaterialQty || 1,
        baseServiceId: form.baseServiceId || null,
        basePricingTableId: form.basePricingTableId || null,
        basePricingTableQty: num(form.basePricingTableQty, 1),
        basePricingTablePieces: num(form.basePricingTablePieces, 0),
        margin: String(num(form.margin, 40) / 100),
        costSnapshot: String(liveCalc?.baseCost ?? 0),
        sellPrice: String(liveCalc?.sellPrice ?? 0),
        finalPrice: String(liveCalc?.finalPrice ?? 0),
        breakdown: liveCalc ? { lines: liveCalc.lines, finalSheets: "finalSheets" in liveCalc ? liveCalc.finalSheets : undefined } : null,
        active: form.active !== "false",
        trackStock: form.trackStock === "true",
        stock: form.stock || 0,
        minStock: form.minStock || 0,
        shipWeight: form.shipWeight || 0,
        shipHeight: form.shipHeight || 0,
        shipWidth: form.shipWidth || 0,
        shipLength: form.shipLength || 0,
        finishings: compFinishings.filter((f) => f.id).map((f) => ({ id: Number(f.id), quantity: num(f.quantity, 1), chargeMode: f.chargeMode, batchSize: num(f.batchSize, 1) })),
        materials: compMaterials.filter((m) => m.id).map((m) => ({ id: Number(m.id), quantity: num(m.quantity, 1) })),
        priceTiers: tiers
          .filter((t) => num(t.minQuantity) > 0)
          .map((t) => ({ minQuantity: num(t.minQuantity), unitPrice: num(t.unitPrice), label: t.label?.trim() || null })),
      };
      if (editId) await mutate("products", "update", data, editId);
      else await mutate("products", "create", data);
      toast.success("Produto salvo", liveCalc ? `Preço final ${formatMoney(liveCalc.finalPrice)}` : undefined);
      setEditorOpen(false);
      refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Arquivar produto? Produtos usados em orçamentos/vendas serão apenas desativados.")) return;
    await mutate("products", "delete", { reason: "Arquivado pelo usuário" }, id);
    toast.info("Produto arquivado/removido");
    refresh();
  }

  const filtered = products.filter((p) => {
    const matchQ = !q || String(p.name).toLowerCase().includes(q.toLowerCase()) || String(p.sku || "").toLowerCase().includes(q.toLowerCase());
    /* Filtrar por uma mestre traz tudo que está abaixo dela — é o que
       o operador espera ao escolher "Brindes & Estamparia". */
    const filhosDoFiltro = productCats
      .filter((c) => String(c.parentId) === catFilter)
      .map((c) => String(c.id));
    const matchC =
      catFilter === "all" ||
      String(p.productCategoryId) === catFilter ||
      filhosDoFiltro.includes(String(p.productCategoryId));
    return matchQ && matchC;
  });

  const catName = (id: unknown) => productCats.find((c) => Number(c.id) === Number(id))?.name;
  const [gerirCats, setGerirCats] = useState(false);

  /* ── Árvore de duas camadas (v3.58.0) ─────────────────────────
     As categorias viraram Mestre → Subcategoria. Os selects listavam
     tudo achatado, então "Impressos Comerciais" aparecia solto, sem
     dizer que é de "Gráfica Rápida".

     `<optgroup>` resolve com HTML puro: agrupa visualmente e o
     usuário não pode escolher o grupo por engano. */
  const arvoreCats = (() => {
    const mestres = productCats
      .filter((c) => c.parentId == null)
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    return mestres.map((m) => ({
      mestre: m,
      filhos: productCats
        .filter((c) => Number(c.parentId) === Number(m.id))
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)),
    }));
  })();

  /* Categorias sem pai e sem filhos: sobrou de alguma classificação
     antiga. Aparecem no fim para serem reorganizadas, não somem. */
  const catsSoltas = productCats.filter(
    (c) => c.parentId == null && !productCats.some((f) => Number(f.parentId) === Number(c.id))
  );

  return (
    <div>
      <PageHeader
        eyebrow="Catálogo com calculadora ao vivo"
        title="Produtos & Custos"
        icon="tag"
        description="Produto = Impressão + Material + Acabamento + Serviço. O custo é decomposto em tempo real pelo motor — margem, impostos e maquininha fecham o preço final."
        actions={<Button icon="plus" onClick={openNew}>Novo produto</Button>}
      />

      {/* Filtros */}
      <div className="reveal mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-xs">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou SKU…" className="pl-8.5" />
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto">
          <option value="all">Todas as categorias</option>
          {arvoreCats.map(({ mestre, filhos }) => (
            <optgroup key={String(mestre.id)} label={`${String(mestre.icon)} ${String(mestre.name)}`}>
              {/* A própria mestre é selecionável: pega ela e os filhos. */}
              <option value={String(mestre.id)}>Todos de {String(mestre.name)}</option>
              {filhos.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.icon)} {String(c.name)}
                </option>
              ))}
            </optgroup>
          ))}
          {catsSoltas.length > 0 && (
            <optgroup label="Sem grupo">
              {catsSoltas.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.icon)} {String(c.name)}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <span className="ml-auto font-mono text-[11px] text-ink-400 tnum">
          {filtered.length} de {products.length} produtos
        </span>
        {/* Gerir categorias é tarefa rara: fica atrás de um botão, não
            ocupando espaço permanente. */}
        <Button
          size="sm"
          variant="ghost"
          icon={gerirCats ? "x" : "gear"}
          onClick={() => setGerirCats((v) => !v)}
        >
          Categorias
        </Button>
      </div>

      {gerirCats && (
        <CategoriasManager
          categorias={productCats}
          module="product"
          titulo="Categorias de produto"
          contagem={products.reduce<Record<string, number>>((acc, p) => {
            const k = String(p.productCategoryId ?? "");
            if (k) acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {})}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="tag"
          title="Nenhum produto por aqui"
          hint="Crie produtos com a calculadora ao vivo — o motor deprecia cada centavo de custo."
          action={<Button icon="plus" onClick={openNew}>Criar primeiro produto</Button>}
        />
      ) : (
        <TableWrap className="reveal reveal-1">
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Categoria</Th>
              <Th>Impressora</Th>
              <Th right>Custo</Th>
              <Th right>Margem</Th>
              <Th right>Preço final</Th>
              <Th>Status</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const cost = num(p.costSnapshot);
              const price = num(p.finalPrice);
              const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
              return (
                <Tr key={String(p.id)} onClick={() => openEdit(p)}>
                  <Td>
                    <p className="font-semibold text-ink-900">{String(p.name)}</p>
                    <p className="font-mono text-[10.5px] text-ink-400">
                      {String(p.sku || "—")} · {p.calculationMode === "batch" ? `tiragem ${num(p.defaultQuantity)}un` : "unitário"}
                    </p>
                  </Td>
                  <Td>
                    {catName(p.productCategoryId) ? (
                      <Badge tone="neutral">{catName(p.productCategoryId)}</Badge>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                  <Td>
                    {catalog.printers.find((x) => Number(x.id) === Number(p.printerId))?.name ? (
                      <span className="flex items-center gap-1.5 text-[12.5px]">
                        <Icon name="printer" size={13} className="text-ink-400" />
                        {catalog.printers.find((x) => Number(x.id) === Number(p.printerId))?.name}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                  <Td right mono>{formatMoney(cost)}</Td>
                  <Td right mono>
                    <span className={cn(marginPct >= 40 ? "text-emerald-700" : marginPct >= 25 ? "text-amber-700" : "text-red-700")}>
                      {marginPct.toFixed(0)}%
                    </span>
                  </Td>
                  <Td right mono className="font-semibold text-ink-900">{formatMoney(price)}</Td>
                  <Td>
                    <Badge tone={p.active ? "green" : "neutral"} dot>
                      {p.active ? "ativo" : "inativo"}
                    </Badge>
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton size="sm" name="pencil" label="Editar" onClick={() => openEdit(p)} />
                      <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={() => del(Number(p.id))} />
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {/* ── EDITOR ── */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editId ? "Editar produto" : "Novo produto"}
        subtitle="A calculadora roda ao vivo — cada ajuste reflete no breakdown de custo."
        width="max-w-5xl"
        footer={
          <>
            <div className="mr-auto flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">Preço final</span>
              <span className="font-mono text-[20px] font-semibold text-proc-c-strong tnum">
                {liveCalc ? formatMoney(liveCalc.finalPrice) : "—"}
              </span>
            </div>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={save} icon="check">Salvar produto</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          {/* Coluna de configuração */}
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome" required className="sm:col-span-2">
                <Input value={form.name || ""} onChange={set("name")} placeholder="Ex.: Cartão de Visita 4x4 (100un)" />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Textarea value={form.description || ""} onChange={set("description")} placeholder="Detalhes comerciais do produto…" className="min-h-[60px]" />
              </Field>
              <Field label="Categoria comercial">
                <Select value={form.productCategoryId || ""} onChange={set("productCategoryId")}>
                  <option value="">Sem categoria</option>
                  {/* No cadastro só a subcategoria é escolhível: um
                      produto pertence à folha, não ao galho. Se
                      pudesse ficar na mestre, metade acabaria solta
                      em "Brindes & Estamparia" sem dizer qual. */}
                  {arvoreCats.map(({ mestre, filhos }) => (
                    <optgroup key={String(mestre.id)} label={`${String(mestre.icon)} ${String(mestre.name)}`}>
                      {filhos.map((c) => (
                        <option key={String(c.id)} value={String(c.id)}>
                          {String(c.icon)} {String(c.name)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {catsSoltas.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.icon)} {String(c.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Serviço agregado" hint="opcional">
                <Combobox
                  value={form.baseServiceId || ""}
                  onChange={(v) => setForm((f) => ({ ...f, baseServiceId: v }))}
                  placeholder="Nenhum"
                  options={catalog.services.map((s) => ({ value: String(s.id), label: String(s.name), hint: formatMoney(num(s.baseCost)) }))}
                />
              </Field>
              <Field label="Tabela terceirizada" hint="DTF UV, têxtil, lona — entra pelo CUSTO">
                <Combobox
                  value={form.basePricingTableId || ""}
                  onChange={(v) => setForm((f) => ({ ...f, basePricingTableId: v }))}
                  placeholder="Nenhuma"
                  options={catalog.pricingTables
                    .filter((t) => t.active !== false)
                    .map((t) => ({
                      value: String(t.id),
                      label: String(t.label),
                      hint: `${formatMoney(num(t.unitCost))}/${String(t.unit)}`,
                    }))}
                />
              </Field>
              {form.basePricingTableId && (
                <Field label="Quantidade da tabela" hint={`em ${String(pricingTableRow?.unit || "unidade")} por unidade do produto`}>
                  <Input mono value={form.basePricingTableQty || "1"} onChange={set("basePricingTableQty")} />
                </Field>
              )}
              {form.basePricingTableId && String(pricingTableRow?.unit) !== "m2" && (
                <Field
                  label="Peças por folha"
                  hint={`quantas cabem na ${String(pricingTableRow?.label || "folha")} — depende do tamanho da estampa`}
                >
                  <Input
                    mono
                    value={form.basePricingTablePieces || ""}
                    onChange={set("basePricingTablePieces")}
                    placeholder={String(num(pricingTableRow?.piecesPerSheet, 1))}
                  />
                </Field>
              )}
            </section>

            {/* Motor */}
            <section className="rounded-xl border border-paper-200 bg-paper-100/50 p-4">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                  <Icon name="printer" size={13} />
                  Motor de impressão
                </h4>
                <Segmented
                  value={calcMode}
                  onChange={setCalcMode}
                  options={[
                    { value: "unit", label: "Unitário" },
                    { value: "batch", label: "Por tiragem" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field label="Impressora" hint="define a categoria de custo">
                  <Combobox
                    value={form.printerId || ""}
                    onChange={(v) => setForm((f) => ({ ...f, printerId: v }))}
                    placeholder="Usar categoria base"
                    options={catalog.printers.map((p) => ({ value: String(p.id), label: String(p.name), hint: catalog.categories.find((c) => Number(c.id) === Number(p.categoryId))?.name }))}
                  />
                </Field>
                <Field label="Formato">
                  <Combobox
                    value={form.printFormatId || ""}
                    onChange={(v) => setForm((f) => ({ ...f, printFormatId: v }))}
                    placeholder="Padrão da categoria"
                    options={catalog.formats
                      .filter((f) => !printerCat || Number(f.categoryId) === Number(printerCat.id))
                      .map((f) => ({ value: String(f.id), label: String(f.name), hint: num(f.printCostOverride) > 0 ? formatMoney(num(f.printCostOverride)) : undefined }))}
                  />
                </Field>
                <Field label="Cor">
                  <Segmented
                    value={colorMode}
                    onChange={setColorMode}
                    options={[
                      { value: "mono", label: "P&B" },
                      { value: "color", label: "Colorido" },
                    ]}
                  />
                </Field>
                {calcMode === "unit" ? (
                  <>
                    <Field label="Páginas por unidade">
                      <Input mono value={form.pagesPerUnit || ""} onChange={set("pagesPerUnit")} />
                    </Field>
                    <Field label="Vias / cópias">
                      <Input mono value={form.copies || ""} onChange={set("copies")} />
                    </Field>
                    {num(printer?.hourlyRate, 0) > 0 && (
                      <Field
                        label="Minutos de máquina"
                        hint={`${formatMoney(num(printer?.hourlyRate, 0))}/h nesta impressora`}
                        className="sm:col-span-2"
                      >
                        <Input mono value={form.machineMinutes || ""} onChange={set("machineMinutes")} placeholder="480" />
                      </Field>
                    )}
                  </>
                ) : (
                  <>
                    <Field label="Tiragem padrão (peças)">
                      <Input mono value={form.defaultQuantity || ""} onChange={set("defaultQuantity")} />
                    </Field>
                    <Field label="Peças por folha">
                      <Input mono value={form.piecesPerSheet || ""} onChange={set("piecesPerSheet")} />
                    </Field>
                    <Field label="Faces impressas">
                      <Select value={form.printSides || "1"} onChange={set("printSides")}>
                        <option value="1">1 face (frente)</option>
                        <option value="2">2 faces (frente e verso)</option>
                      </Select>
                    </Field>
                    <Field label="Perda técnica (%)">
                      <Input mono value={form.wastePercent || ""} onChange={set("wastePercent")} />
                    </Field>
                    <Field label="Folhas de setup/prova">
                      <Input mono value={form.setupSheets || ""} onChange={set("setupSheets")} />
                    </Field>
                    <Field label="Pedido mínimo">
                      <Input mono value={form.minOrderQty || ""} onChange={set("minOrderQty")} />
                    </Field>
                    <Field label="Custo operacional (%)">
                      <Input mono value={form.operationalRate || ""} onChange={set("operationalRate")} />
                    </Field>
                    <Field label="Arredondamento (R$)">
                      <Input mono value={form.roundingStep || ""} onChange={set("roundingStep")} />
                    </Field>
                  </>
                )}
              </div>
            </section>

            {/* Prazo de entrega — vale para QUALQUER produto, por isso
                fica fora do bloco de impressão. */}
            <section className="rounded-xl border border-paper-200 bg-paper-100/50 p-4">
              <h4 className="mb-1 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                <Icon name="clock" size={13} />
                Prazo de entrega
              </h4>
              <p className="mb-3.5 text-[12px] leading-relaxed text-ink-500">
                Em <strong>dias úteis</strong>, contados da aprovação da arte. Não confunda com
                minutos de máquina: uma peça 3D roda 6&nbsp;h na impressora mas o cliente recebe
                em 4 dias. Num pedido com vários itens vale o maior, não a soma.
              </p>
              {/* Dica ABAIXO do campo, não ao lado: o Field padrão põe
                  rótulo e dica na mesma linha, e em três colunas
                  estreitas a dica atropela o rótulo. */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {([
                  ["leadTimeCreation", "Criação", "0", "arte, modelagem — 0 se o cliente traz pronta"],
                  ["leadTimeProduction", "Produção", "1", "máquina rodando"],
                  ["leadTimeFinishing", "Acabamento", "0", "cura, montagem, secagem"],
                ] as const).map(([campo, rotulo, exemplo, dica]) => (
                  <label key={campo} className="block">
                    <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
                      {rotulo}
                    </span>
                    <Input mono value={form[campo] ?? ""} onChange={set(campo)} placeholder={exemplo} />
                    <span className="mt-1 block text-[10.5px] leading-snug text-ink-400">{dica}</span>
                  </label>
                ))}
              </div>
              <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 text-[12.5px] text-ink-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ink-900"
                  checked={form.leadTimeSerial === "true"}
                  onChange={(e) => setForm((f) => ({ ...f, leadTimeSerial: e.target.checked ? "true" : "false" }))}
                />
                <span>
                  <strong>Só começa depois dos outros itens</strong>
                  <span className="block text-[11.5px] text-ink-500">
                    Encadernação exige capa e miolo prontos. Marcado, soma por cima do maior prazo
                    em vez de correr em paralelo.
                  </span>
                </span>
              </label>
              <p className="mt-3 rounded-lg bg-paper-200/60 px-3 py-2 font-mono text-[11.5px] text-ink-600">
                total: {(Number(form.leadTimeCreation || 0) + Number(form.leadTimeProduction || 0) + Number(form.leadTimeFinishing || 0)) || 0} dia(s) útil(eis)
              </p>
            </section>

            {/* Material base + insumos */}
            <section className="rounded-xl border border-paper-200 bg-paper-100/50 p-4">
              <h4 className="mb-3.5 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                <Icon name="boxes" size={13} />
                Materiais & insumos
              </h4>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_130px]">
                <Field label="Material base">
                  <Combobox
                    value={form.baseMaterialId || ""}
                    onChange={(v) => setForm((f) => ({ ...f, baseMaterialId: v }))}
                    placeholder="Nenhum"
                    options={catalog.materials.map((m) => ({ value: String(m.id), label: String(m.name), hint: `${formatMoney(num(m.unitCost))}/${m.unit}` }))}
                  />
                </Field>
                <Field label={calcMode === "batch" ? "Folhas/impressão" : "Quantidade"}>
                  <Input mono value={form.baseMaterialQty || ""} onChange={set("baseMaterialQty")} />
                </Field>
              </div>
              <div className="mt-3.5 space-y-2">
                {compMaterials.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Combobox
                      className="flex-1"
                      value={m.id}
                      onChange={(v) => setCompMaterials((arr) => arr.map((x, j) => (j === i ? { ...x, id: v } : x)))}
                      placeholder="Insumo extra…"
                      options={catalog.materials.map((x) => ({ value: String(x.id), label: String(x.name), hint: formatMoney(num(x.unitCost)) }))}
                    />
                    <Input mono value={m.quantity} onChange={(e) => setCompMaterials((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-24" placeholder="qtd" />
                    <IconButton size="sm" name="trash" label="Remover" tone="danger" onClick={() => setCompMaterials((arr) => arr.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="xs" variant="outline" icon="plus" onClick={() => setCompMaterials((arr) => [...arr, { id: "", quantity: "1" }])}>
                  Insumo extra
                </Button>
              </div>
            </section>

            {/* Faixas de preço por quantidade */}
            <section className="rounded-xl border border-paper-200 bg-paper-100/50 p-4">
              <h4 className="mb-1.5 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                <Icon name="tag" size={13} />
                Preço por quantidade
              </h4>
              <p className="mb-3.5 text-[11.5px] text-ink-500">
                Para quem vende em lote: mínimo 50, depois 100, 250… Vale a maior faixa
                que o pedido alcançar. Sem faixas, usa o preço calculado acima.
              </p>
              <div className="space-y-2">
                {tiers.map((t, i) => {
                  const q = num(t.minQuantity);
                  const pu = num(t.unitPrice);
                  const custoUn = liveCalc && calcMode === "unit" ? liveCalc.baseCost : 0;
                  const prejuizo = custoUn > 0 && pu > 0 && pu < custoUn;
                  return (
                    <div key={i}>
                      <div className="grid grid-cols-[110px_130px_1fr_32px] items-center gap-2">
                        <Input
                          mono
                          value={t.minQuantity}
                          placeholder="a partir de"
                          onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, minQuantity: e.target.value } : x)))}
                        />
                        <Input
                          mono
                          value={t.unitPrice}
                          placeholder="R$/un"
                          onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))}
                        />
                        <Input
                          value={t.label}
                          placeholder="rótulo no orçamento (opcional)"
                          onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        />
                        <IconButton size="sm" name="trash" label="Remover" tone="danger" onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))} />
                      </div>
                      {q > 0 && pu > 0 && (
                        <p className={cn("mt-1 pl-1 font-mono text-[10.5px]", prejuizo ? "font-semibold text-red-600" : "text-ink-400")}>
                          {prejuizo
                            ? `⚠ abaixo do custo de ${formatMoney(custoUn)}/un — venda no prejuízo`
                            : `${q.toLocaleString("pt-BR")} un × ${formatMoney(pu)} = ${formatMoney(q * pu)}`}
                        </p>
                      )}
                    </div>
                  );
                })}
                <Button size="xs" variant="outline" icon="plus" onClick={() => setTiers((arr) => [...arr, { minQuantity: "", unitPrice: "", label: "" }])}>
                  Faixa de quantidade
                </Button>
              </div>
            </section>

            {/* Acabamentos */}
            <section className="rounded-xl border border-paper-200 bg-paper-100/50 p-4">
              <h4 className="mb-3.5 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-600 uppercase">
                <Icon name="scissors" size={13} />
                Acabamentos
              </h4>
              <div className="space-y-2">
                {compFinishings.map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_130px_90px_32px] items-center gap-2">
                    <Combobox
                      value={f.id}
                      onChange={(v) => setCompFinishings((arr) => arr.map((x, j) => (j === i ? { ...x, id: v } : x)))}
                      placeholder="Acabamento…"
                      options={catalog.finishings.map((x) => ({ value: String(x.id), label: String(x.name), hint: `${formatMoney(num(x.unitCost))}/${x.unit}` }))}
                    />
                    <Input mono value={f.quantity} onChange={(e) => setCompFinishings((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} placeholder="qtd" />
                    <Select value={f.chargeMode} onChange={(e) => setCompFinishings((arr) => arr.map((x, j) => (j === i ? { ...x, chargeMode: e.target.value } : x)))}>
                      <option value="per_piece">por peça</option>
                      <option value="per_sheet">por folha</option>
                      <option value="per_kit">por kit</option>
                      <option value="fixed_lot">fixo/lote</option>
                      <option value="per_meter">por metro</option>
                      <option value="per_m2">por m²</option>
                    </Select>
                    <Input mono value={f.batchSize} onChange={(e) => setCompFinishings((arr) => arr.map((x, j) => (j === i ? { ...x, batchSize: e.target.value } : x)))} placeholder="kit" disabled={f.chargeMode !== "per_kit"} />
                    <IconButton size="sm" name="trash" label="Remover" tone="danger" onClick={() => setCompFinishings((arr) => arr.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="xs" variant="outline" icon="plus" onClick={() => setCompFinishings((arr) => [...arr, { id: "", quantity: "1", chargeMode: "per_piece", batchSize: "1" }])}>
                  Acabamento
                </Button>
              </div>
            </section>

            {/* Comercial */}
            <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              <Field label={calcMode === "batch" ? "Lucro alvo (%)" : "Margem (%)"}>
                <Input mono value={form.margin || ""} onChange={set("margin")} />
              </Field>
              <Field label="Rastreia estoque?">
                <Select value={form.trackStock || "false"} onChange={set("trackStock")}>
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </Select>
              </Field>
              <Field label="Estoque atual">
                <Input mono value={form.stock || "0"} onChange={set("stock")} disabled={form.trackStock !== "true"} />
              </Field>
              <Field label="Produto ativo?">
                <Select value={form.active ?? "true"} onChange={set("active")}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </Select>
              </Field>
            </section>

            {/* Logística — alimenta a cotação de frete (SuperFrete) */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
                <Icon name="truck" size={12} />
                Logística · frete
                <span className="ml-1 normal-case tracking-normal text-ink-400">
                  deixe zerado para usar o pacote padrão
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                <Field label="Peso" hint="kg">
                  <Input mono inputMode="decimal" value={form.shipWeight || ""} onChange={set("shipWeight")} placeholder="0,000" />
                </Field>
                <Field label="Altura" hint="cm">
                  <Input mono inputMode="decimal" value={form.shipHeight || ""} onChange={set("shipHeight")} placeholder="0" />
                </Field>
                <Field label="Largura" hint="cm">
                  <Input mono inputMode="decimal" value={form.shipWidth || ""} onChange={set("shipWidth")} placeholder="0" />
                </Field>
                <Field label="Comprimento" hint="cm">
                  <Input mono inputMode="decimal" value={form.shipLength || ""} onChange={set("shipLength")} placeholder="0" />
                </Field>
              </div>
            </section>
          </div>

          {/* Coluna do breakdown */}
          <aside className="lg:sticky lg:top-0">
            <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-pop">
              <div className="halftone-light flex items-center justify-between border-b border-ink-800 px-4 py-3">
                <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-cyan-300 uppercase">
                  Ordem de custo · ao vivo
                </p>
                {calcMode === "batch" && (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={simQty}
                      onChange={(e) => setSimQty(e.target.value)}
                      placeholder={form.defaultQuantity || "qtd"}
                      className="focus-ring w-16 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-right font-mono text-[11.5px] text-white placeholder:text-ink-500 tnum"
                    />
                    <span className="font-mono text-[9px] text-ink-400 uppercase">simular</span>
                  </div>
                )}
              </div>
              <div className="max-h-[430px] overflow-y-auto px-4 py-3">
                {!liveCalc && <p className="py-8 text-center text-[12px] text-ink-400">Escolha uma categoria de impressora para calcular.</p>}
                {liveCalc && (
                  <>
                    {"finalSheets" in liveCalc && calcMode === "batch" && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {[
                          { k: "peças", v: String(liveCalc.qty) },
                          { k: "folhas base", v: String(Math.ceil(liveCalc.qty / Math.max(num(form.piecesPerSheet, 1), 1))) },
                          { k: "folhas finais", v: String(liveCalc.finalSheets) },
                        ].map((x) => (
                          <div key={x.k} className="rounded-lg bg-white/[0.05] px-2 py-2 text-center">
                            <p className="font-mono text-[15px] leading-none font-semibold text-white tnum">{x.v}</p>
                            <p className="mt-1 text-[8.5px] tracking-wider text-ink-400 uppercase">{x.k}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {liveCalc.lines.length === 0 && <p className="py-4 text-center text-[11.5px] text-ink-400">Nenhuma linha de custo — adicione impressão, material ou acabamento.</p>}
                    <div className="divide-y divide-white/[0.06]">
                      {liveCalc.lines.map((l, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[11.5px] leading-tight font-semibold text-paper-50">{l.label}</p>
                            {l.detail && <p className="truncate font-mono text-[9.5px] text-ink-400">{l.detail}</p>}
                          </div>
                          <span className="shrink-0 font-mono text-[11.5px] text-cyan-200 tnum">{formatMoney(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {liveCalc && (
                <div className="space-y-1 border-t border-ink-800 bg-ink-950/60 px-4 py-3.5">
                  <div className="flex justify-between text-[11px] text-ink-300">
                    <span>Custo direto</span>
                    <span className="font-mono tnum">{formatMoney(liveCalc.baseCost)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-300">
                    <span>{calcMode === "batch" ? "Lucro alvo" : "Margem"}</span>
                    <span className="font-mono text-emerald-300 tnum">{formatMoney(liveCalc.marginAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-300">
                    <span>Impostos + maquininha</span>
                    <span className="font-mono text-amber-300 tnum">{formatMoney(liveCalc.taxAmount + liveCalc.feeAmount)}</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between border-t border-dashed border-ink-700 pt-2">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-ink-300 uppercase">
                      {calcMode === "batch" ? "Total da tiragem" : "Preço final"}
                    </span>
                    <span className="font-mono text-[21px] leading-none font-semibold text-cyan-300 tnum">
                      {formatMoney(liveCalc.finalPrice)}
                    </span>
                  </div>
                  {calcMode === "batch" && (
                    <p className="text-right font-mono text-[10.5px] text-ink-400 tnum">
                      {formatMoney(liveCalc.unitPrice)} / peça
                    </p>
                  )}
                  {liveCalc.valid === false && (
                    <p className="mt-1.5 rounded-md bg-red-500/15 px-2.5 py-1.5 text-[10.5px] text-red-300">{liveCalc.error}</p>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </Modal>
    </div>
  );
}
