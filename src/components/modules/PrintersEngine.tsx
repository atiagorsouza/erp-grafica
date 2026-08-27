"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import {
  categoryCostPerPage,
  consumableCostPerPage,
  computePrintSheetCost,
  formatMoney,
  type ColorMode,
} from "@/lib/pricing";
import {
  Badge,
  Button,
  Card,
  Combobox,
  Field,
  IconButton,
  InkBar,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  StatusBadge,
  Textarea,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

 
type Row = Record<string, any>;

const SLUG = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const MODE_LABEL: Record<string, string> = {
  pagina: "por folha",
  etiqueta: "por etiqueta",
  grama: "por grama",
};

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

/* ────────────────────────────────────────────────────────────────
   FLUXO DO MOTOR — diagrama no topo
   ──────────────────────────────────────────────────────────────── */
function EngineFlow() {
  const steps = [
    { k: "1", t: "Categoria", d: "define a lógica de custo", c: "var(--color-proc-c)" },
    { k: "2", t: "Consumíveis", d: "toners, tintas, cilindros", c: "var(--color-proc-m)" },
    { k: "3", t: "Impressora", d: "herda × fator de ajuste", c: "var(--color-proc-y)" },
    { k: "4", t: "Produto", d: "impressão + material + acabamento", c: "#10b981" },
  ];
  return (
    <div className="reveal mb-6 grid grid-cols-2 gap-2 rounded-xl border border-paper-200 bg-ink-900 p-4 shadow-card lg:grid-cols-4">
      {steps.map((s, i) => (
        <div key={s.k} className="relative flex items-center gap-3 rounded-lg bg-white/[0.04] px-3.5 py-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-semibold text-ink-900"
            style={{ background: s.c }}
          >
            {s.k}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] leading-tight font-bold text-white">{s.t}</p>
            <p className="truncate text-[10.5px] text-ink-300">{s.d}</p>
          </div>
          {i < steps.length - 1 && (
            <Icon name="chevron-right" size={14} className="absolute top-1/2 -right-2.5 hidden -translate-y-1/2 text-ink-500 lg:block" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   SIMULADOR — transparência total do cálculo por folha
   ──────────────────────────────────────────────────────────────── */
function Simulator({ categories, consumables, printers, formats }: {
  categories: Row[];
  consumables: Row[];
  printers: Row[];
  formats: Row[];
}) {
  const [catId, setCatId] = useState<string>(categories[0] ? String(categories[0].id) : "");
  const cat = categories.find((c) => String(c.id) === catId);
  const catFormats = formats.filter((f) => String(f.categoryId) === catId);
  const catPrinters = printers.filter((p) => String(p.categoryId) === catId);
  const [fmtId, setFmtId] = useState<string>("");
  const [prtId, setPrtId] = useState<string>("");
  const [mode, setMode] = useState<ColorMode>("color");

  const fmt = catFormats.find((f) => String(f.id) === fmtId) ?? catFormats[0];
  const prt = catPrinters.find((p) => String(p.id) === prtId);
  const cons = consumables.filter((c) => String(c.categoryId) === catId);

  /* Era `useMemo([cat, fmt, prt, cons, mode])`. O React Compiler recusava
     otimizar o componente inteiro ("existing memoization could not be
     preserved") porque `fmt`/`prt` saem de `.find()` sobre arrays
     recalculados a cada render. Resultado na prática: o componente
     perdia TODA a memoização automática por causa de um useMemo manual
     que não paga por si — a conta abaixo é aritmética simples.
     Sem o useMemo, o compilador volta a memoizar o componente todo. */
  const calc = (() => {
    if (!cat) return null;
    const referenceCoverage = Math.max(num(cat.referenceCoverage, 0.05), 0.0001);
    const coverage = Math.max(num(fmt?.inkCoverage, referenceCoverage), 0);
    const override = num(fmt?.printCostOverride);
    const multiplier = num(prt?.costMultiplier, 1);
    if (override > 0) {
      return {
        override: true,
        lines: [
          { label: "Tabela comercial interna", detail: `${fmt?.name ?? "formato"} · custo manual/face`, amount: override },
          { label: `Impressora ${prt?.name ?? "(categoria)"}`, detail: `× ${multiplier.toFixed(2)} de ajuste`, amount: override * multiplier - override },
        ],
        total: override * multiplier,
      };
    }
    const applicable = cons.filter((c) =>
      mode === "mono" ? c.appliesTo === "mono" || c.appliesTo === "both" : c.appliesTo === "color" || c.appliesTo === "both"
    );
    const colorant = applicable.filter((c) => (c.costRole || "colorant") === "colorant").reduce((s, c) => s + consumableCostPerPage(c), 0);
    const mechanical = applicable.filter((c) => (c.costRole || "colorant") !== "colorant").reduce((s, c) => s + consumableCostPerPage(c), 0);
    const fixed = num(cat.fixedCostPerPage);
    const waste = num(cat.wasteFactor);
    const area = Math.max(num(fmt?.areaFactor, 1), 0);
    const coverageFactor = coverage / referenceCoverage;
    const raw = (colorant * coverageFactor + mechanical + fixed) * area;
    const withWaste = raw * (1 + waste);
    const total = withWaste * multiplier;
    const perSheet = computePrintSheetCost({ printer: prt, category: cat, consumables: cons, format: fmt, colorMode: mode });
    return {
      override: false,
      lines: [
        { label: "Colorantes (tinta/toner)", detail: `cobertura ${(coverage * 100).toFixed(0)}% ÷ ref. ${(referenceCoverage * 100).toFixed(0)}% = ×${coverageFactor.toFixed(2)}`, amount: colorant * coverageFactor },
        { label: "Mecânica (cilindro/fusora)", detail: "custo técnico por folha", amount: mechanical },
        { label: "Custo fixo da categoria", detail: "energia + manutenção + depreciação", amount: fixed },
        { label: `Área do formato ${fmt?.name ?? "A4"}`, detail: `× ${area.toFixed(2)} sobre o A4`, amount: raw - (colorant * coverageFactor + mechanical + fixed) },
        { label: "Fator de perda", detail: `+ ${(waste * 100).toFixed(1)}% (provas/resíduo)`, amount: withWaste - raw },
        { label: "Ajuste da impressora", detail: prt ? `${prt.name} × ${multiplier.toFixed(2)}` : "usando média da categoria", amount: total - withWaste },
      ],
      total: perSheet || total,
    };
  })();

  return (
    <Card className="reveal reveal-1 mb-6 overflow-hidden" pad={false}>
      <div className="halftone-light flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 bg-ink-900 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-cyan-300 uppercase">
            Simulador ao vivo · caixa-preta aberta
          </p>
          <h3 className="display-expanded mt-0.5 text-[16px] font-bold text-white">Custo real de 1 folha impressa</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-[26px] leading-none font-semibold text-cyan-300 tnum">
            {calc ? formatMoney(calc.total) : "—"}
          </p>
          <p className="mt-1 font-mono text-[9.5px] tracking-wider text-ink-400 uppercase">
            {mode === "color" ? "colorido" : "preto & branco"} · {fmt?.name ?? "sem formato"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3.5">
          <Field label="Categoria">
            <Combobox
              value={catId}
              onChange={(v) => { setCatId(v); setFmtId(""); setPrtId(""); }}
              options={categories.map((c) => ({ value: String(c.id), label: `${c.icon} ${c.name}`, hint: MODE_LABEL[String(c.measureMode)] }))}
            />
          </Field>
          <Field label="Formato">
            <Combobox
              value={fmt ? String(fmt.id) : ""}
              onChange={setFmtId}
              placeholder={catFormats.length ? "Escolher formato…" : "Sem formatos"}
              options={catFormats.map((f) => ({
                value: String(f.id),
                label: String(f.name),
                hint: num(f.printCostOverride) > 0 ? formatMoney(num(f.printCostOverride)) : `${(num(f.inkCoverage) * 100).toFixed(0)}% tinta`,
              }))}
            />
          </Field>
          <Field label="Impressora" hint="opcional">
            <Combobox
              value={prtId}
              onChange={setPrtId}
              placeholder="Média da categoria"
              options={catPrinters.map((p) => ({ value: String(p.id), label: String(p.name), hint: `×${num(p.costMultiplier, 1).toFixed(2)}` }))}
            />
          </Field>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "mono", label: "P&B" },
              { value: "color", label: "Colorido" },
            ]}
          />
        </div>
        <div>
          {calc ? (
            <div>
              <div className="divide-y divide-dashed divide-paper-300 rounded-lg border border-paper-200 bg-white px-4">
                {calc.lines.map((l, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-ink-800">{l.label}</p>
                      <p className="truncate font-mono text-[10.5px] text-ink-400">{l.detail}</p>
                    </div>
                    <span className={cn("shrink-0 font-mono text-[12.5px] tnum", l.amount < 0.0001 && l.amount > -0.0001 ? "text-ink-300" : "font-semibold text-ink-900")}>
                      {l.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(l.amount))}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-400">
                {calc.override
                  ? "Este formato usa tabela comercial interna (printCostOverride) — o motor dispensa o cálculo técnico."
                  : "Fórmula: (colorantes × fator de cobertura + mecânica + fixo) × área × faces × (1 + perda) × ajuste da máquina."}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-[12.5px] text-ink-400">Crie uma categoria para simular.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────
   MÓDULO PRINCIPAL
   ──────────────────────────────────────────────────────────────── */
export function PrintersEngine({ categories, consumables, printers, formats }: {
  categories: Row[];
  consumables: Row[];
  printers: Row[];
  formats: Row[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [expanded, setExpanded] = useState<number | null>(categories[0] ? Number(categories[0].id) : null);
  const [saving, setSaving] = useState(false);

  const [catModal, setCatModal] = useState<null | { edit?: Row }>(null);
  const [consModal, setConsModal] = useState<null | { categoryId: number; edit?: Row }>(null);
  const [prtModal, setPrtModal] = useState<null | { categoryId: number; mode: string; edit?: Row }>(null);
  const [fmtModal, setFmtModal] = useState<null | { categoryId: number; edit?: Row }>(null);

  /* Peças de desgaste marcadas como colorante.
     `costRole` tem default "colorant": quem cadastra sem escolher faz o
     cilindro escalar com a cobertura de tinta, o que não acontece na
     máquina — ele se gasta por passagem de papel. O erro é invisível na
     cobertura de referência e só aparece em arte com muita ou pouca
     tinta, então precisa de aviso explícito. */
  const suspeitasMecanicas = useMemo(
    () =>
      consumables.filter(
        (c) =>
          String(c.costRole || "colorant") === "colorant" &&
          /cilindro|fusor|fus[oó]ra|cabe[çc]a|correia|belt|drum|l[âa]mina|rolo/i.test(String(c.name || ""))
      ),
    [consumables]
  );

  const [form, setForm] = useState<Record<string, string>>({});
  const open = (data: Record<string, string>) => setForm(data);
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn: () => Promise<unknown>) {
    setSaving(true);
    try {
      await fn();
      toast.success("Salvo com sucesso");
      refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const saveCat = (id?: number) =>
    run(async () => {
      const data = {
        name: form.name,
        description: form.description,
        icon: form.icon || "🖨️",
        color: form.color || "#0891b2",
        measureMode: form.measureMode || "pagina",
        unitLabel: form.unitLabel || "folha",
        slug: SLUG(form.name || ""),
        fixedCostPerPage: Number(form.fixedCostPerPage || 0).toFixed(6),
        referenceCoverage: (Number(form.referenceCoverage || 5) / 100).toFixed(4),
        wasteFactor: (Number(form.wasteFactor || 0) / 100).toFixed(4),
        defaultMargin: (Number(form.defaultMargin || 40) / 100).toFixed(4),
      };
      if (id) await mutate("categories", "update", data, id);
      else await mutate("categories", "create", data);
      setCatModal(null);
    });

  const saveCons = (categoryId: number, id?: number) =>
    run(async () => {
      const data = {
        categoryId,
        name: form.name,
        unitCost: Number(form.unitCost || 0).toFixed(4),
        yieldPages: Number(form.yieldPages || 0),
        appliesTo: form.appliesTo || "both",
        costRole: form.costRole || "colorant",
      };
      if (id) await mutate("consumables", "update", data, id);
      else await mutate("consumables", "create", data);
      setConsModal(null);
    });

  const savePrt = (categoryId: number, mode: string, id?: number) =>
    run(async () => {
      const data = {
        categoryId,
        name: form.name,
        brand: form.brand,
        model: form.model,
        status: form.status || "ativa",
        costMultiplier: Number(form.costMultiplier || 1).toFixed(4),
        hourlyRate: Number(form.hourlyRate || 0).toFixed(4),
        maxFormat: mode === "grama" ? null : form.maxFormat || null,
        buildVolume: mode === "grama" ? form.buildVolume || null : null,
        notes: form.notes,
      };
      if (id) await mutate("printers", "update", data, id);
      else await mutate("printers", "create", data);
      setPrtModal(null);
    });

  const saveFmt = (categoryId: number, id?: number) =>
    run(async () => {
      const data = {
        categoryId,
        name: form.name,
        widthMm: String(Number(form.widthMm || 0)),
        heightMm: String(Number(form.heightMm || 0)),
        areaFactor: String(Number(form.areaFactor || 1)),
        inkCoverage: String(Number(form.inkCoverage || 0) / 100),
        printCostOverride: String(Number(form.printCostOverride || 0)),
        isPhoto: form.isPhoto === "true",
      };
      if (id) await mutate("print-formats", "update", data, id);
      else await mutate("print-formats", "create", data);
      setFmtModal(null);
    });

  const del = (resource: string, id: number, msg: string) => async () => {
    if (!confirm(msg)) return;
    await run(() => mutate(resource, "delete", undefined, id));
  };

  return (
    <div>
      <PageHeader
        eyebrow="O motor do sistema · suprimentos & mecânica"
        title="Impressoras & Tintas"
        icon="printer"
        description="A categoria define a lógica de custo por página. A impressora herda essa lógica com um fator de ajuste. Cada centavo é decomposto — sem caixa-preta."
        actions={
          <Button icon="plus" onClick={() => { open({ measureMode: "pagina", unitLabel: "folha", icon: "🖨️", color: "#0891b2", defaultMargin: "40", referenceCoverage: "5" }); setCatModal({}); }}>
            Nova categoria
          </Button>
        }
      />

      {/* Aviso de cadastro: peça de desgaste marcada como colorante
          distorce o custo sem que nada pareça errado na tela. */}
      {suspeitasMecanicas.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50/60">
          <div className="flex items-start gap-2.5">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-amber-900">
                {suspeitasMecanicas.length === 1
                  ? "1 consumível parece peça de desgaste, mas está como colorante"
                  : `${suspeitasMecanicas.length} consumíveis parecem peça de desgaste, mas estão como colorantes`}
              </p>
              <p className="mt-0.5 text-[11.5px] text-amber-800">
                {suspeitasMecanicas.map((c) => String(c.name)).join(", ")} — cilindro, fusor e
                correia se gastam por folha que passa, não pela quantidade de tinta. Como
                colorante, o custo sobe em arte pesada e cai em texto leve, o que não acontece na
                máquina. Edite e marque “Mecânica (fixo por folha)”.
              </p>
            </div>
          </div>
        </Card>
      )}

      <EngineFlow />
      <Simulator categories={categories} consumables={consumables} printers={printers} formats={formats} />

      {/* Categorias */}
      <div className="space-y-4">
        {categories.map((cat) => {
          const cons = consumables.filter((c) => Number(c.categoryId) === Number(cat.id));
          const prts = printers.filter((p) => Number(p.categoryId) === Number(cat.id));
          const fmts = formats.filter((f) => Number(f.categoryId) === Number(cat.id));
          const mono = categoryCostPerPage(cat, cons, "mono");
          const color = categoryCostPerPage(cat, cons, "color");
          const mode = String(cat.measureMode || "pagina");
          const colorHex = String(cat.color || "#0891b2");
          const isOpen = expanded === Number(cat.id);
          const consTotal = cons.reduce((s, c) => s + consumableCostPerPage(c), 0) || 1;

          return (
            <Card key={String(cat.id)} className="reveal overflow-hidden p-0">
              {/* Header da categoria */}
              <button
                onClick={() => setExpanded(isOpen ? null : Number(cat.id))}
                className="flex w-full cursor-pointer flex-wrap items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-paper-100/60"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[22px] shadow-card" style={{ background: `${colorHex}1c` }}>
                  {String(cat.icon || "🖨️")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <h2 className="display-expanded text-[16.5px] font-bold text-ink-900">{String(cat.name)}</h2>
                    <Badge tone="cyan">{MODE_LABEL[mode]}</Badge>
                    {mode === "grama" && <Badge tone="yellow">sem formato de papel</Badge>}
                  </span>
                  {cat.description && <span className="mt-0.5 block truncate text-[12px] text-ink-500">{String(cat.description)}</span>}
                </span>
                <span className="hidden items-center gap-5 md:flex">
                  <span className="text-right">
                    <span className="block font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">P&B / {String(cat.unitLabel || "folha")}</span>
                    <span className="block font-mono text-[15px] font-semibold text-ink-900 tnum">{formatMoney(mono)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">Cor / {String(cat.unitLabel || "folha")}</span>
                    <span className="block font-mono text-[15px] font-semibold tnum" style={{ color: colorHex }}>{formatMoney(color)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">margem</span>
                    <span className="block font-mono text-[15px] font-semibold text-ink-900 tnum">{(num(cat.defaultMargin) * 100).toFixed(0)}%</span>
                  </span>
                </span>
                <Icon name="chevron-down" size={17} className={cn("shrink-0 text-ink-400 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="animate-fade-up border-t border-paper-200 bg-paper-100/40 px-5 py-5">
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
                    {/* Consumíveis — 3D não usa: filamento é material do estoque */}
                    {mode === "grama" ? (
                      <section>
                        <div className="mb-2.5 flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                            <Icon name="droplet" size={13} />
                            Filamento & manutenção
                          </h3>
                        </div>
                        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-4 py-5 text-[12.5px] leading-relaxed text-ink-600">
                          <p className="font-semibold text-ink-800">Impressão 3D não usa consumíveis de impressora.</p>
                          <p className="mt-1.5">
                            O filamento é <strong>Material</strong> — cadastre e reponha no <strong>Estoque</strong>; ele entra no custo do produto pela linha <em>“Material”</em> (gramas × preço do rolo).
                          </p>
                          <p className="mt-1.5">
                            A máquina cobra pelas horas: configure o <strong>valor-hora</strong> na impressora e os <strong>minutos por peça</strong> no produto (linha <em>“Tempo de máquina”</em>). Bico e manutenção ficam embutidos no valor-hora.
                          </p>
                        </div>
                      </section>
                    ) : (
                    <section>
                      <div className="mb-2.5 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                          <Icon name="droplet" size={13} />
                          Consumíveis & custo por página
                        </h3>
                        <Button size="xs" variant="outline" icon="plus" onClick={() => { open({ appliesTo: "both", costRole: "colorant" }); setConsModal({ categoryId: Number(cat.id) }); }}>
                          Consumível
                        </Button>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-paper-200 bg-white">
                        {cons.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-ink-400">Nenhum consumível cadastrado.</p>}
                        {cons.map((c) => {
                          const perPage = consumableCostPerPage(c);
                          const role = String(c.costRole || "colorant");
                          return (
                            <div key={String(c.id)} className="group flex items-center gap-3 border-b border-paper-200/70 px-4 py-2.5 last:border-0 hover:bg-paper-100/50">
                              <span className={cn("h-8 w-1.5 shrink-0 rounded-full", role === "colorant" ? "bg-proc-m" : "bg-ink-400")} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12.5px] font-semibold text-ink-800">{String(c.name)}</p>
                                <div className="mt-1 flex items-center gap-2">
                                  <InkBar percent={(perPage / consTotal) * 100} color={role === "colorant" ? colorHex : "#94a3b8"} height={4} className="max-w-[140px]" />
                                  <span className="font-mono text-[10px] text-ink-400 tnum">
                                    {formatMoney(num(c.unitCost))} ÷ {Number(c.yieldPages).toLocaleString("pt-BR")} {mode === "grama" ? "g" : "páginas"}
                                  </span>
                                </div>
                              </div>
                              <Badge tone={c.appliesTo === "color" ? "magenta" : c.appliesTo === "mono" ? "ink" : "neutral"}>
                                {c.appliesTo === "both" ? "P&B+cor" : String(c.appliesTo)}
                              </Badge>
                              <span className="w-[86px] shrink-0 text-right font-mono text-[12px] font-semibold text-ink-900 tnum">
                                {formatMoney(perPage)}<span className="text-[9px] font-normal text-ink-400">/pg</span>
                              </span>
                              <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <IconButton size="sm" name="pencil" label="Editar" onClick={() => { open({ name: String(c.name), unitCost: String(c.unitCost), yieldPages: String(c.yieldPages), appliesTo: String(c.appliesTo), costRole: role }); setConsModal({ categoryId: Number(cat.id), edit: c }); }} />
                                <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={del("consumables", Number(c.id), "Excluir consumível?")} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 font-mono text-[10px] text-ink-400">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-proc-m align-middle" />colorante (escala com cobertura)
                        <span className="ml-3 mr-2 inline-block h-1.5 w-1.5 rounded-full bg-ink-400 align-middle" />mecânica (custo fixo por folha)
                      </p>
                    </section>
                    )}

                    <div className="space-y-5">
                      {/* Impressoras */}
                      <section>
                        <div className="mb-2.5 flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                            <Icon name="printer" size={13} />
                            Máquinas
                          </h3>
                          <Button size="xs" variant="outline" icon="plus" onClick={() => { open({ status: "ativa", costMultiplier: "1", hourlyRate: "0" }); setPrtModal({ categoryId: Number(cat.id), mode }); }}>
                            Impressora
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {prts.length === 0 && <p className="col-span-2 rounded-lg border border-dashed border-paper-300 px-4 py-5 text-center text-[12px] text-ink-400">Nenhuma máquina nesta categoria.</p>}
                          {prts.map((p) => (
                            <div key={String(p.id)} className="group relative rounded-lg border border-paper-200 bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-pop">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] leading-tight font-bold text-ink-900">{String(p.name)}</p>
                                <StatusBadge value={String(p.status)} />
                              </div>
                              <p className="mt-0.5 truncate text-[10.5px] text-ink-400">
                                {p.brand ? `${p.brand} · ` : ""}{String(p.model || "—")}
                              </p>
                              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-paper-200 pt-2">
                                <span className="font-mono text-[10px] text-ink-500">
                                  {mode === "grama" ? `🧊 ${String(p.buildVolume || "—")}` : `📐 ${String(p.maxFormat || "A4")}`}
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-ink-800 tnum">
                                  ×{num(p.costMultiplier, 1).toFixed(2)}
                                  <span className="ml-1 font-normal text-ink-400">ajuste</span>
                                </span>
                              </div>
                              <span className="absolute right-2 bottom-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <IconButton size="sm" name="pencil" label="Editar" onClick={() => { open({ name: String(p.name), brand: String(p.brand || ""), model: String(p.model || ""), status: String(p.status), costMultiplier: String(p.costMultiplier), hourlyRate: String(p.hourlyRate ?? 0), maxFormat: String(p.maxFormat || ""), buildVolume: String(p.buildVolume || ""), notes: String(p.notes || "") }); setPrtModal({ categoryId: Number(cat.id), mode, edit: p }); }} />
                                <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={del("printers", Number(p.id), "Excluir impressora?")} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Formatos */}
                      <section>
                        <div className="mb-2.5 flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                            <Icon name="ruler" size={13} />
                            Formatos & cobertura
                          </h3>
                          <Button size="xs" variant="outline" icon="plus" onClick={() => { open({ areaFactor: "1", inkCoverage: "5" }); setFmtModal({ categoryId: Number(cat.id) }); }}>
                            Formato
                          </Button>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-paper-200 bg-white">
                          {fmts.length === 0 && <p className="px-4 py-5 text-center text-[12px] text-ink-400">{mode === "grama" ? "3D usa faixas de peso como formato." : "Nenhum formato cadastrado."}</p>}
                          {fmts.map((f) => (
                            <div key={String(f.id)} className="group flex items-center gap-3 border-b border-paper-200/70 px-4 py-2 last:border-0 hover:bg-paper-100/50">
                              <span className="flex h-7 min-w-9 items-center justify-center rounded border border-paper-300 bg-paper-100 px-1 font-mono text-[9.5px] font-semibold text-ink-600">
                                {String(f.name)}
                              </span>
                              <span className="hidden font-mono text-[10.5px] text-ink-400 tnum sm:block">
                                {num(f.widthMm)}×{num(f.heightMm)}mm
                              </span>
                              <span className="flex-1" />
                              <Badge tone="neutral">área ×{num(f.areaFactor, 1).toFixed(2)}</Badge>
                              {num(f.printCostOverride) > 0 ? (
                                <span className="font-mono text-[11.5px] font-semibold text-proc-c-strong tnum">{formatMoney(num(f.printCostOverride))}<span className="text-[9px] font-normal text-ink-400">/face</span></span>
                              ) : (
                                <Badge tone="blue">{(num(f.inkCoverage) * 100).toFixed(0)}% tinta</Badge>
                              )}
                              {f.isPhoto && <Badge tone="yellow">foto</Badge>}
                              <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <IconButton size="sm" name="pencil" label="Editar" onClick={() => { open({ name: String(f.name), widthMm: String(f.widthMm), heightMm: String(f.heightMm), areaFactor: String(f.areaFactor), inkCoverage: String(num(f.inkCoverage) * 100), printCostOverride: String(f.printCostOverride), isPhoto: String(!!f.isPhoto) }); setFmtModal({ categoryId: Number(cat.id), edit: f }); }} />
                                <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={del("print-formats", Number(f.id), "Excluir formato?")} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>

                  {/* Rodapé da categoria */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 pt-3.5">
                    <p className="font-mono text-[10.5px] text-ink-400 tnum">
                      fixo {formatMoney(num(cat.fixedCostPerPage))}/pg · perda {(num(cat.wasteFactor) * 100).toFixed(1)}% · cobertura ref. {(num(cat.referenceCoverage, 0.05) * 100).toFixed(0)}%
                    </p>
                    <div className="flex gap-1.5">
                      <Button size="xs" variant="ghost" icon="pencil" onClick={() => { open({ name: String(cat.name), description: String(cat.description || ""), icon: String(cat.icon || "🖨️"), color: String(cat.color || "#0891b2"), measureMode: mode, unitLabel: String(cat.unitLabel || "folha"), fixedCostPerPage: String(cat.fixedCostPerPage), referenceCoverage: String(num(cat.referenceCoverage, 0.05) * 100), wasteFactor: String(num(cat.wasteFactor) * 100), defaultMargin: String(num(cat.defaultMargin, 0.4) * 100) }); setCatModal({ edit: cat }); }}>
                        Editar
                      </Button>
                      <Button size="xs" variant="ghost" icon="trash" className="text-red-700 hover:bg-red-50" onClick={del("categories", Number(cat.id), "Excluir categoria e TODOS os consumíveis, máquinas e formatos dela?")}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {categories.length === 0 && (
          <Card className="py-10 text-center text-[13px] text-ink-400">
            Nenhuma categoria de impressora. Crie a primeira para ligar o motor de precificação.
          </Card>
        )}
      </div>

      {/* ── MODAIS ── */}
      <Modal
        open={!!catModal}
        onClose={() => setCatModal(null)}
        title={catModal?.edit ? "Editar categoria" : "Nova categoria de impressora"}
        subtitle="A categoria carrega a lógica de custo: modo de medição, custo fixo, perda e margem padrão."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCatModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => saveCat(catModal?.edit ? Number(catModal.edit.id) : undefined)} icon="check">
              Salvar categoria
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2">
            <Input value={form.name || ""} onChange={set("name")} placeholder="Ex.: Laser, Jato de Tinta, DTF…" />
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <Input value={form.description || ""} onChange={set("description")} placeholder="Ex.: Laser colorida (Konica C284-e)" />
          </Field>
          <Field label="Ícone">
            <Input value={form.icon || ""} onChange={set("icon")} placeholder="🖨️" />
          </Field>
          <Field label="Cor de identificação">
            <input type="color" value={form.color || "#0891b2"} onChange={set("color")} className="focus-ring h-9.5 w-full cursor-pointer rounded-lg border border-paper-300 bg-white p-1" />
          </Field>
          <Field label="Modo de medição" hint="define COMO o custo é calculado">
            <Select value={form.measureMode || "pagina"} onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, measureMode: v, unitLabel: v === "etiqueta" ? "etiqueta" : v === "grama" ? "grama" : "folha" }));
            }}>
              <option value="pagina">por folha (A4/A3/fotos)</option>
              <option value="etiqueta">por etiqueta (ribbon + rolo)</option>
              <option value="grama">por grama (filamento 3D)</option>
            </Select>
          </Field>
          <Field label="Unidade exibida">
            <Input value={form.unitLabel || ""} onChange={set("unitLabel")} placeholder="folha | etiqueta | grama" />
          </Field>
          <Field label="Custo fixo por página (R$)" hint="energia + manutenção + depreciação">
            <Input mono value={form.fixedCostPerPage || ""} onChange={set("fixedCostPerPage")} placeholder="0.012" />
          </Field>
          <Field label="Cobertura de referência (%)" hint="Laser: 5% · Foto: 100%">
            <Input mono value={form.referenceCoverage || ""} onChange={set("referenceCoverage")} placeholder="5" />
          </Field>
          <Field label="Fator de perda (%)" hint="provas, resíduo, acerto">
            <Input mono value={form.wasteFactor || ""} onChange={set("wasteFactor")} placeholder="5" />
          </Field>
          <Field label="Margem padrão (%)" hint="sugestão para produtos">
            <Input mono value={form.defaultMargin || ""} onChange={set("defaultMargin")} placeholder="40" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!consModal}
        onClose={() => setConsModal(null)}
        title={consModal?.edit ? "Editar consumível" : "Novo consumível"}
        subtitle="Custo por página = preço do insumo ÷ rendimento. Colorantes escalam com a cobertura de tinta."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => saveCons(consModal!.categoryId, consModal?.edit ? Number(consModal.edit.id) : undefined)} icon="check">
              Salvar consumível
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2">
            <Input value={form.name || ""} onChange={set("name")} placeholder="Ex.: Toner Preto TN321K" />
          </Field>
          <Field label="Custo do insumo (R$)">
            <Input mono value={form.unitCost || ""} onChange={set("unitCost")} placeholder="260.00" />
          </Field>
          <Field label="Rendimento" hint="páginas · metros (ribbon) · gramas (3D)">
            <Input mono value={form.yieldPages || ""} onChange={set("yieldPages")} placeholder="27000" />
          </Field>
          <Field label="Aplica-se a">
            <Select value={form.appliesTo || "both"} onChange={set("appliesTo")}>
              <option value="both">P&B e Colorido</option>
              <option value="mono">Somente P&B</option>
              <option value="color">Somente Colorido</option>
            </Select>
          </Field>
          <Field label="Papel no custo">
            <Select value={form.costRole || "colorant"} onChange={set("costRole")}>
              <option value="colorant">Colorante (escala com cobertura)</option>
              <option value="mechanical">Mecânica (fixo por folha)</option>
            </Select>
          </Field>
          {Number(form.unitCost || 0) > 0 && Number(form.yieldPages || 0) > 0 && (
            <p className="rounded-lg bg-proc-c-soft px-3 py-2.5 font-mono text-[12px] text-proc-c-strong tnum sm:col-span-2">
              → custo resultante: {formatMoney(Number(form.unitCost) / Number(form.yieldPages))} por unidade de impressão
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!prtModal}
        onClose={() => setPrtModal(null)}
        title={prtModal?.edit ? "Editar impressora" : "Nova impressora"}
        subtitle="A máquina herda o custo da categoria, multiplicado pelo fator de ajuste (idade, insumo importado…)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrtModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => savePrt(prtModal!.categoryId, prtModal!.mode, prtModal?.edit ? Number(prtModal.edit.id) : undefined)} icon="check">
              Salvar impressora
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input value={form.name || ""} onChange={set("name")} placeholder="Ex.: Konica C284-e" />
          </Field>
          <Field label="Marca">
            <Input value={form.brand || ""} onChange={set("brand")} placeholder="Konica Minolta" />
          </Field>
          <Field label="Modelo">
            <Input value={form.model || ""} onChange={set("model")} placeholder="bizhub C284-e" />
          </Field>
          <Field label="Status">
            <Select value={form.status || "ativa"} onChange={set("status")}>
              <option value="ativa">Ativa</option>
              <option value="manutencao">Em manutenção</option>
              <option value="inativa">Inativa</option>
            </Select>
          </Field>
          <Field label="Fator de ajuste" hint="1.00 = custo padrão da categoria">
            <Input mono value={form.costMultiplier || ""} onChange={set("costMultiplier")} placeholder="1.00" />
          </Field>
          <Field label="Valor da hora (R$)" hint="3D e recorte: o tempo é o custo real. 0 = não cobra tempo">
            <Input mono value={form.hourlyRate || ""} onChange={set("hourlyRate")} placeholder="0,00" />
          </Field>
          {prtModal?.mode === "grama" ? (
            <Field label="Volume de construção" hint="3D não usa formato de papel">
              <Input mono value={form.buildVolume || ""} onChange={set("buildVolume")} placeholder="220 × 220 × 250 mm" />
            </Field>
          ) : (
            <Field label="Formato máximo">
              <Input mono value={form.maxFormat || ""} onChange={set("maxFormat")} placeholder="A3+" />
            </Field>
          )}
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes || ""} onChange={set("notes")} placeholder="Notas de manutenção, contrato de insumos…" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!fmtModal}
        onClose={() => setFmtModal(null)}
        title={fmtModal?.edit ? "Editar formato" : "Novo formato de impressão"}
        subtitle="O formato define área relativa ao A4 e cobertura de tinta — ou um custo comercial manual por face."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFmtModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => saveFmt(fmtModal!.categoryId, fmtModal?.edit ? Number(fmtModal.edit.id) : undefined)} icon="check">
              Salvar formato
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input value={form.name || ""} onChange={set("name")} placeholder="A4, A3, Foto 10x15…" />
          </Field>
          <Field label="É fotográfico?">
            <Select value={form.isPhoto || "false"} onChange={set("isPhoto")}>
              <option value="false">Não</option>
              <option value="true">Sim — 100% de cobertura</option>
            </Select>
          </Field>
          <Field label="Largura (mm)">
            <Input mono value={form.widthMm || ""} onChange={set("widthMm")} placeholder="210" />
          </Field>
          <Field label="Altura (mm)">
            <Input mono value={form.heightMm || ""} onChange={set("heightMm")} placeholder="297" />
          </Field>
          <Field label="Fator de área" hint="A4 = 1 · A3 = 2 · A3+ ≈ 2.31">
            <Input mono value={form.areaFactor || ""} onChange={set("areaFactor")} placeholder="1" />
          </Field>
          <Field label="Cobertura de tinta (%)" hint="texto 5% · foto 100%">
            <Input mono value={form.inkCoverage || ""} onChange={set("inkCoverage")} placeholder="5" />
          </Field>
          <Field label="Custo comercial por face (R$)" hint="se > 0, substitui o cálculo técnico" className="sm:col-span-2">
            <Input mono value={form.printCostOverride || ""} onChange={set("printCostOverride")} placeholder="0 = usar cálculo de consumíveis" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
