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
import { formatCEP, formatCNPJ, formatCPF, formatPhone, formatStateRegistration } from "@/lib/validators";
import { todayISO } from "@/lib/period";
import { PedirCadastroModal } from "@/components/modules/PedirCadastroModal";

type Row = Record<string, any>;

const COLUMNS = ["novo", "qualificacao", "orcamento", "negociacao", "ganho", "perdido"];
/* Rótulos legíveis dos campos estruturados do cadastro (v3.22.0).
   O banco guarda a chave; a ficha mostra o texto. */
const ORIGIN_LABEL: Record<string, string> = {
  balcao: "Balcão",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  instagram: "Instagram",
  site: "Site",
  google: "Google",
  marketplace: "Marketplace",
  importacao: "Importação",
  outro: "Outro",
};
const MARITAL_LABEL: Record<string, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
  uniao_estavel: "União estável",
};

/* Data ISO -> dd/mm/aaaa, sem passar por Date (evita fuso). */
function brDate(v: unknown): string {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/* Idade em anos completos, para a ficha e o aviso de aniversário. */
function ageFrom(v: unknown): number | null {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const today = new Date();
  let age = today.getFullYear() - Number(m[1]);
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  if (md < Number(m[2]) * 100 + Number(m[3])) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/* Aniversário hoje? Compara só dia e mês. */
function isBirthdayToday(v: unknown): boolean {
  const m = String(v || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return false;
  /* compara com o "hoje" da loja: no navegador do usuário o fuso é o
     dele, mas o restante do sistema raciocina em America/Sao_Paulo */
  return `${m[1]}-${m[2]}` === todayISO().slice(5, 10);
}

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

export function ClientsClient({ customers, leads, activities, quotes, orders, sales, registrationLinks = [] }: {
  customers: Row[];
  leads: Row[];
  activities: Row[];
  quotes: Row[];
  orders: Row[];
  sales: Row[];
  /** Links de cadastro público vivos (v3.50.0). Opcional para não
      quebrar quem monta este componente em teste. */
  registrationLinks?: Row[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const params = useSearchParams();
  const [tab, setTab] = useState<"carteira" | "pipeline">("carteira");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");

  const [importOpen, setImportOpen] = useState(false);
  const [custModal, setCustModal] = useState<null | { edit?: Row }>(null);
  const [leadModal, setLeadModal] = useState<null | { edit?: Row; column?: string }>(null);
  const [deleteModal, setDeleteModal] = useState<null | { id: number; name: string; kind: "customer" | "lead" }>(null);
  const [drawerId, setDrawerId] = useState<number | null>(params.get("id") ? Number(params.get("id")) : null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [actForm, setActForm] = useState({ type: "nota", title: "", description: "" });
  /* Modal do link público de cadastro (v3.50.0). Guarda o cliente
     inteiro, não só o id: o modal precisa do opt-out e do telefone
     para decidir se o bot pode enviar. */
  const [cadastroModal, setCadastroModal] = useState<Row | null>(null);

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /* Máscara aplicada enquanto digita: o operador digita só números e o
     campo se formata sozinho. Evita CPF gravado em três formatos
     diferentes e o retrabalho de conferir pontuação. */
  const setMasked =
    (k: string, mask: (v: string) => string) =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: mask(e.target.value) }));

  /* O documento muda de máscara conforme PF/PJ escolhido no seletor. */
  const setDocument = (e: { target: { value: string } }) =>
    setForm((f) => ({
      ...f,
      document: f.type === "pj" ? formatCNPJ(e.target.value) : formatCPF(e.target.value),
    }));
  const drawer = customers.find((c) => Number(c.id) === drawerId) || null;

  /* Último link de cadastro por cliente. A lista já vem ordenada do
     mais novo para o mais velho, então o primeiro que aparece vence. */
  const linkPorCliente = useMemo(() => {
    const map = new Map<number, Row>();
    for (const l of registrationLinks) {
      const cid = Number(l.customerId);
      if (!map.has(cid)) map.set(cid, l);
    }
    return map;
  }, [registrationLinks]);

  /* LTV por cliente — soma vendas PDV + pedidos */
  const ltv = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sales) map.set(Number(s.customerId), (map.get(Number(s.customerId)) || 0) + Number(s.total || 0));
    for (const o of orders) map.set(Number(o.customerId), (map.get(Number(o.customerId)) || 0) + Number(o.total || 0));
    return map;
  }, [sales, orders]);

  /* Filtro de clientes */
  const filtered = useMemo(() => customers.filter((c) => {
    /* Busca também por IE, RG, WhatsApp e contato PJ: são os números
       que o cliente informa ao telefone quando não lembra o CNPJ. */
    const mq = !q || [
      c.name, c.tradeName, c.document, c.email, c.phone,
      c.whatsapp, c.stateRegistration, c.municipalRegistration, c.rg, c.contactName,
    ].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase()));
    const ms = statusFilter === "all" || c.status === statusFilter;
    const mo = originFilter === "all" || String(c.origin || "") === originFilter;
    return mq && ms && mo;
  }), [customers, q, statusFilter, originFilter]);

  /* Origens presentes na carteira, da mais comum para a menos comum. */
  const originsInUse = useMemo(() => {
    const acc = new Map<string, number>();
    for (const c of customers) {
      const k = String(c.origin || "").trim();
      if (k) acc.set(k, (acc.get(k) || 0) + 1);
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  }, [customers]);

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
        rgIssuer: form.rgIssuer?.trim() || null,
        birthDate: form.birthDate?.trim() || null,
        gender: form.gender || null,
        maritalStatus: form.maritalStatus || null,
        stateRegistration: form.stateRegistration?.trim() || null,
        municipalRegistration: form.municipalRegistration?.trim() || null,
        legalNature: form.legalNature?.trim() || null,
        taxRegime: form.taxRegime || null,
        companySize: form.companySize || null,
        foundedAt: form.foundedAt?.trim() || null,
        origin: form.origin || null,
        whatsappOptOut: form.whatsappOptOut === "1",
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
            <Button variant="outline" icon="download" onClick={() => setImportOpen(true)}>
              Importar PDF
            </Button>
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
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, documento, IE, contato…" className="pl-8.5" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="all">Todos os status</option>
              <option value="lead">Leads</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="bloqueado">Bloqueados</option>
            </Select>
            {/* "De onde vêm meus clientes?" — só lista as origens que
                realmente aparecem na carteira. */}
            {originsInUse.length > 0 && (
              <Select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} className="w-auto">
                <option value="all">Todas as origens</option>
                {originsInUse.map(([key, count]) => (
                  <option key={key} value={key}>
                    {(ORIGIN_LABEL[key] || key) + ` (${count})`}
                  </option>
                ))}
              </Select>
            )}
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
                    <p className="flex items-center gap-1.5 text-[12px]">
                      {/* Cliente que veio do bot tem número só em
                          `whatsapp` — `phone` fica vazio. Ler só
                          `phone` mostrava "—" para quem TEM telefone,
                          e o operador achava que precisava perguntar
                          de novo. */}
                      {String(c.phone || c.whatsapp || "—")}
                      {/* aviso na própria lista: evita o disparo antes
                          mesmo de abrir a ficha */}
                      {c.whatsappOptOut === true && (
                        <span title="Cliente não aceita WhatsApp" className="font-mono text-[9px] tracking-wide text-amber-700 uppercase">
                          sem zap
                        </span>
                      )}
                    </p>
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
                        for (const [k, v] of Object.entries(c)) {
                          if (v === null || typeof v === "object") continue;
                          /* checkbox usa "1"/""; o banco devolve boolean */
                          f[k] = typeof v === "boolean" ? (v ? "1" : "") : String(v);
                        }
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
        {/* ── IDENTIFICAÇÃO ── */}
        <FormSection title="Identificação">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={form.type === "pj" ? "Razão social" : "Nome completo"}
              required
              className="sm:col-span-2"
            >
              <Input value={form.name || ""} onChange={set("name")} autoFocus />
            </Field>

            {form.type === "pj" && (
              <Field label="Nome fantasia" className="sm:col-span-2">
                <Input value={form.tradeName || ""} onChange={set("tradeName")} />
              </Field>
            )}

            <Field label={form.type === "pj" ? "CNPJ" : "CPF"} required>
              <Input
                mono
                value={form.document || ""}
                onChange={setDocument}
                inputMode="numeric"
                placeholder={form.type === "pj" ? "00.000.000/0001-00" : "000.000.000-00"}
              />
            </Field>

            <Field label="Origem do cliente">
              <Select value={form.origin || ""} onChange={set("origin")}>
                <option value="">—</option>
                <option value="balcao">Balcão</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="indicacao">Indicação</option>
                <option value="instagram">Instagram</option>
                <option value="site">Site</option>
                <option value="google">Google</option>
                <option value="marketplace">Marketplace</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
          </div>
        </FormSection>

        {/* ── DOCUMENTOS ── */}
        <FormSection title={form.type === "pj" ? "Dados da empresa" : "Documentos pessoais"}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {form.type === "pj" ? (
              <>
                <Field label="Inscrição estadual" hint="ou ISENTO">
                  <Input
                    mono
                    value={form.stateRegistration || ""}
                    onChange={setMasked("stateRegistration", formatStateRegistration)}
                    placeholder="ISENTO"
                  />
                </Field>
                <Field label="Inscrição municipal">
                  <Input mono value={form.municipalRegistration || ""} onChange={set("municipalRegistration")} />
                </Field>
                <Field label="Regime tributário">
                  <Select value={form.taxRegime || ""} onChange={set("taxRegime")}>
                    <option value="">—</option>
                    <option>Simples Nacional</option>
                    <option>Lucro Presumido</option>
                    <option>Lucro Real</option>
                    <option>MEI</option>
                  </Select>
                </Field>
                <Field label="Porte da empresa">
                  <Select value={form.companySize || ""} onChange={set("companySize")}>
                    <option value="">—</option>
                    <option value="MEI">MEI</option>
                    <option value="ME">Microempresa (ME)</option>
                    <option value="EPP">Pequeno porte (EPP)</option>
                    <option value="demais">Demais</option>
                  </Select>
                </Field>
                <Field label="Data de fundação">
                  <Input mono type="date" value={form.foundedAt || ""} onChange={set("foundedAt")} />
                </Field>
              </>
            ) : (
              <>
                <Field label="RG">
                  <Input mono value={form.rg || ""} onChange={set("rg")} />
                </Field>
                <Field label="Órgão emissor">
                  <Input value={form.rgIssuer || ""} onChange={set("rgIssuer")} placeholder="DETRAN-RJ" />
                </Field>
                <Field label="Data de nascimento">
                  <Input mono type="date" value={form.birthDate || ""} onChange={set("birthDate")} />
                </Field>
                <Field label="Estado civil">
                  <Select value={form.maritalStatus || ""} onChange={set("maritalStatus")}>
                    <option value="">—</option>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="uniao_estavel">União estável</option>
                  </Select>
                </Field>
              </>
            )}
          </div>
        </FormSection>

        {/* ── ENDEREÇO (CEP primeiro: preenche o resto) ── */}
        <FormSection title="Endereço">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field
              label="CEP"
              className="sm:col-span-2"
              hint={fetchingCep ? "buscando endereço…" : "preenche o resto sozinho"}
            >
              <Input
                mono
                value={form.cep || ""}
                onChange={setMasked("cep", formatCEP)}
                onBlur={handleCepBlur}
                inputMode="numeric"
                placeholder="00000-000"
              />
            </Field>
            <Field label="Rua / Logradouro" className="sm:col-span-3">
              <Input value={form.street || ""} onChange={set("street")} placeholder="Rua das Flores" />
            </Field>
            <Field label="Número">
              <Input value={form.number || ""} onChange={set("number")} placeholder="100" />
            </Field>
            <Field label="Complemento" className="sm:col-span-2">
              <Input value={form.complement || ""} onChange={set("complement")} placeholder="Sala 2, fundos…" />
            </Field>
            <Field label="Bairro" className="sm:col-span-2">
              <Input value={form.district || ""} onChange={set("district")} />
            </Field>
            <Field label="Cidade">
              <Input value={form.city || ""} onChange={set("city")} />
            </Field>
            <Field label="UF">
              <Input
                value={form.state || ""}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="RJ"
              />
            </Field>
          </div>
        </FormSection>

        {/* ── CONTATO ── */}
        <FormSection title="Contato">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone">
              <Input
                mono
                value={form.phone || ""}
                onChange={setMasked("phone", formatPhone)}
                inputMode="numeric"
                placeholder="(21) 3000-0000"
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                mono
                value={form.whatsapp || ""}
                onChange={setMasked("whatsapp", formatPhone)}
                inputMode="numeric"
                placeholder="(21) 99999-0000"
              />
            </Field>
            <Field label="E-mail" className="sm:col-span-2">
              <Input value={form.email || ""} onChange={set("email")} type="email" placeholder="email@empresa.com.br" />
            </Field>

            {form.type === "pj" && (
              <>
                <Field label="Pessoa de contato">
                  <Input value={form.contactName || ""} onChange={set("contactName")} />
                </Field>
                <Field label="Cargo do contato">
                  <Input value={form.contactRole || ""} onChange={set("contactRole")} />
                </Field>
              </>
            )}

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.whatsappOptOut === "1"}
                onChange={(e) => setForm((f) => ({ ...f, whatsappOptOut: e.target.checked ? "1" : "" }))}
                className="h-4 w-4 accent-ink-900"
              />
              <span className="text-[12.5px] text-ink-700">
                Cliente NÃO autoriza mensagens automáticas de WhatsApp
              </span>
            </label>
          </div>
        </FormSection>

        {/* ── COMERCIAL ── */}
        <FormSection title="Situação comercial" last>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Status">
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
        </FormSection>
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
            : <>A oportunidade <strong>&ldquo;{deleteModal?.name}&rdquo;</strong> será marcada como perdida, preservando o histórico.</>
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
              {/* A recusa de WhatsApp precisa ser visível antes de
                  qualquer tentativa de contato, não escondida no form. */}
              {drawer.whatsappOptOut === true && <Badge tone="amber">Não enviar WhatsApp</Badge>}
              {isBirthdayToday(drawer.birthDate) && <Badge tone="green">Aniversário hoje</Badge>}
              {/* Estado do link de cadastro público: o operador precisa
                  saber se já pediu e se o cliente abriu, antes de
                  cobrar de novo. */}
              {(() => {
                const l = linkPorCliente.get(Number(drawer.id));
                if (!l) return null;
                if (l.status === "concluido") return <Badge tone="green">Cadastro pelo link</Badge>;
                if (l.status === "aberto") return <Badge tone="cyan">Link aberto, não concluído</Badge>;
                return <Badge tone="amber">Link enviado, não aberto</Badge>;
              })()}
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
                {/* Cadastro completo é política da empresa para todo
                    pedido. Este botão é o caminho curto: gera o link
                    público e deixa o operador conferir a mensagem
                    antes do bot mandar. */}
                <Button
                  variant="outline"
                  icon="whatsapp"
                  onClick={() => setCadastroModal(drawer)}
                >
                  {["pendente", "aberto"].includes(
                    String(linkPorCliente.get(Number(drawer.id))?.status || "")
                  )
                    ? "Reenviar cadastro"
                    : "Pedir cadastro"}
                </Button>
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
                    for (const [k, v] of Object.entries(drawer)) {
                      if (v === null || typeof v === "object") continue;
                      f[k] = typeof v === "boolean" ? (v ? "1" : "") : String(v);
                    }
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
                { icon: "phone" as const, k: "Telefone", v: drawer.phone || drawer.whatsapp },
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

            {/* Dados cadastrais — o que o formulário coleta e a ficha
                antes não devolvia. Só rende linha o que está preenchido,
                para PF e PJ não carregarem campos um do outro. */}
            {(() => {
              const isPJ = drawer.type === "pj";
              const rows: { k: string; v: string }[] = [];

              if (isPJ) {
                if (drawer.stateRegistration) rows.push({ k: "Inscrição estadual", v: String(drawer.stateRegistration) });
                if (drawer.municipalRegistration) rows.push({ k: "Inscrição municipal", v: String(drawer.municipalRegistration) });
                if (drawer.taxRegime) rows.push({ k: "Regime tributário", v: String(drawer.taxRegime) });
                if (drawer.companySize) rows.push({ k: "Porte", v: String(drawer.companySize) });
                if (drawer.foundedAt) rows.push({ k: "Fundação", v: brDate(drawer.foundedAt) });
                if (drawer.contactName) rows.push({ k: "Contato", v: String(drawer.contactName) });
              } else {
                if (drawer.rg) {
                  rows.push({
                    k: "RG",
                    v: [drawer.rg, drawer.rgIssuer].filter(Boolean).join(" · "),
                  });
                }
                if (drawer.birthDate) {
                  const age = ageFrom(drawer.birthDate);
                  rows.push({
                    k: "Nascimento",
                    v: brDate(drawer.birthDate) + (age !== null ? ` · ${age} anos` : ""),
                  });
                }
                if (drawer.maritalStatus) {
                  rows.push({
                    k: "Estado civil",
                    v: MARITAL_LABEL[String(drawer.maritalStatus)] || String(drawer.maritalStatus),
                  });
                }
              }

              if (drawer.origin) {
                rows.push({
                  k: "Origem",
                  v: ORIGIN_LABEL[String(drawer.origin)] || String(drawer.origin),
                });
              }
              if (Number(drawer.creditLimit || 0) > 0) {
                rows.push({ k: "Limite de crédito", v: formatMoney(Number(drawer.creditLimit)) });
              }

              if (rows.length === 0) return null;

              return (
                <section>
                  <h4 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                    Dados cadastrais
                  </h4>
                  <Card className="divide-y divide-paper-200 py-0 text-[12.5px]">
                    {rows.map((r) => (
                      <div key={r.k} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-ink-500">{r.k}</span>
                        <span className="text-right font-medium text-ink-800">{r.v}</span>
                      </div>
                    ))}
                  </Card>
                </section>
              );
            })()}

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

      <PedirCadastroModal
        cliente={
          cadastroModal
            ? {
                id: Number(cadastroModal.id),
                name: String(cadastroModal.name || ""),
                whatsapp: cadastroModal.whatsapp as string | null,
                phone: cadastroModal.phone as string | null,
                whatsappOptOut: cadastroModal.whatsappOptOut as boolean | null,
              }
            : null
        }
        onClose={() => setCadastroModal(null)}
        onDone={refresh}
      />

      {/* ── IMPORTAR CLIENTES DO SISTEMA ANTIGO ── */}
      <ImportCustomersModal
        key={importOpen ? "import-open" : "import-closed"}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setImportOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

