"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import controlPanelConfig from "../../../config/control-panel-settings.json";
import { mutate } from "@/lib/mutate";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, toast } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { LogoUpload } from "@/components/LogoUpload";
import { cn } from "@/lib/format";

type Row = {
  id: number | string;
  key: string;
  value: string | null;
  category?: string | null;
};

type FieldDef = {
  key: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  type?: "text" | "number" | "select" | "textarea" | "toggle" | "logo";
  options?: { value: string; label: string }[];
  suffix?: string;
  span2?: boolean;
  mono?: boolean;
};

type Group = {
  id: string;
  title: string;
  desc: string;
  icon: IconName;
  color: string;
  fields: FieldDef[];
};

const GROUPS = controlPanelConfig.groups as Group[];
const CANONICAL_KEYS = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));

const categoryOf = (key: string): string => {
  const group = GROUPS.find((g) => g.fields.some((f) => f.key === key));
  return group?.id || "geral";
};

const defaultOf = (key: string): string => {
  for (const group of GROUPS) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return String(field.defaultValue ?? "");
  }
  return "";
};

export function SettingsClient({ rows }: { rows: Row[] }) {
  const router = useRouter();

  const rowsByKey = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of rows) map.set(String(r.key), r);
    return map;
  }, [rows]);

  const initial = useMemo(() => {
    const data: Record<string, string> = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const row = rowsByKey.get(field.key);
        data[field.key] = row ? String(row.value ?? "") : String(field.defaultValue ?? "");
      }
    }
    return data;
  }, [rowsByKey]);

  const [form, setForm] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(GROUPS[0]?.id || "empresa");

  const dirty = Object.entries(form).filter(([key, value]) => {
    if (!CANONICAL_KEYS.has(key)) return false;
    const row = rowsByKey.get(key);
    const original = row ? String(row.value ?? "") : defaultOf(key);
    return original !== value;
  }).length;

  async function save() {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(form)) {
        if (!CANONICAL_KEYS.has(key)) continue;
        const existing = rowsByKey.get(key);
        const original = existing ? String(existing.value ?? "") : defaultOf(key);
        if (original === value) continue;

        if (existing) {
          await mutate("settings", "update", { key, value, category: categoryOf(key) }, Number(existing.id));
        } else {
          await mutate("settings", "create", { key, value, category: categoryOf(key) });
        }
      }
      toast.success("Configurações salvas", "Os módulos já usam os novos parâmetros.");
      router.refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const group = GROUPS.find((g) => g.id === active) || GROUPS[0];

  return (
    <div>
      <PageHeader
        eyebrow="Parâmetros do sistema"
        title="Painel de Controle"
        icon="gear"
        description="Empresa, motor de precificação, PDV, orçamentos, pedidos, Kanban, CRM, calendário e fiscal. Tudo em um lugar, organizado por módulo."
        actions={
          <Button icon="check" onClick={save} loading={saving} disabled={dirty === 0}>
            Salvar alterações{dirty > 0 ? ` · ${dirty}` : ""}
          </Button>
        }
      />

      <div className="reveal grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
          {GROUPS.map((g) => {
            const changedCount = g.fields.filter((f) => {
              const row = rowsByKey.get(f.key);
              const orig = row ? String(row.value ?? "") : String(f.defaultValue ?? "");
              return form[f.key] !== undefined && form[f.key] !== orig;
            }).length;
            return (
              <button
                key={g.id}
                onClick={() => setActive(g.id)}
                className={cn(
                  "focus-ring flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-all",
                  active === g.id
                    ? "border-ink-900 bg-ink-900 text-white shadow-pop"
                    : "border-paper-200 bg-paper-50 text-ink-600 hover:border-ink-300"
                )}
              >
                <Icon
                  name={g.icon}
                  size={15}
                  className={active === g.id ? "text-cyan-300" : `${g.color} opacity-70`}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{g.title}</span>
                {changedCount > 0 && (
                  <Badge tone="amber" className="shrink-0">{changedCount}</Badge>
                )}
              </button>
            );
          })}
        </nav>

        <Card className="reveal reveal-1">
          <div className="mb-5 border-b border-dashed border-paper-300 pb-4">
            <div className="flex items-center gap-2.5">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-100", group.color)}>
                <Icon name={group.icon} size={18} />
              </span>
              <div>
                <h3 className="display-expanded text-[16px] font-bold text-ink-900">{group.title}</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">{group.desc}</p>
              </div>
            </div>
          </div>

          {group.fields.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              Nenhum campo configurado para esta seção. Rode <code>bash scripts/update.sh</code> para reparar o painel.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.fields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  className={f.span2 ? "sm:col-span-2" : ""}
                >
                  {f.type === "logo" ? (
                    <LogoUpload
                      chave={f.key}
                      valor={form[f.key] ?? ""}
                      escura={f.key.includes("dark")}
                      onChange={(uri) => setForm((x) => ({ ...x, [f.key]: uri }))}
                    />
                  ) : f.type === "select" ? (
                    <Select
                      value={form[f.key] ?? String(f.defaultValue ?? "")}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    >
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      value={form[f.key] ?? String(f.defaultValue ?? "")}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <div className="relative">
                      <Input
                        mono={f.mono || f.type === "number"}
                        type={f.type === "number" ? "number" : "text"}
                        value={form[f.key] ?? String(f.defaultValue ?? "")}
                        onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                        className={f.suffix ? "pr-9" : ""}
                      />
                      {f.suffix && (
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-ink-400">
                          {f.suffix}
                        </span>
                      )}
                    </div>
                  )}
                </Field>
              ))}
            </div>
          )}

          {active === "tributacao" && (
            <div className="mt-5 rounded-lg bg-proc-c-soft px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-proc-c-strong">
                <Icon name="info" size={14} className="shrink-0" />
                Exemplo: venda de R$ 100 com imposto {form.tax_rate || "6"}% e débito {form.card_fee_debit || "1.99"}% — o motor mantém os cálculos consistentes no PDV e nos relatórios.
              </p>
            </div>
          )}

          {active === "pdv" && (
            <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-emerald-800">
                <Icon name="info" size={14} className="shrink-0" />
                As taxas de maquininha ficam em <strong>Precificação & taxas</strong>. O vendedor digitado no PDV pode ficar salvo no navegador do operador.
              </p>
            </div>
          )}

          {active === "fiscal" && (
            <div className="mt-5 rounded-lg bg-paper-100 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-ink-600">
                <Icon name="info" size={14} className="shrink-0" />
                A emissão real de NF-e / NFC-e / NFS-e depende de integrador externo e certificado digital A1 ou A3.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
