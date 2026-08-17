"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { formatMoney } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  Combobox,
  Drawer,
  EmptyState,
  Field,
  IconButton,
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
import { cn, initials } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const COLUMNS = ["novo", "qualificacao", "orcamento", "negociacao", "ganho", "perdido"];
const COL_LABEL: Record<string, string> = {
  novo: "Novo",
  qualificacao: "Qualificação",
  orcamento: "Orçamento",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};
const COL_COLOR: Record<string, string> = {
  novo: "var(--color-proc-c)",
  qualificacao: "#0e7490",
  orcamento: "var(--color-proc-m)",
  negociacao: "var(--color-proc-y)",
  ganho: "#10b981",
  perdido: "#94a3b8",
};
const SOURCES = ["balcao", "instagram", "site", "indicacao", "google", "facebook", "marketplace", "outro"];
const ACTIVITY_TYPES = ["nota", "ligacao", "reuniao", "tarefa", "visita", "proposta"];

export function ClientsClient({ customers, leads, activities, quotes, orders, sales }: {
  customers: Row[];
  leads: Row[];
  activities: Row[];
  quotes: Row[];
  orders: Row[];
  sales: Row[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const params = useSearchParams();
  const [tab, setTab] = useState<"carteira" | "pipeline">("carteira");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [custModal, setCustModal] = useState<null | { edit?: Row }>(null);
  const [leadModal, setLeadModal] = useState<null | { edit?: Row; column?: string }>(null);
  const [deleteModal, setDeleteModal] = useState<null | { id: number; name: string; kind: "customer" | "lead" }>(null);
  const [drawerId, setDrawerId] = useState<number | null>(params.get("id") ? Number(params.get("id")) : null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [actForm, setActForm] = useState({ type: "nota", title: "", description: "" });

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const drawer = customers.find((c) => Number(c.id) === drawerId) || null;

  /* LTV por cliente — soma vendas PDV + pedidos */
  const ltv = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sales) map.set(Number(s.customerId), (map.get(Number(s.customerId)) || 0) + Number(s.total || 0));
    for (const o of orders) map.set(Number(o.customerId), (map.get(Number(o.customerId)) || 0) + Number(o.total || 0));
    return map;
  }, [sales, orders]);

  /* Filtro de clientes */
  const filtered = useMemo(() => customers.filter((c) => {
    const mq = !q || [c.name, c.tradeName, c.document, c.email, c.phone]
      .some((v) => String(v || "").toLowerCase().includes(q.toLowerCase()));
    const ms = statusFilter === "all" || c.status === statusFilter;
    return mq && ms;
  }), [customers, q, statusFilter]);

  /* Autopreenchimento ViaCEP */
  const handleCepBlur = useCallback(async () => {
    const clean = (form.cep || "").replace(/\D/g, "");
    if (clean.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`/api/cep/${clean}`);
      if (res.ok) {
        const data = await res.json();
        setForm((f) => ({
          ...f,
          street: data.street || f.street || "",
          district: data.district || f.district || "",
          city: data.city || f.city || "",
          state: data.state || f.state || "",
        }));
      }
    } catch { /* silencia */ }
    finally { setFetchingCep(false); }
  }, [form.cep]);

  /* Salvar cliente */
  async function saveCustomer(id?: number) {
    if (!form.name?.trim()) return toast.error("Informe o nome / razão social");
    setSaving(true);
    try {
      const data = {
        type: form.type || "pf",
        name: form.name.trim(),
        tradeName: form.tradeName?.trim() || null,
        document: form.document?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        website: form.website?.trim() || null,
        contactName: form.contactName?.trim() || null,
        contactRole: form.contactRole?.trim() || null,
        cep: form.cep?.trim() || null,
        street: form.street?.trim() || null,
        number: form.number?.trim() || null,
        complement: form.complement?.trim() || null,
        district: form.district?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        rg: form.rg?.trim() || null,
        birthDate: form.birthDate?.trim() || null,
        gender: form.gender || null,
        stateRegistration: form.stateRegistration?.trim() || null,
        municipalRegistration: form.municipalRegistration?.trim() || null,
        legalNature: form.legalNature?.trim() || null,
        taxRegime: form.taxRegime || null,
        status: form.status || "lead",
        creditLimit: form.creditLimit || "0",
        tags: form.tags?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      if (id) await mutate("customers", "update", data, id);
      else await mutate("customers", "create", data);
      toast.success("Cliente salvo");
      setCustModal(null);
      refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  /* Salvar lead/oportunidade */
  async function saveLead(id?: number) {
    if (!form.title?.trim()) return toast.error("Informe o título da oportunidade");
    setSaving(true);
    try {
      const data = {
        title: form.title.trim(),
        customerId: form.customerId ? Number(form.customerId) : null,
        column: form.column || "novo",
        source: form.source || "balcao",
        owner: form.owner?.trim() || null,
        expectedValue: form.expectedValue || "0",
        probability: Number(form.probability || 10),
        notes: form.notes?.trim() || null,
        nextActionAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        lastContactAt: new Date().toISOString(),
      };
      if (id) await mutate("crm-leads", "update", data, id);
      else await mutate("crm-leads", "create", data);
      toast.success("Oportunidade salva");
      setLeadModal(null);
      refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  /* Mover lead no pipeline */
  async function moveLead(lead: Row, dir: 1 | -1) {
    const idx = COLUMNS.indexOf(String(lead.column));
    const next = COLUMNS[Math.min(Math.max(idx + dir, 0), COLUMNS.length - 1)];
    if (next === lead.column) return;
    await mutate("crm-leads", "update", { column: next, lastContactAt: new Date().toISOString() }, Number(lead.id));
    toast.success(`Lead movido para ${COL_LABEL[next]}`);
    refresh();
  }

  /* Registrar atividade CRM */
  async function addActivity() {
    if (!drawerId || !actForm.title.trim()) return toast.error("Informe o título da atividade");
    await mutate("crm-activities", "create", {
      customerId: drawerId,
      type: actForm.type,
      title: actForm.title.trim(),
      description: actForm.description?.trim() || null,
    });
    setActForm({ type: "nota", title: "", description: "" });
    toast.success("Atividade registrada");
    refresh();
  }

  /* Excluir com modal de confirmação */
  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      if (deleteModal.kind === "customer") {
        await mutate("customers", "delete", { reason: "Arquivado pelo usuário" }, deleteModal.id);
        toast.success("Cliente arquivado", deleteModal.name);
        if (drawerId === deleteModal.id) setDrawerId(null);
      } else {
        await mutate("crm-leads", "delete", undefined, deleteModal.id);
        toast.success("Oportunidade removida", deleteModal.name);
      }
      setDeleteModal(null);
      refresh();
    } catch (e) {
      toast.error("Erro ao excluir", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  }

  /* Abrir discador do telefone (sem automação de mensagens) */
  function openPhone(c: Row) {
    const raw = String(c.phone || c.whatsapp || "").replace(/\D/g, "");
    if (!raw) return toast.error("Cliente sem telefone cadastrado");
    window.open(`tel:+55${raw}`, "_self");
  }

  /* Criar orçamento rápido a partir de lead */
  function createQuoteFromLead(lead: Row) {
    const custId = lead.customerId ? `&customerId=${lead.customerId}` : "";
    router.push(`/orcamentos?novo=1${custId}`);
  }

  const custName = (id: unknown) => customers.find((c) => Number(c.id) === Number(id))?.name || "—";

  return (
    <div>
      <PageHeader
        eyebrow="Carteira · funil · relacionamento"
        title="Clientes & CRM"
        icon="users"
        description="Pessoa física e jurídica no mesmo lugar, com funil comercial de 6 etapas e histórico 360° de cada conta."
        actions={
          <>
            <Button variant="outline" icon="plus" onClick={() => { setForm({ type: "pf", status: "lead", column: "novo" }); setLeadModal({}); }}>
              Oportunidade
            </Button>
            <Button icon="plus" onClick={() => { setForm({ type: "pf", status: "lead" }); setCustModal({}); }}>
              Novo cliente
            </Button>
          </>
        }
      />

      {/* ── BARRA DE CONTROLES ── */}
      <div className="reveal mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "carteira", label: "Carteira", count: customers.length },
            { value: "pipeline", label: "Pipeline comercial", count: leads.filter((l) => l.column !== "ganho" && l.column !== "perdido").length },
          ]}
        />
        {tab === "carteira" && (
          <>
            <div className="relative w-full max-w-60">
              <Icon name="search" size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, documento, contato…" className="pl-8.5" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="all">Todos os status</option>
              <option value="lead">Leads</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="bloqueado">Bloqueados</option>
            </Select>
          </>
        )}
      </div>

      {/* ── CARTEIRA ── */}
      {tab === "carteira" && (
        filtered.length === 0 ? (
          <EmptyState icon="users" title="Nenhum cliente encontrado" hint="Cadastre pessoas físicas e jurídicas para orçamentos e pedidos." action={<Button icon="plus" onClick={() => { setForm({ type: "pf", status: "lead" }); setCustModal({}); }}>Cadastrar cliente</Button>} />
        ) : (
          <TableWrap className="reveal reveal-1">
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Documento</Th>
                <Th>Contato</Th>
                <Th right>LTV movimentado</Th>
                <Th>Status</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <Tr key={String(c.id)} onClick={() => setDrawerId(Number(c.id))}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold", c.type === "pj" ? "bg-proc-m-soft text-proc-m" : "bg-proc-c-soft text-proc-c-strong")}>
                        {initials(String(c.tradeName || c.name))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{String(c.tradeName || c.name)}</p>
                        <p className="truncate text-[11px] text-ink-400">
                          <Badge tone={c.type === "pj" ? "magenta" : "cyan"} className="mr-1.5">{c.type === "pj" ? "PJ" : "PF"}</Badge>
                          {c.type === "pj" ? String(c.name) : c.city ? `${c.district || ""} ${c.city}`.trim() : ""}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td mono>{String(c.document || "—")}</Td>
                  <Td>
                    <p className="text-[12px]">{String(c.phone || "—")}</p>
                    <p className="truncate text-[11px] text-ink-400">{String(c.email || "")}</p>
                  </Td>
                  <Td right mono className="font-semibold text-ink-900">{formatMoney(ltv.get(Number(c.id)) || 0)}</Td>
                  <Td><StatusBadge value={String(c.status)} /></Td>
                  <Td right>
                    <span className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton size="sm" name="eye" label="Ver 360°" onClick={() => setDrawerId(Number(c.id))} />
                      <IconButton size="sm" name="phone" label="Ligar" onClick={() => openPhone(c)} />
                      <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                        const f: Record<string, string> = {};
                        for (const [k, v] of Object.entries(c)) if (v !== null && typeof v !== "object") f[k] = String(v);
                        setForm(f);
                        setCustModal({ edit: c });
                      }} />
                      <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={() => setDeleteModal({ id: Number(c.id), name: String(c.tradeName || c.name), kind: "customer" })} />
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )
      )}

      {/* ── PIPELINE CRM ── */}
      {tab === "pipeline" && (
        <div className="reveal reveal-1 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const cards = leads.filter((l) => l.column === col);
            const value = cards.reduce((s, l) => s + Number(l.expectedValue || 0), 0);
            return (
              <div key={col} className="flex min-h-[300px] flex-col rounded-xl border border-paper-200 bg-paper-200/40 p-2.5">
                <div className="mb-2.5 px-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-600 uppercase">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: COL_COLOR[col] }} />
                      {COL_LABEL[col]}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-400 tnum">{cards.length}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-400 tnum">{formatMoney(value)}</p>
                </div>
                <div className="flex-1 space-y-2">
                  {cards.map((l) => (
                    <div key={String(l.id)} className="group rounded-lg border border-paper-200 bg-paper-50 p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
                      <p className="text-[12.5px] leading-snug font-semibold text-ink-900">{String(l.title)}</p>
                      {l.customerId && <p className="mt-0.5 truncate text-[10.5px] text-ink-400">{custName(l.customerId)}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[12px] font-semibold text-proc-c-strong tnum">{formatMoney(Number(l.expectedValue || 0))}</span>
                        <Badge tone="neutral">{Number(l.probability || 0)}%</Badge>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-paper-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Number(l.probability || 0)}%`, background: COL_COLOR[col] }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-dashed border-paper-200 pt-1.5">
                        <span className="font-mono text-[9px] tracking-wide text-ink-400 uppercase">{String(l.source || "")}</span>
                        <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton size="sm" name="chevron-left" label="Etapa anterior" onClick={() => moveLead(l, -1)} disabled={col === "novo"} />
                          <IconButton size="sm" name="quote" label="Criar orçamento" onClick={() => createQuoteFromLead(l)} />
                          <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                            const f: Record<string, string> = {};
                            for (const [k, v] of Object.entries(l)) if (v !== null && typeof v !== "object") f[k] = String(v);
                            setForm(f);
                            setLeadModal({ edit: l });
                          }} />
                          <IconButton size="sm" name="chevron-right" label="Próxima etapa" onClick={() => moveLead(l, 1)} disabled={col === "perdido"} />
                          <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={() => setDeleteModal({ id: Number(l.id), name: String(l.title), kind: "lead" })} />
                        </span>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => { setForm({ column: col, source: "balcao", probability: "10" }); setLeadModal({ column: col }); }}
                    className="focus-ring flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-paper-300 py-2 text-[11px] font-semibold text-ink-400 transition-colors hover:border-proc-c hover:text-proc-c-strong"
                  >
                    <Icon name="plus" size={12} />
                    Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL CLIENTE ── */}
      <Modal
        open={!!custModal}
        onClose={() => setCustModal(null)}
        title={custModal?.edit ? "Editar cliente" : "Novo cliente"}
        subtitle="Cadastro completo PF/PJ — identidade, contato, endereço e fiscal."
        width="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => saveCustomer(custModal?.edit ? Number(custModal.edit.id) : undefined)} icon="check">Salvar cliente</Button>
          </>
        }
      >
        <div className="mb-4">
          <Segmented
            value={(form.type as "pf" | "pj") || "pf"}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            options={[
              { value: "pf", label: "Pessoa física" },
              { value: "pj", label: "Pessoa jurídica" },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={form.type === "pj" ? "Razão social" : "Nome completo"} required>
            <Input value={form.name || ""} onChange={set("name")} autoFocus />
          </Field>
          {form.type === "pj" ? (
            <Field label="Nome fantasia">
              <Input value={form.tradeName || ""} onChange={set("tradeName")} />
            </Field>
          ) : (
            <Field label="Data de nascimento">
              <Input mono type="date" value={form.birthDate || ""} onChange={set("birthDate")} />
            </Field>
          )}
          <Field label={form.type === "pj" ? "CNPJ" : "CPF"}>
            <Input mono value={form.document || ""} onChange={set("document")} placeholder={form.type === "pj" ? "00.000.000/0001-00" : "000.000.000-00"} />
          </Field>
          {form.type === "pj" ? (
            <Field label="Regime tributário">
              <Select value={form.taxRegime || ""} onChange={set("taxRegime")}>
                <option value="">—</option>
                <option>Simples Nacional</option>
                <option>Lucro Presumido</option>
                <option>Lucro Real</option>
                <option>MEI</option>
              </Select>
            </Field>
          ) : (
            <Field label="RG">
              <Input mono value={form.rg || ""} onChange={set("rg")} />
            </Field>
          )}
          <Field label="E-mail">
            <Input value={form.email || ""} onChange={set("email")} type="email" placeholder="email@empresa.com.br" />
          </Field>
          <Field label="Telefone">
            <Input mono value={form.phone || ""} onChange={set("phone")} placeholder="(21) 99999-0000" />
          </Field>
          {form.type === "pj" && (
            <>
              <Field label="Contato na empresa">
                <Input value={form.contactName || ""} onChange={set("contactName")} />
              </Field>
              <Field label="Cargo do contato">
                <Input value={form.contactRole || ""} onChange={set("contactRole")} />
              </Field>
            </>
          )}

          {/* Endereço com ViaCEP */}
          <Field label="CEP" hint={fetchingCep ? "🔍 buscando..." : "Digite para preencher o endereço"}>
            <Input
              mono
              value={form.cep || ""}
              onChange={set("cep")}
              onBlur={handleCepBlur}
              placeholder="00000-000"
            />
          </Field>
          <Field label="Cidade / UF">
            <div className="flex gap-2">
              <Input value={form.city || ""} onChange={set("city")} placeholder="Rio de Janeiro" />
              <Input value={form.state || ""} onChange={set("state")} className="w-16" placeholder="RJ" />
            </div>
          </Field>
          <Field label="Endereço / Rua">
            <Input value={form.street || ""} onChange={set("street")} placeholder="Rua das Flores" />
          </Field>
          <Field label="Número / Bairro">
            <div className="flex gap-2">
              <Input value={form.number || ""} onChange={set("number")} className="w-20" placeholder="100" />
              <Input value={form.district || ""} onChange={set("district")} placeholder="Bairro" />
            </div>
          </Field>

          <Field label="Status comercial">
            <Select value={form.status || "lead"} onChange={set("status")}>
              <option value="lead">Lead</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="bloqueado">Bloqueado</option>
            </Select>
          </Field>
          <Field label="Limite de crédito (R$)">
            <Input mono value={form.creditLimit || "0"} onChange={set("creditLimit")} />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes || ""} onChange={set("notes")} placeholder="Preferências, histórico, observações do relacionamento..." />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL LEAD ── */}
      <Modal
        open={!!leadModal}
        onClose={() => setLeadModal(null)}
        title={leadModal?.edit ? "Editar oportunidade" : "Nova oportunidade"}
        subtitle="Oportunidades alimentam o funil comercial e os relatórios de conversão."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeadModal(null)}>Cancelar</Button>
            <Button loading={saving} onClick={() => saveLead(leadModal?.edit ? Number(leadModal.edit.id) : undefined)} icon="check">Salvar</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Título" required className="sm:col-span-2">
            <Input value={form.title || ""} onChange={set("title")} placeholder="Ex.: 500 tags kraft para promoção" autoFocus />
          </Field>
          <Field label="Cliente vinculado">
            <Combobox
              value={form.customerId || ""}
              onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
              placeholder="Sem vínculo"
              options={customers.map((c) => ({ value: String(c.id), label: String(c.tradeName || c.name), hint: c.type === "pj" ? "PJ" : "PF" }))}
            />
          </Field>
          <Field label="Etapa">
            <Select value={form.column || "novo"} onChange={set("column")}>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>{COL_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Origem">
            <Select value={form.source || "balcao"} onChange={set("source")}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Input value={form.owner || ""} onChange={set("owner")} placeholder="Tiago, Comercial…" />
          </Field>
          <Field label="Valor esperado (R$)">
            <Input mono value={form.expectedValue || ""} onChange={set("expectedValue")} placeholder="0,00" />
          </Field>
          <Field label="Probabilidade de fechamento" hint={`${form.probability || 10}%`} className="sm:col-span-2">
            <input
              type="range"
              min={0} max={100} step={5}
              value={form.probability || 10}
              onChange={set("probability")}
              className="focus-ring h-9.5 w-full cursor-pointer accent-cyan-700"
            />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={form.notes || ""} onChange={set("notes")} placeholder="Detalhes do produto, tamanho, prazo estimado..." />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL CONFIRMAR EXCLUSÃO ── */}
      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={deleteModal?.kind === "customer" ? "Excluir cliente?" : "Excluir oportunidade?"}
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" icon="trash" loading={deleting} onClick={confirmDelete}>
              Confirmar exclusão
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-700">
          {deleteModal?.kind === "customer"
            ? <>O cliente <strong>{deleteModal.name}</strong> será marcado como inativo e permanecerá no histórico de orçamentos, pedidos e vendas.</>
            : <>A oportunidade <strong>"{deleteModal?.name}"</strong> será marcada como perdida, preservando o histórico.</>
          }
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          Esta ação não pode ser desfeita.
        </p>
      </Modal>

      {/* ── DRAWER 360° ── */}
      <Drawer
        open={!!drawer}
        onClose={() => setDrawerId(null)}
        title={drawer ? String(drawer.tradeName || drawer.name) : ""}
        subtitle={
          drawer && (
            <span className="flex items-center gap-2">
              <Badge tone={drawer.type === "pj" ? "magenta" : "cyan"}>{drawer.type === "pj" ? "PJ" : "PF"}</Badge>
              <span className="font-mono">{String(drawer.document || "")}</span>
              <StatusBadge value={String(drawer.status)} />
            </span>
          )
        }
        footer={
          drawer && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                icon="phone"
                onClick={() => openPhone(drawer)}
              >
                Ligar
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="soft"
                  icon="quote"
                  onClick={() => router.push(`/orcamentos?novo=1&customerId=${drawer.id}`)}
                >
                  Orçamento
                </Button>
                <Button
                  icon="pencil"
                  onClick={() => {
                    const f: Record<string, string> = {};
                    for (const [k, v] of Object.entries(drawer)) if (v !== null && typeof v !== "object") f[k] = String(v);
                    setForm(f);
                    setCustModal({ edit: drawer });
                  }}
                >
                  Editar
                </Button>
              </div>
            </div>
          )
        }
      >
        {drawer && (
          <div className="space-y-6">
            {/* Contato */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "phone" as const, k: "Telefone", v: drawer.phone },
                { icon: "mail" as const, k: "E-mail", v: drawer.email },
                { icon: "building" as const, k: "Cidade", v: [drawer.district, drawer.city, drawer.state].filter(Boolean).join(" · ") },
              ].map((x) => (
                <div key={x.k} className="rounded-lg border border-paper-200 bg-white px-3 py-2.5">
                  <p className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wider text-ink-400 uppercase">
                    <Icon name={x.icon} size={11} />
                    {x.k}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink-800">{String(x.v || "—")}</p>
                </div>
              ))}
            </div>

            {/* LTV por canal */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { k: "Orçamentos", v: quotes.filter((x) => Number(x.customerId) === Number(drawer.id)).length, money: quotes.filter((x) => Number(x.customerId) === Number(drawer.id)).reduce((s, x) => s + Number(x.total || 0), 0) },
                { k: "Pedidos", v: orders.filter((x) => Number(x.customerId) === Number(drawer.id)).length, money: orders.filter((x) => Number(x.customerId) === Number(drawer.id)).reduce((s, x) => s + Number(x.total || 0), 0) },
                { k: "Vendas PDV", v: sales.filter((x) => Number(x.customerId) === Number(drawer.id)).length, money: sales.filter((x) => Number(x.customerId) === Number(drawer.id)).reduce((s, x) => s + Number(x.total || 0), 0) },
              ].map((x) => (
                <div key={x.k} className="rounded-lg bg-ink-900 px-3 py-3 text-center">
                  <p className="font-mono text-[18px] leading-none font-semibold text-white tnum">{x.v}</p>
                  <p className="mt-1 text-[9px] tracking-wider text-ink-400 uppercase">{x.k}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-cyan-300 tnum">{formatMoney(x.money)}</p>
                </div>
              ))}
            </div>

            {/* Oportunidades no pipeline */}
            {leads.filter((l) => Number(l.customerId) === Number(drawer.id)).length > 0 && (
              <section>
                <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Oportunidades no pipeline</h4>
                <div className="space-y-1.5">
                  {leads.filter((l) => Number(l.customerId) === Number(drawer.id)).map((l) => (
                    <div key={String(l.id)} className="flex items-center justify-between gap-3 rounded-lg border border-paper-200 bg-white px-3 py-2">
                      <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-800">{String(l.title)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11.5px] tnum">{formatMoney(Number(l.expectedValue || 0))}</span>
                        <span className="h-2 w-2 rounded-full" style={{ background: COL_COLOR[String(l.column)] }} title={COL_LABEL[String(l.column)]} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Documentos recentes */}
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Documentos recentes</h4>
              {[
                ...quotes.filter((x) => Number(x.customerId) === Number(drawer.id)).slice(0, 4).map((x) => ({ n: x.number, s: x.status, t: Number(x.total || 0), kind: "ORC" })),
                ...orders.filter((x) => Number(x.customerId) === Number(drawer.id)).slice(0, 4).map((x) => ({ n: x.number, s: x.productionStatus || x.status, t: Number(x.total || 0), kind: "PED" })),
              ].length === 0 ? (
                <p className="text-[12px] text-ink-400">Nenhum documento emitido ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {[
                    ...quotes.filter((x) => Number(x.customerId) === Number(drawer.id)).slice(0, 4).map((x) => ({ n: x.number, s: x.status, t: Number(x.total || 0), kind: "ORC" })),
                    ...orders.filter((x) => Number(x.customerId) === Number(drawer.id)).slice(0, 4).map((x) => ({ n: x.number, s: x.productionStatus || x.status, t: Number(x.total || 0), kind: "PED" })),
                  ].map((d, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-paper-100 px-3 py-2">
                      <span className="flex items-center gap-2 font-mono text-[11.5px] font-semibold text-ink-800">
                        <Badge tone={d.kind === "ORC" ? "cyan" : "magenta"}>{d.kind}</Badge>
                        {String(d.n)}
                      </span>
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-[11.5px] tnum">{formatMoney(d.t)}</span>
                        <StatusBadge value={String(d.s)} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Endereço */}
            {(drawer.street || drawer.city) && (
              <section>
                <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Endereço</h4>
                <Card className="text-[12.5px] text-ink-700">
                  <p>{[drawer.street, drawer.number, drawer.complement].filter(Boolean).join(", ")}</p>
                  <p>{[drawer.district, drawer.city, drawer.state].filter(Boolean).join(" — ")}{drawer.cep ? ` · CEP ${drawer.cep}` : ""}</p>
                </Card>
              </section>
            )}

            {/* Linha do tempo de atividades */}
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">Linha do tempo</h4>
              <div className="mb-3 space-y-2 rounded-lg border border-paper-200 bg-white p-3">
                <div className="flex gap-2">
                  <Select value={actForm.type} onChange={(e) => setActForm((f) => ({ ...f, type: e.target.value }))} className="w-32">
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                  <Input
                    value={actForm.title}
                    onChange={(e) => setActForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="O que aconteceu?"
                    onKeyDown={(e) => { if (e.key === "Enter") addActivity(); }}
                  />
                  <Button size="sm" icon="plus" onClick={addActivity}>OK</Button>
                </div>
              </div>
              <div className="space-y-0">
                {activities.filter((a) => Number(a.customerId) === Number(drawer.id)).slice(0, 12).map((a, i, arr) => (
                  <div key={String(a.id)} className="relative flex gap-3 pb-4">
                    {i < arr.length - 1 && <span className="absolute top-5 left-[7px] h-full w-px bg-paper-300" />}
                    <span className="relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-proc-c bg-paper-50" />
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-tight font-semibold text-ink-800">{String(a.title)}</p>
                      {a.description && <p className="mt-0.5 text-[11.5px] text-ink-500">{String(a.description)}</p>}
                      <p className="mt-0.5 font-mono text-[9.5px] tracking-wide text-ink-400 uppercase">
                        {String(a.type)} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
                {activities.filter((a) => Number(a.customerId) === Number(drawer.id)).length === 0 && (
                  <p className="text-[12px] text-ink-400">Nenhuma interação registrada ainda.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
