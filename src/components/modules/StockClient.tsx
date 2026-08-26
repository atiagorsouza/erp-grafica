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
import { CategoriasManager } from "@/components/modules/CategoriasManager";
import { cn } from "@/lib/format";
import { formatCEP, formatCNPJ, formatPhone } from "@/lib/validators";
import { focarPrimeiroErro, semErros, validaFornecedor, type ErrosCadastro } from "@/lib/cadastro-validacao";

 
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
  const [tab, setTab] = useState<"materiais" | "movimentos" | "fornecedores" | "compras" | "categorias">("materiais");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [matModal, setMatModal] = useState<null | { edit?: Row }>(null);
  const [movModal, setMovModal] = useState<null | { material?: Row }>(null);
  const [supModal, setSupModal] = useState<null | { edit?: Row }>(null);
  const [errosSup, setErrosSup] = useState<ErrosCadastro>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buyModal, setBuyModal] = useState(false);
  const [buyItems, setBuyItems] = useState<{ materialId: string; quantity: string; unitCost: string }[]>([]);
  const [onlyLow, setOnlyLow] = useState(false);
  const [busca, setBusca] = useState("");

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  /* Campo com máscara: formata enquanto digita e limpa o erro do
     campo assim que o operador mexe nele. Deixar o vermelho aceso
     enquanto ele corrige é ruído. */
  const setMasked = (k: string, fmt: (v: string) => string) => (e: { target: { value: string } }) => {
    const v = fmt(e.target.value);
    setForm((f) => ({ ...f, [k]: v }));
    setErrosSup((x) => (x[k] ? { ...x, [k]: "" } : x));
  };
  const catName = (id: unknown) => materialCats.find((c) => Number(c.id) === Number(id));

  const lowCount = materials.filter((m) => Number(m.stock) <= Number(m.minStock || 0)).length;

  /* Busca do estoque, pensada para o leitor de código de barras.
     O leitor digita o código e dá Enter — então o campo aceita tanto
     texto (nome, SKU, fornecedor) quanto o código bipado. Quando o
     termo é só dígitos e casa exatamente com um barcode, esse material
     vem primeiro: bipar tem que achar UM item, não uma lista. */
  const supName = (id: unknown) => suppliers.find((s) => Number(s.id) === Number(id))?.name;
  const termo = busca.trim().toLowerCase();
  const soDigitos = /^\d{6,20}$/.test(termo);
  const shown = materials
    .filter((m) => {
      if (onlyLow && Number(m.stock) > Number(m.minStock || 0)) return false;
      if (!termo) return true;
      if (soDigitos && String(m.barcode || "") === termo) return true;
      return (
        String(m.name || "").toLowerCase().includes(termo) ||
        String(m.sku || "").toLowerCase().includes(termo) ||
        String(m.barcode || "").includes(termo) ||
        String(m.supplier || "").toLowerCase().includes(termo) ||
        String(supName(m.supplierId) || "").toLowerCase().includes(termo)
      );
    })
    .sort((a, b) => {
      if (!soDigitos) return 0;
      const ea = String(a.barcode || "") === termo ? 0 : 1;
      const eb = String(b.barcode || "") === termo ? 0 : 1;
      return ea - eb;
    });

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
        /* Só dígitos: o leitor às vezes manda espaço no fim, e um
           barcode com espaço nunca casa na busca. */
        barcode: String(form.barcode || "").replace(/\D/g, "") || null,
        sku: form.sku?.trim() || null,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
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

  /* Preenche o endereço pelo CEP, igual ao cadastro de cliente.
     Nunca sobrescreve número e complemento: o ViaCEP não os conhece. */
  async function buscarCepFornecedor(valor: string) {
    const limpo = String(valor || "").replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`/api/cep/${limpo}`);
      if (!r.ok) return;
      const d = (await r.json()) as { street?: string; district?: string; city?: string; state?: string };
      setForm((f) => ({
        ...f,
        street: d.street || f.street || "",
        district: d.district || f.district || "",
        city: d.city || f.city || "",
        state: d.state || f.state || "",
      }));
    } catch {
      /* sem internet ou CEP inexistente: digita à mão */
    } finally {
      setBuscandoCep(false);
    }
  }

  const saveSup = (id?: number) => {
    /* Valida ANTES de chamar a API: erro de digitação vira aviso no
       campo, não erro 422 genérico depois do round-trip. */
    const e = validaFornecedor(form);
    setErrosSup(e);
    if (!semErros(e)) {
      setTimeout(focarPrimeiroErro, 0);
      return;
    }
    return run(async () => {
      const data = {
        name: form.name,
        tradeName: form.tradeName || null,
        document: form.document || null,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        website: form.website || null,
        cep: form.cep || null,
        street: form.street || null,
        number: form.number || null,
        complement: form.complement || null,
        district: form.district || null,
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
      setErrosSup({});
    }, "Fornecedor salvo");
  };

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

  /* ── Ajuda para calcular o rendimento ──────────────────────────
     "Rende quantos" é fácil para resma (500 folhas, está na etiqueta)
     e difícil para tudo que vem em rolo: um vinil de 1,22 m × 50 m dá
     61 m², e essa conta era feita na calculadora do celular — com o
     erro indo direto para o custo de todo produto que usa o material.

     A calculadora aparece só quando a unidade pede, e o resultado
     PREENCHE o campo em vez de ficar num canto: número que o operador
     tem de copiar à mão é número que ele digita errado. */
  const unidade = String(form.unit || "unidade");
  const ehArea = unidade === "metro²";
  const ehComprimento = ["metro", "metro linear", "centímetro"].includes(unidade);
  const ehFolha = ["folha", "resma", "bloco", "cento", "milheiro"].includes(unidade);

  const larguraRolo = Number(form.calcLargura || 0);
  const compRolo = Number(form.calcComprimento || 0);
  const folhasPorPacote = Number(form.calcFolhas || 0);
  const pacotesPorCaixa = Number(form.calcPacotes || 0);

  const rendimentoCalculado = ehArea
    ? larguraRolo > 0 && compRolo > 0
      ? larguraRolo * compRolo
      : null
    : ehFolha
      ? folhasPorPacote > 0
        ? folhasPorPacote * (pacotesPorCaixa > 0 ? pacotesPorCaixa : 1)
        : null
      : ehComprimento
        ? compRolo > 0
          ? compRolo
          : null
        : null;

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
            { value: "categorias", label: "Categorias", count: materialCats.length },
          ]}
        />
        {tab === "materiais" && (
          <button onClick={() => setOnlyLow((v) => !v)} className={cn("focus-ring flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors", onlyLow ? "border-red-300 bg-red-50 text-red-700" : "border-paper-300 bg-paper-50 text-ink-500 hover:border-ink-400")}>
            <Icon name="alert" size={12} />
            Críticos · {lowCount}
          </button>
        )}
      </div>

      {/* ── BUSCA DOS MATERIAIS ──
          Serve para digitar e para bipar: o leitor manda o código e um
          Enter, e o material aparece sozinho. */}
      {tab === "materiais" && (
        <div className="mb-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material, código interno, fornecedor — ou bipe o código de barras"
          />
          {termo && (
            <p className="mt-1.5 font-mono text-[10.5px] text-ink-400">
              {shown.length === 0
                ? soDigitos
                  ? `Nenhum material com o código ${termo}. Cadastre-o em "Novo material".`
                  : "Nada encontrado."
                : `${shown.length} de ${materials.length}`}
            </p>
          )}
        </div>
      )}

      {/* ── MATERIAIS ── */}
      {tab === "materiais" && (
        shown.length === 0 && !termo ? (
          <EmptyState icon="boxes" title="Nenhum material" hint="Cadastre papéis, tintas, etiquetas e insumos com estoque mínimo." />
        ) : shown.length === 0 ? null : (
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

      {/* ── CATEGORIAS ── */}
      {tab === "categorias" && (
        <CategoriasManager
          categorias={materialCats}
          module="material"
          titulo="Categorias de material"
          contagem={materials.reduce<Record<string, number>>((acc, m) => {
            const k = String(m.categoryId ?? "");
            if (k) acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {})}
        />
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
          {/* Código de barras: o leitor age como teclado. Clique no
              campo, bipe a embalagem e ele preenche sozinho — sem
              digitar treze dígitos e sem errar um deles. */}
          <Field label="Código de barras" hint="Clique aqui e bipe a embalagem com o leitor">
            <Input
              mono
              value={form.barcode || ""}
              onChange={set("barcode")}
              placeholder="7891234567890"
            />
          </Field>
          <Field label="Código interno (SKU)" hint="Opcional — se você usa numeração própria">
            <Input mono value={form.sku || ""} onChange={set("sku")} placeholder="PAP-COU-150" />
          </Field>
          <Field label="Categoria">
            <Select value={form.categoryId || ""} onChange={set("categoryId")}>
              <option value="">Sem categoria</option>
              {materialCats.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.icon)} {String(c.name)}</option>)}
            </Select>
          </Field>
          <Field label="Unidade">
            <Select value={form.unit || "unidade"} onChange={set("unit")}>
              {/* A unidade é a que o insumo é CONSUMIDO, não comprada:
                  você compra a resma e gasta a folha. Faltavam medidas
                  que a gráfica usa todo dia — m² para vinil e lona,
                  resma para papel, ml/litro para tinta.

                  Agrupadas para não virar uma lista de 20 itens onde
                  ninguém acha nada. */}
              <optgroup label="Papel e impressão">
                {["folha", "resma", "bloco", "cento", "milheiro"].map((u) => <option key={u}>{u}</option>)}
              </optgroup>
              <optgroup label="Comprimento e área">
                {["metro", "metro²", "metro linear", "centímetro"].map((u) => <option key={u}>{u}</option>)}
              </optgroup>
              <optgroup label="Peso e volume">
                {["kg", "grama", "litro", "ml"].map((u) => <option key={u}>{u}</option>)}
              </optgroup>
              <optgroup label="Embalagem e avulso">
                {["unidade", "par", "jogo", "rolo", "bobina", "pacote", "caixa", "cartela", "tubo", "galão"].map((u) => <option key={u}>{u}</option>)}
              </optgroup>
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
            {/* Calculadora do rendimento — só aparece quando a unidade
                escolhida exige uma conta. */}
            {(ehArea || ehComprimento || ehFolha) && (
              <div className="mt-3 rounded-lg border border-dashed border-cyan-300 bg-white/70 px-3 py-2.5">
                <p className="mb-2 font-mono text-[10px] tracking-wide text-cyan-800 uppercase">
                  {ehArea
                    ? "Não sabe quantos m²? Meça o rolo"
                    : ehFolha
                      ? "Não sabe o total? Conte a embalagem"
                      : "Não sabe o total? Meça o rolo"}
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {ehArea && (
                    <>
                      <Field label="Largura (m)">
                        <Input mono value={form.calcLargura || ""} onChange={set("calcLargura")} placeholder="1,22" />
                      </Field>
                      <Field label="Comprimento (m)">
                        <Input mono value={form.calcComprimento || ""} onChange={set("calcComprimento")} placeholder="50" />
                      </Field>
                    </>
                  )}
                  {ehComprimento && (
                    <Field label="Comprimento do rolo">
                      <Input mono value={form.calcComprimento || ""} onChange={set("calcComprimento")} placeholder="26" />
                    </Field>
                  )}
                  {ehFolha && (
                    <>
                      <Field label="Folhas por pacote">
                        <Input mono value={form.calcFolhas || ""} onChange={set("calcFolhas")} placeholder="500" />
                      </Field>
                      <Field label="Pacotes na caixa" hint="1 se comprar avulso">
                        <Input mono value={form.calcPacotes || ""} onChange={set("calcPacotes")} placeholder="10" />
                      </Field>
                    </>
                  )}
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rendimentoCalculado === null}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          packQuantity: String(Number(rendimentoCalculado?.toFixed(3))),
                        }))
                      }
                    >
                      {rendimentoCalculado !== null
                        ? `Usar ${Number(rendimentoCalculado.toFixed(3)).toLocaleString("pt-BR")}`
                        : "Preencha ao lado"}
                    </Button>
                  </div>
                </div>
                {ehArea && rendimentoCalculado !== null && (
                  <p className="mt-1.5 font-mono text-[10.5px] text-ink-500">
                    {larguraRolo.toLocaleString("pt-BR")} × {compRolo.toLocaleString("pt-BR")} ={" "}
                    <strong className="text-cyan-700">
                      {Number(rendimentoCalculado.toFixed(3)).toLocaleString("pt-BR")} m²
                    </strong>
                  </p>
                )}
              </div>
            )}

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
          {/* Fornecedor de verdade: escolhido do cadastro, não digitado.
              Digitar deixava "Kalunga", "kalunga" e "KALUNGA " como três
              fornecedores diferentes — e nenhum deles com CNPJ ou prazo.
              O campo de texto antigo continua embaixo, só de leitura,
              enquanto houver material não vinculado. */}
          <Field label="Fornecedor" hint={suppliers.length ? "Do cadastro de fornecedores" : "Cadastre em Estoque → Fornecedores"}>
            <Combobox
              value={form.supplierId || ""}
              onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              placeholder={suppliers.length ? "Selecionar…" : "Nenhum fornecedor cadastrado"}
              options={suppliers.map((s) => ({ value: String(s.id), label: String(s.tradeName || s.name) }))}
            />
          </Field>
          {form.supplier && !form.supplierId && (
            <Field label="Fornecedor antigo (texto)" hint="Escolha acima para vincular ao cadastro">
              <Input value={form.supplier} disabled />
            </Field>
          )}
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
        <div className="space-y-4">
          {/* IDENTIFICAÇÃO */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Razão social" required erro={errosSup.name}>
              <Input value={form.name || ""} onChange={(e) => { set("name")(e); setErrosSup((x) => (x.name ? { ...x, name: "" } : x)); }} placeholder="Papelaria Central LTDA" />
            </Field>
            <Field label="Nome fantasia" hint="Como você chama no dia a dia">
              <Input value={form.tradeName || ""} onChange={set("tradeName")} placeholder="Papelaria Central" />
            </Field>
            <Field label="CNPJ" erro={errosSup.document}>
              <Input mono value={form.document || ""} onChange={setMasked("document", formatCNPJ)} placeholder="00.000.000/0000-00" inputMode="numeric" />
            </Field>
            <Field label="Inscrição estadual" hint="Opcional">
              <Input mono value={form.stateRegistration || ""} onChange={set("stateRegistration")} />
            </Field>
          </div>

          {/* CONTATO */}
          <div className="border-t border-paper-200 pt-3.5">
            <p className="mb-2.5 text-[11.5px] font-bold text-ink-700">Contato</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pessoa de contato" hint="Com quem você fala">
                <Input value={form.contactName || ""} onChange={set("contactName")} placeholder="Marcos — vendas" />
              </Field>
              <Field label="E-mail" erro={errosSup.email}>
                <Input value={form.email || ""} onChange={(e) => { set("email")(e); setErrosSup((x) => (x.email ? { ...x, email: "" } : x)); }} placeholder="vendas@fornecedor.com.br" inputMode="email" />
              </Field>
              <Field label="Telefone" erro={errosSup.phone}>
                <Input mono value={form.phone || ""} onChange={setMasked("phone", formatPhone)} placeholder="(21) 2038-3504" inputMode="tel" />
              </Field>
              <Field label="WhatsApp" erro={errosSup.whatsapp}>
                <Input mono value={form.whatsapp || ""} onChange={setMasked("whatsapp", formatPhone)} placeholder="(21) 97886-9414" inputMode="tel" />
              </Field>
              <Field label="Site" className="sm:col-span-2" erro={errosSup.website}>
                <Input value={form.website || ""} onChange={(e) => { set("website")(e); setErrosSup((x) => (x.website ? { ...x, website: "" } : x)); }} placeholder="fornecedor.com.br" />
              </Field>
            </div>
          </div>

          {/* ENDEREÇO — não existia; sem ele não dá para conferir frete
              nem saber de onde vem a mercadoria. */}
          <div className="border-t border-paper-200 pt-3.5">
            <p className="mb-2.5 text-[11.5px] font-bold text-ink-700">Endereço</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field label="CEP" className="sm:col-span-2" hint={buscandoCep ? "buscando…" : "Preenche sozinho"} erro={errosSup.cep}>
                <Input
                  mono
                  value={form.cep || ""}
                  onChange={(e) => {
                    const v = formatCEP(e.target.value);
                    setForm((f) => ({ ...f, cep: v }));
                    setErrosSup((x) => (x.cep ? { ...x, cep: "" } : x));
                    if (v.replace(/\D/g, "").length === 8) void buscarCepFornecedor(v);
                  }}
                  placeholder="21810-000"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Rua / Logradouro" className="sm:col-span-4">
                <Input value={form.street || ""} onChange={set("street")} />
              </Field>
              <Field label="Número" className="sm:col-span-1">
                <Input mono value={form.number || ""} onChange={set("number")} placeholder="910" />
              </Field>
              <Field label="Complemento" className="sm:col-span-2" hint="Sala, galpão, fundos">
                <Input value={form.complement || ""} onChange={set("complement")} placeholder="Galpão 2" />
              </Field>
              <Field label="Bairro" className="sm:col-span-3">
                <Input value={form.district || ""} onChange={set("district")} />
              </Field>
              <Field label="Cidade" className="sm:col-span-4">
                <Input value={form.city || ""} onChange={set("city")} />
              </Field>
              <Field label="UF" className="sm:col-span-2" erro={errosSup.state}>
                <Input
                  mono
                  value={form.state || ""}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }));
                    setErrosSup((x) => (x.state ? { ...x, state: "" } : x));
                  }}
                  placeholder="RJ"
                  maxLength={2}
                />
              </Field>
            </div>
          </div>

          {/* COMERCIAL */}
          <div className="border-t border-paper-200 pt-3.5">
            <p className="mb-2.5 text-[11.5px] font-bold text-ink-700">Condições comerciais</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Condição de pagamento">
                <Input value={form.paymentTerms || ""} onChange={set("paymentTerms")} placeholder="28 dias" />
              </Field>
              <Field label="Prazo de entrega" hint="Em dias" erro={errosSup.leadTimeDays}>
                <Input mono value={form.leadTimeDays || "0"} onChange={(e) => { set("leadTimeDays")(e); setErrosSup((x) => (x.leadTimeDays ? { ...x, leadTimeDays: "" } : x)); }} inputMode="numeric" />
              </Field>
              <Field label="Ativo?">
                <Select value={form.active ?? "true"} onChange={set("active")}><option value="true">Sim</option><option value="false">Não</option></Select>
              </Field>
              <Field label="Observações" className="sm:col-span-3" hint="O que você precisa lembrar deste fornecedor">
                <Textarea value={form.notes || ""} onChange={set("notes")} placeholder="Pedido mínimo R$ 300. Entrega só às terças." />
              </Field>
            </div>
          </div>
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
