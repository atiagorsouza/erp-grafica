"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { formatMoney } from "@/lib/pricing";
import { Badge, Button, Field, IconButton, Input, Modal, PageHeader, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const TYPES = [
  { id: "dtf_uv", label: "DTF UV", desc: "Adesivo digital UV — folhas A4/A3 e metro linear 28cm", color: "#f97316", icon: "✨" },
  { id: "dtf_textil", label: "DTF Têxtil", desc: "Transfer têxtil — metro linear 55cm e estampas", color: "#ea580c", icon: "🧵" },
  { id: "lona", label: "Lona", desc: "Comunicação visual grande formato — preço por m²", color: "var(--color-proc-c)", icon: "🪧" },
  { id: "adesivo", label: "Adesivo Vinil", desc: "Vinil impresso — branco, perfurado, transparente, jateado", color: "var(--color-proc-m)", icon: "🔲" },
];

export function PricingTablesClient({ tables }: { tables: Row[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [modal, setModal] = useState<null | { edit?: Row; type?: string }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(id?: number) {
    if (!form.label?.trim()) return toast.error("Informe a descrição da linha");
    setSaving(true);
    try {
      const data = {
        type: form.type,
        label: form.label,
        unitCost: form.unitCost || "0",
        sellPrice: form.sellPrice || "0",
        unit: form.unit || "unidade",
        widthCm: form.widthCm || null,
        heightCm: form.heightCm || null,
        minQty: form.minQty || "1",
        piecesPerSheet: form.piecesPerSheet || "1",
        minCharge: form.minCharge || "0",
        minChargeSell: form.minChargeSell || "0",
        notes: form.notes || null,
        active: form.active !== "false",
      };
      if (id) await mutate("pricing-tables", "update", data, id);
      else await mutate("pricing-tables", "create", data);
      setModal(null);
      toast.success("Tabela atualizada");
      refresh();
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Terceirizados & grande formato"
        title="Tabelas de Preços"
        icon="sheets"
        description="Tabelas independentes das impressoras: DTF UV, DTF Têxtil, Lona e Adesivo Vinil. Compõem produtos ou serviços sem misturar com o parque gráfico."
      />

      <div className="space-y-5">
        {TYPES.map((t, ti) => {
          const rows = tables.filter((r) => r.type === t.id && r.active !== false);
          return (
            <section key={t.id} className={cn("reveal overflow-hidden rounded-xl border border-paper-200 bg-paper-50 shadow-card", `reveal-${Math.min(ti + 1, 5)}`)}>
              <div className="halftone-light flex flex-wrap items-center justify-between gap-3 bg-ink-900 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg text-[19px]" style={{ background: `${String(t.color).startsWith("var") ? "#0891b233" : t.color + "26"}` }}>
                    {t.icon}
                  </span>
                  <div>
                    <h2 className="display-expanded text-[16px] font-bold text-white">{t.label}</h2>
                    <p className="text-[11.5px] text-ink-300">{t.desc}</p>
                  </div>
                </div>
                <Button size="sm" variant="soft" icon="plus" onClick={() => { setForm({ type: t.id, unit: t.id.startsWith("lona") || t.id.startsWith("adesivo") ? "m2" : t.id === "dtf_textil" ? "metro" : "unidade", minQty: "1" }); setModal({ type: t.id }); }}>
                  Linha
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-paper-200">
                      {["Descrição", "Área útil", "Mínimo", "Unidade", "", "Custo", "Venda"].map((h, i) => (
                        <th key={i} className={cn("px-5 py-2.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase", i >= 5 && "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={String(r.id)} className="group border-b border-paper-200/60 transition-colors last:border-0 hover:bg-proc-c-soft/30">
                        <td className="px-5 py-3">
                          <p className="text-[13px] font-semibold text-ink-800">{String(r.label)}</p>
                          {r.notes && <p className="text-[10.5px] text-ink-400">{String(r.notes)}</p>}
                        </td>
                        <td className="px-5 py-3 font-mono text-[11.5px] text-ink-500 tnum">
                          {r.widthCm && r.heightCm ? `${Number(r.widthCm)}×${Number(r.heightCm)}cm` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {Number(r.piecesPerSheet || 1) > 1 ? (
                            <Badge tone="cyan">{Number(r.piecesPerSheet)}/folha</Badge>
                          ) : Number(r.minCharge || 0) > 0 ? (
                            <Badge tone="amber">mín {formatMoney(Number(r.minCharge))}</Badge>
                          ) : (
                            <Badge tone="neutral">{Number(r.minQty || 1)}+</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-[11px] text-ink-500 uppercase">{String(r.unit)}</td>
                        <td className="px-2 py-3">
                          <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                              setForm({ type: String(r.type), label: String(r.label), unitCost: String(r.unitCost), sellPrice: String(r.sellPrice ?? 0), unit: String(r.unit), widthCm: String(r.widthCm || ""), heightCm: String(r.heightCm || ""), minQty: String(r.minQty || 1), piecesPerSheet: String(r.piecesPerSheet ?? 1), minCharge: String(r.minCharge ?? 0), minChargeSell: String(r.minChargeSell ?? 0), notes: String(r.notes || ""), active: String(r.active ?? true) });
                              setModal({ edit: r });
                            }} />
                            <IconButton size="sm" name="trash" label="Arquivar" tone="danger" onClick={async () => { if (confirm("Arquivar linha da tabela?")) { await mutate("pricing-tables", "delete", { reason: "Arquivada" }, Number(r.id)); refresh(); } }} />
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-mono text-[13px] text-ink-600 tnum">{formatMoney(Number(r.unitCost || 0))}</span>
                          <span className="ml-1 font-mono text-[10px] text-ink-400">/{String(r.unit)}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {Number(r.sellPrice || 0) > 0 ? (
                            <>
                              <span className="font-mono text-[15px] font-semibold tnum" style={{ color: String(t.color).startsWith("var") ? "var(--color-proc-c-strong)" : t.color }}>
                                {formatMoney(Number(r.sellPrice))}
                              </span>
                              <span className="ml-1 font-mono text-[10px] text-ink-400">/{String(r.unit)}</span>
                            </>
                          ) : (
                            <span className="font-mono text-[10px] text-ink-400">só compõe</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-ink-400">
                          <Icon name="sheets" size={20} className="mx-auto mb-2 text-ink-300" />
                          Nenhuma linha nesta tabela.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.edit ? "Editar linha" : "Nova linha de tabela"} subtitle="Preços de terceiros com desconto por volume — use uma linha por faixa."
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => save(modal?.edit ? Number(modal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Descrição" required className="sm:col-span-2"><Input value={form.label || ""} onChange={set("label")} placeholder='Ex.: "A4 (área útil 22x28cm)"' /></Field>
          <Field label="Custo (R$)" hint="o que você paga ao fornecedor"><Input mono value={form.unitCost || ""} onChange={set("unitCost")} /></Field>
          <Field label="Preço de venda (R$)" hint="0 = não vende avulso, só compõe produto"><Input mono value={form.sellPrice || ""} onChange={set("sellPrice")} /></Field>
          <Field label="Unidade">
            <select value={form.unit || "unidade"} onChange={set("unit")} className="focus-ring h-9.5 w-full cursor-pointer rounded-lg border border-paper-300 bg-white px-3 text-[13px]">
              {["unidade", "metro", "m2", "folha"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Largura útil (cm)"><Input mono value={form.widthCm || ""} onChange={set("widthCm")} /></Field>
          <Field label="Altura útil (cm)"><Input mono value={form.heightCm || ""} onChange={set("heightCm")} /></Field>
          <Field label="Quantidade mínima"><Input mono value={form.minQty || "1"} onChange={set("minQty")} /></Field>
          <Field label="Peças por folha" hint="DTF: quantas cabem na folha comprada (1 = folha inteira)">
            <Input mono value={form.piecesPerSheet || "1"} onChange={set("piecesPerSheet")} placeholder="6" />
          </Field>
          <Field label="Mínimo de custo (R$)" hint="o piso que o fornecedor cobra por peça">
            <Input mono value={form.minCharge || ""} onChange={set("minCharge")} placeholder="26,00" />
          </Field>
          <Field label="Mínimo de venda (R$)" hint="seu piso ao cliente — com margem">
            <Input mono value={form.minChargeSell || ""} onChange={set("minChargeSell")} placeholder="60,00" />
          </Field>
          <Field label="Observações"><Input value={form.notes || ""} onChange={set("notes")} placeholder="Desconto volume…" /></Field>
        </div>
      </Modal>
    </div>
  );
}