/* ==================================================================
   IMPORTAÇÃO DE CLIENTES (PDF DO SISTEMA ANTIGO)
   ================================================================== */

type ImportPreviewRow = {
  legacyCode: string | null;
  name: string;
  document: string | null;
  type: "pf" | "pj";
  email: string | null;
  phone: string | null;
  city: string | null;
};

type ImportResult = {
  confirmed: boolean;
  totalFichas: number;
  imported: number;
  updated: number;
  skipped: number;
  issues: { index: number; name: string; reason: string }[];
  preview: ImportPreviewRow[];
};

function ImportCustomersModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(confirm: boolean) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (confirm) fd.append("confirm", "1");

      const res = await fetch("/api/crm/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na importação");

      setResult(json as ImportResult);
      if (confirm) {
        toast.success(
          "Importação concluída",
          `${json.imported} novos · ${json.updated} atualizados`
        );
        onDone();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  }

  /* Depois de simular, o mesmo botão passa a gravar. */
  const simulated = !!result && !result.confirmed;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar clientes do sistema antigo"
      subtitle="Envie o PDF com as fichas de cliente exportadas do sistema anterior."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {simulated ? (
            <Button icon="check" loading={busy} onClick={() => send(true)}>
              Confirmar importação
            </Button>
          ) : (
            <Button icon="eye" loading={busy} disabled={!file} onClick={() => send(false)}>
              Analisar arquivo
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <label className="block cursor-pointer rounded-xl border border-dashed border-paper-300 bg-paper-50 px-4 py-6 text-center transition-colors hover:border-ink-400">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
          <Icon name="download" size={20} className="mx-auto mb-1.5 text-ink-400" />
          <p className="text-[13px] font-semibold text-ink-800">
            {file ? file.name : "Escolher arquivo PDF"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB — clique para trocar`
              : "Relatório “Ficha do Cliente” do sistema anterior · até 8 MB"}
          </p>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] leading-relaxed text-red-800">
            {error}
          </p>
        )}

        {result && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "fichas lidas", value: result.totalFichas, tone: "text-ink-800" },
                { label: "novos", value: result.imported, tone: "text-emerald-700" },
                { label: "já existem", value: result.updated, tone: "text-cyan-700" },
                { label: "ignorados", value: result.skipped, tone: "text-amber-700" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-paper-200 bg-white px-2 py-2 text-center">
                  <p className={cn("font-mono text-[19px] leading-none font-semibold tnum", s.tone)}>
                    {s.value}
                  </p>
                  <p className="mt-1 text-[10px] tracking-wider text-ink-500 uppercase">{s.label}</p>
                </div>
              ))}
            </div>

            {simulated && (
              <p className="rounded-lg bg-cyan-50 px-3 py-2 text-[12px] leading-relaxed text-cyan-900">
                Nada foi gravado ainda. Confira a prévia abaixo e clique em
                <strong> Confirmar importação</strong> para efetivar.
                {result.updated > 0 && (
                  <>
                    {" "}
                    Os {result.updated} já cadastrados terão apenas os campos em branco
                    preenchidos — nada do que você já digitou é sobrescrito.
                  </>
                )}
              </p>
            )}

            {result.preview.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-paper-200">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-paper-50 text-left font-mono text-[10px] tracking-wider text-ink-500 uppercase">
                    <tr>
                      <th className="px-2 py-1.5">Nome</th>
                      <th className="px-2 py-1.5">Documento</th>
                      <th className="px-2 py-1.5">Contato</th>
                      <th className="px-2 py-1.5">Cidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((p, i) => (
                      <tr key={`${p.legacyCode}-${i}`} className="border-t border-paper-200">
                        <td className="px-2 py-1.5">
                          {p.name}
                          <span className="ml-1 rounded bg-paper-100 px-1 text-[9.5px] text-ink-500 uppercase">
                            {p.type}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{p.document || "—"}</td>
                        <td className="max-w-[150px] truncate px-2 py-1.5 text-ink-600">
                          {p.email || p.phone || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-ink-600">{p.city || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.totalFichas > result.preview.length && (
                  <p className="border-t border-paper-200 bg-paper-50 px-2 py-1 text-center text-[11px] text-ink-500">
                    … e mais {result.totalFichas - result.preview.length} fichas
                  </p>
                )}
              </div>
            )}

            {result.issues.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="mb-1 text-[11.5px] font-semibold text-amber-900">
                  {result.issues.length} ficha(s) com observação
                </p>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[11.5px] leading-snug text-amber-900">
                  {result.issues.map((it) => (
                    <li key={`${it.index}-${it.name}`}>
                      <span className="font-mono">#{it.index}</span> {it.name} — {it.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ==================================================================
   AGRUPAMENTO VISUAL DO FORMULÁRIO
   ================================================================== */

/**
 * Bloco de campos com título, no mesmo espírito das caixas da ficha do
 * sistema antigo. Mantém a paleta e os componentes existentes — só
 * organiza: um cadastro com ~25 campos numa grade única vira parede.
 */
function FormSection({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "mb-5"}>
      <h3 className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
        {title}
        <span className="h-px flex-1 bg-paper-200" />
      </h3>
      {children}
    </section>
  );
}
