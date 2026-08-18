"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
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
  Segmented,
  Select,
  Textarea,
  Toggle,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_ICONS = ["❄️", "🎭", "🌷", "🐣", "💐", "❤️", "🍫", "👨", "🇧🇷", "👶", "🖤", "🎄"];

const TYPES = [
  { value: "feriado_nacional", label: "Feriado Nacional", tone: "red" as const },
  { value: "data_comercial", label: "Data Comercial", tone: "magenta" as const },
  { value: "data_comemorativa", label: "Data Comemorativa", tone: "cyan" as const },
  { value: "interno", label: "Interno", tone: "neutral" as const },
];
const RELEVANCES = [
  { value: "alta", label: "Alta", tone: "red" as const },
  { value: "media", label: "Média", tone: "yellow" as const },
  { value: "baixa", label: "Baixa", tone: "neutral" as const },
];

const typeTone = (t: string) => TYPES.find((x) => x.value === t)?.tone || "neutral";
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label || t;
const relTone = (r: string) => RELEVANCES.find((x) => x.value === r)?.tone || "neutral";

export function CalendarClient({ dates }: { dates: Row[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [view, setView] = useState<"calendario" | "lista">("calendario");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");

  const [modal, setModal] = useState<null | { edit?: Row }>(null);
  const [deleteModal, setDeleteModal] = useState<null | Row>(null);
  const [deleting, setDeleting] = useState(false);
  const [auditModal, setAuditModal] = useState<null | { dateId: number; title: string }>(null);
  const [auditRows, setAuditRows] = useState<Row[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /* Filtros */
  const filtered = useMemo(() => {
    return dates.filter((d) => {
      if (!showInactive && !d.active) return false;
      if (typeFilter !== "all" && d.type !== typeFilter) return false;
      if (q && !String(d.title).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [dates, showInactive, typeFilter, q]);

  const monthDates = filtered.filter((d) => Number(d.month) === selectedMonth);

  /* Stats */
  const stats = useMemo(() => {
    const active = dates.filter((d) => d.active).length;
    const inactive = dates.filter((d) => !d.active).length;
    const feriados = dates.filter((d) => d.type === "feriado_nacional" && d.active).length;
    const comerciais = dates.filter((d) => d.type === "data_comercial" && d.active).length;
    const altas = dates.filter((d) => d.relevance === "alta" && d.active).length;
    return { total: dates.length, active, inactive, feriados, comerciais, altas };
  }, [dates]);

  /* Abrir editor */
  function openNew(month?: number) {
    setForm({
      month: String(month || selectedMonth),
      day: "1",
      type: "data_comemorativa",
      relevance: "media",
      icon: "📅",
      active: "true",
    });
    setModal({});
  }
  function openEdit(d: Row) {
    setForm({
      month: String(d.month),
      day: String(d.day),
      title: String(d.title || ""),
      type: String(d.type || "data_comemorativa"),
      relevance: String(d.relevance || "media"),
      actionHint: String(d.actionHint || ""),
      icon: String(d.icon || "📅"),
      active: String(d.active),
    });
    setModal({ edit: d });
  }

  async function save(id?: number) {
    if (!form.title?.trim()) return toast.error("Informe o título da data");
    if (!form.day || Number(form.day) < 1 || Number(form.day) > 31) return toast.error("Dia inválido");
    setSaving(true);
    try {
      const data = {
        month: Number(form.month),
        day: Number(form.day),
        title: form.title,
        type: form.type || "data_comemorativa",
        relevance: form.relevance || "media",
        actionHint: form.actionHint || null,
        icon: form.icon || "📅",
        active: form.active !== "false",
      };
      if (id) await mutate("commemorative-dates", "update", data, id);
      else await mutate("commemorative-dates", "create", data);
      toast.success(id ? "Data atualizada" : "Data criada", `${form.day}/${form.month} — ${form.title}`);
      setModal(null);
      refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: Row) {
    try {
      await mutate("commemorative-dates", "update", { active: !d.active }, Number(d.id));
      toast.info(d.active ? "Data desativada" : "Data ativada", String(d.title));
      refresh();
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  async function del() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await mutate("commemorative-dates", "delete", { reason: "Desativada pelo usuário" }, Number(deleteModal.id));
      toast.info("Data desativada", String(deleteModal.title));
      setDeleteModal(null);
      refresh();
    } catch (e) {
      toast.error("Erro ao excluir", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  }

  async function openAudit(d: Row) {
    setAuditModal({ dateId: Number(d.id), title: String(d.title) });
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/crud/commemorative-dates?audit=${d.id}`);
      const json = await res.json();
      setAuditRows(json.rows || []);
    } catch {
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Planejamento comercial · datas sazonais"
        title="Calendário Comemorativo"
        icon="calendar"
        description="Datas comerciais, feriados e comemorativas para planejar campanhas, produtos sazonais e ações de marketing. Cada data é editável, auditável e pode ser ativada/desativada."
        actions={
          <Button icon="plus" onClick={() => openNew()}>
            Nova data
          </Button>
        }
      />

      {/* KPIs */}
      <div className="reveal mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: stats.total, tone: "bg-ink-900 text-white" },
          { label: "Ativas", value: stats.active, tone: "bg-emerald-50 text-emerald-700" },
          { label: "Desativadas", value: stats.inactive, tone: "bg-paper-200 text-ink-500" },
          { label: "Feriados", value: stats.feriados, tone: "bg-red-50 text-red-700" },
          { label: "Comerciais", value: stats.comerciais, tone: "bg-proc-m-soft text-proc-m" },
          { label: "Alta relevância", value: stats.altas, tone: "bg-proc-y-soft text-yellow-700" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-lg px-3.5 py-3 text-center", k.tone)}>
            <p className="font-mono text-[22px] leading-none font-semibold tnum">{k.value}</p>
            <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="reveal mb-4 flex flex-wrap items-center gap-2.5">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "calendario", label: "Calendário" },
            { value: "lista", label: "Lista completa", count: filtered.length },
          ]}
        />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
          <option value="all">Todos os tipos</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <div className="relative w-full max-w-52">
          <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8.5" />
        </div>
        <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar desativadas" />
      </div>

      {/* ─── VIEW: CALENDÁRIO MÊS A MÊS ─── */}
      {view === "calendario" && (
        <div className="space-y-3">
          {/* Seletor de mês */}
          <div className="reveal flex gap-1.5 overflow-x-auto pb-1">
            {MONTHS.map((m, i) => {
              const monthNum = i + 1;
              const count = filtered.filter((d) => Number(d.month) === monthNum).length;
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(monthNum)}
                  className={cn(
                    "focus-ring flex shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-all",
                    selectedMonth === monthNum
                      ? "border-ink-900 bg-ink-900 text-white shadow-pop"
                      : "border-paper-200 bg-paper-50 text-ink-600 hover:border-ink-300"
                  )}
                >
                  <span className="text-[16px]">{MONTH_ICONS[i]}</span>
                  <span className="text-[11px] font-semibold">{m.slice(0, 3)}</span>
                  <span className={cn("rounded px-1.5 font-mono text-[9px] tnum", selectedMonth === monthNum ? "bg-white/20" : "bg-paper-200/80")}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Cards do mês */}
          <Card className="reveal reveal-1" pad={false}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-[28px]">{MONTH_ICONS[selectedMonth - 1]}</span>
                <div>
                  <h2 className="display-expanded text-[18px] font-bold text-ink-900">{MONTHS[selectedMonth - 1]}</h2>
                  <p className="text-[12px] text-ink-500">{monthDates.length} data(s) neste mês</p>
                </div>
              </div>
              <Button size="sm" variant="outline" icon="plus" onClick={() => openNew(selectedMonth)}>
                Adicionar ao mês
              </Button>
            </div>

            {monthDates.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-ink-400">
                Nenhuma data em {MONTHS[selectedMonth - 1]}.
                <button onClick={() => openNew(selectedMonth)} className="ml-1 cursor-pointer font-semibold text-proc-c-strong hover:underline">Adicionar</button>
              </div>
            ) : (
              <div className="divide-y divide-paper-200">
                {monthDates.map((d) => (
                  <div
                    key={String(d.id)}
                    className={cn(
                      "group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-paper-100/50",
                      !d.active && "opacity-50"
                    )}
                  >
                    {/* Dia */}
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-paper-200 bg-white shadow-card">
                      <span className="font-mono text-[15px] leading-none font-bold text-ink-900 tnum">{String(d.day).padStart(2, "0")}</span>
                      <span className="mt-0.5 font-mono text-[8px] uppercase text-ink-400">{MONTHS[selectedMonth - 1].slice(0, 3)}</span>
                    </span>
                    {/* Ícone */}
                    <span className="text-[20px]">{String(d.icon || "📅")}</span>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink-900">{String(d.title)}</p>
                      {d.actionHint && (
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-500">💡 {String(d.actionHint)}</p>
                      )}
                    </div>
                    {/* Badges */}
                    <Badge tone={typeTone(String(d.type))}>{typeLabel(String(d.type))}</Badge>
                    <Badge tone={relTone(String(d.relevance))}>{String(d.relevance)}</Badge>
                    {!d.active && <Badge tone="neutral">inativa</Badge>}
                    {/* Ações */}
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton size="sm" name="eye" label="Auditoria" onClick={() => openAudit(d)} />
                      <IconButton size="sm" name="pencil" label="Editar" onClick={() => openEdit(d)} />
                      <IconButton
                        size="sm"
                        name={d.active ? "circle-x" : "circle-check"}
                        label={d.active ? "Desativar" : "Ativar"}
                        tone={d.active ? "danger" : "primary"}
                        onClick={() => toggleActive(d)}
                      />
                      <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={() => setDeleteModal(d)} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── VIEW: LISTA COMPLETA ─── */}
      {view === "lista" && (
        <div className="reveal reveal-1 space-y-4">
          {MONTHS.map((monthName, i) => {
            const monthNum = i + 1;
            const mDates = filtered.filter((d) => Number(d.month) === monthNum);
            if (mDates.length === 0) return null;
            return (
              <Card key={monthName} pad={false} className="overflow-hidden">
                <div className="flex items-center gap-2.5 border-b border-paper-200 bg-paper-100/60 px-4 py-2.5">
                  <span className="text-[18px]">{MONTH_ICONS[i]}</span>
                  <h3 className="display-expanded text-[14px] font-bold text-ink-900">{monthName}</h3>
                  <span className="font-mono text-[11px] text-ink-400 tnum">{mDates.length}</span>
                </div>
                <div className="divide-y divide-paper-200/60">
                  {mDates.map((d) => (
                    <div key={String(d.id)} className={cn("group flex items-center gap-3 px-4 py-2.5 hover:bg-paper-100/40", !d.active && "opacity-40")}>
                      <span className="w-8 shrink-0 text-center font-mono text-[13px] font-bold text-ink-800 tnum">{String(d.day).padStart(2, "0")}</span>
                      <span className="text-[16px]">{String(d.icon)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-800">{String(d.title)}</span>
                      <Badge tone={typeTone(String(d.type))}>{typeLabel(String(d.type))}</Badge>
                      <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton size="sm" name="pencil" label="Editar" onClick={() => openEdit(d)} />
                        <IconButton size="sm" name={d.active ? "circle-x" : "circle-check"} label={d.active ? "Desativar" : "Ativar"} onClick={() => toggleActive(d)} />
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── MODAL CRIAR/EDITAR ─── */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.edit ? "Editar data comemorativa" : "Nova data comemorativa"}
        subtitle="Datas ativas aparecem no calendário e podem acionar alertas de campanha."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => save(modal?.edit ? Number(modal.edit.id) : undefined)} icon="check">
              Salvar data
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Título" required className="sm:col-span-2">
            <Input value={form.title || ""} onChange={set("title")} placeholder="Ex.: Dia das Mães" />
          </Field>
          <Field label="Mês">
            <Select value={form.month || "1"} onChange={set("month")}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{MONTH_ICONS[i]} {m}</option>)}
            </Select>
          </Field>
          <Field label="Dia">
            <Input mono value={form.day || ""} onChange={set("day")} placeholder="1" type="number" />
          </Field>
          <Field label="Tipo">
            <Select value={form.type || "data_comemorativa"} onChange={set("type")}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Relevância para gráfica">
            <Select value={form.relevance || "media"} onChange={set("relevance")}>
              {RELEVANCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Emoji / Ícone">
            <Input value={form.icon || ""} onChange={set("icon")} placeholder="📅" />
          </Field>
          <Field label="Ativa?">
            <Select value={form.active || "true"} onChange={set("active")}>
              <option value="true">Sim — aparece no calendário</option>
              <option value="false">Não — oculta do calendário</option>
            </Select>
          </Field>
          <Field label="Dica de ação para a gráfica" className="sm:col-span-2" hint="Ex.: Cartões, banners, brindes personalizados">
            <Textarea value={form.actionHint || ""} onChange={set("actionHint")} placeholder="Sugestão de produtos/serviços para esta data" />
          </Field>
        </div>
      </Modal>

      {/* ─── MODAL CONFIRMAR DESATIVAÇÃO ─── */}
      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Desativar data?"
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" icon="circle-x" loading={deleting} onClick={del}>
              Desativar
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-700">
          Desativar <strong>"{deleteModal?.title}"</strong> ({deleteModal?.day}/{deleteModal?.month})?
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          A ação pode ser revertida ativando a data novamente em “Mostrar desativadas”.
        </p>
      </Modal>

      {/* ─── MODAL AUDITORIA ─── */}
      <Modal
        open={!!auditModal}
        onClose={() => setAuditModal(null)}
        title={`Auditoria: ${auditModal?.title || ""}`}
        subtitle="Histórico de alterações registradas automaticamente."
      >
        {auditLoading ? (
          <p className="py-8 text-center text-[13px] text-ink-400">Carregando...</p>
        ) : auditRows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-400">Nenhuma alteração registrada.</p>
        ) : (
          <div className="space-y-0">
            {auditRows.map((a, i, arr) => (
              <div key={String(a.id)} className="relative flex gap-3 pb-4">
                {i < arr.length - 1 && <span className="absolute top-5 left-[7px] h-full w-px bg-paper-300" />}
                <span className={cn(
                  "relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                  a.action === "deleted" ? "border-red-500 bg-red-50" :
                  a.action === "created" ? "border-emerald-500 bg-emerald-50" :
                  "border-proc-c bg-paper-50"
                )} />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink-800">
                    {a.action === "create" && "Criada"}
                    {a.action === "update" && `Campo "${a.field}" alterado`}
                    {a.action === "deactivate" && "Desativada"}
                  </p>
                  {a.oldValue && <p className="text-[11px] text-ink-500">De: <span className="line-through">{String(a.oldValue)}</span></p>}
                  {a.newValue && <p className="text-[11px] text-ink-500">Para: <span className="font-medium text-ink-800">{String(a.newValue)}</span></p>}
                  <p className="mt-0.5 font-mono text-[9.5px] text-ink-400">
                    {a.performedBy || "sistema"} · {new Date(a.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
