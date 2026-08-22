"use client";

/* ──────────────────────────────────────────────────────────────────
   Vendedores e comissão.

   A tela responde duas perguntas, nesta ordem:
     1. Quanto tenho de pagar de comissão este mês?
     2. De onde saiu esse número?

   Por isso o resumo vem primeiro e o extrato abre por vendedor. O
   cadastro fica numa aba à parte: mexe-se nele uma vez por contratação,
   não todo dia.
   ────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  Select,
  Segmented,
  Td,
  Th,
  TableWrap,
  Tr,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";

interface Vendedor {
  id: number;
  name: string;
  nickname: string | null;
  commissionRate: number;
  active: boolean | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

interface LinhaResumo {
  sellerId: number;
  nome: string;
  taxa: number;
  pedidos: number;
  vendido: number;
  margem: number;
  comissao: number;
  estimados: number;
}

interface Resumo {
  de: string;
  ate: string;
  linhas: LinhaResumo[];
  totalVendido: number;
  totalComissao: number;
}

interface LinhaExtrato {
  orderId: number;
  numero: string;
  fechadoEm: string;
  total: number;
  margem: number;
  taxa: number;
  comissao: number;
  estimado: boolean;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export function SellersClient({
  vendedores,
  soltos,
  resumo,
  de,
  ate,
}: {
  vendedores: Vendedor[];
  soltos: string[];
  resumo: Resumo;
  de: string;
  ate: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("comissoes");
  const [modal, setModal] = useState<null | { edit?: Vendedor }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const [periodo, setPeriodo] = useState({ de, ate });
  const [extratoDe, setExtratoDe] = useState<number | null>(null);
  const [extrato, setExtrato] = useState<LinhaExtrato[] | null>(null);
  const [carregandoExtrato, setCarregandoExtrato] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const abrirExtrato = useCallback(
    async (sellerId: number) => {
      setExtratoDe(sellerId);
      setCarregandoExtrato(true);
      try {
        const r = await fetch(
          `/api/crud/sellers?extrato=${sellerId}&de=${periodo.de}&ate=${periodo.ate}`
        );
        const d = await r.json();
        setExtrato(d?.extrato?.linhas || []);
      } catch {
        toast.error("Não consegui carregar o extrato.");
        setExtrato([]);
      } finally {
        setCarregandoExtrato(false);
      }
    },
    [periodo]
  );

  /* Trocar o período recarrega o resumo pelo servidor (a URL guarda o
     estado, então o dono pode mandar o link para o contador). */
  useEffect(() => {
    if (periodo.de === de && periodo.ate === ate) return;
    const t = setTimeout(() => {
      router.push(`/vendedores?de=${periodo.de}&ate=${periodo.ate}`);
    }, 400);
    return () => clearTimeout(t);
  }, [periodo, de, ate, router]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/crud/sellers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: modal?.edit ? "update" : "create",
          id: modal?.edit?.id,
          data: {
            name: form.name || "",
            nickname: form.nickname || null,
            document: form.document || null,
            phone: form.phone || null,
            email: form.email || null,
            commissionRate: Number(String(form.commissionRate || "0").replace(",", ".")),
            active: form.active !== "nao",
            notes: form.notes || null,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d?.error || "Não foi possível salvar.");
        return;
      }
      toast.success("Vendedor salvo");
      setModal(null);
      router.refresh();
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function desativar(v: Vendedor) {
    if (!confirm(`Desativar ${v.nickname || v.name}? O histórico dele continua no extrato.`)) return;
    await fetch("/api/crud/sellers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "archive", id: v.id }),
    });
    toast.success("Vendedor desativado");
    router.refresh();
  }

  const ativos = vendedores.filter((v) => v.active);

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Vendedores & Comissão"
        description="Quem vendeu, quanto rendeu e quanto tem a receber."
        icon="person"
        actions={
          <Button
            icon="plus"
            onClick={() => {
              setForm({ commissionRate: "0", active: "sim" });
              setModal({});
            }}
          >
            Novo vendedor
          </Button>
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        className="mt-4"
        options={[
          { value: "comissoes", label: "Comissões", count: resumo.linhas.length },
          { value: "cadastro", label: "Cadastro", count: vendedores.length },
        ]}
      />

      {tab === "comissoes" && (
        <>
          <Card className="mt-5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="De">
                <Input
                  type="date"
                  value={periodo.de}
                  onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
                />
              </Field>
              <Field label="Até">
                <Input
                  type="date"
                  value={periodo.ate}
                  onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
                />
              </Field>
              <div className="grow" />
              <div className="rounded-xl border border-paper-200 bg-paper-50 px-4 py-2.5 text-center">
                <p className="font-mono text-[10px] tracking-wide text-ink-400 uppercase">
                  Total a pagar
                </p>
                <p className="text-[18px] font-bold text-proc-c-strong tnum">
                  {brl(resumo.totalComissao)}
                </p>
              </div>
            </div>
          </Card>

          {resumo.linhas.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon="person"
                title="Nenhuma comissão no período"
                hint="A comissão entra quando o pedido é concluído ou entregue — pedido em produção ainda não conta."
              />
            </Card>
          ) : (
            <Card className="mt-4 overflow-hidden p-0">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Vendedor</Th>
                    <Th right>Pedidos</Th>
                    <Th right>Vendido</Th>
                    <Th right>Margem</Th>
                    <Th right>Taxa</Th>
                    <Th right>Comissão</Th>
                    <Th right>Extrato</Th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.linhas.map((l) => (
                    <Tr key={l.sellerId}>
                      <Td>
                        <p className="font-semibold text-ink-900">{l.nome}</p>
                        {l.estimados > 0 && (
                          <p className="text-[10.5px] text-amber-700">
                            {l.estimados} pedido(s) com margem estimada
                          </p>
                        )}
                      </Td>
                      <Td right mono>{l.pedidos}</Td>
                      <Td right mono>{brl(l.vendido)}</Td>
                      <Td right mono>{brl(l.margem)}</Td>
                      <Td right mono>{l.taxa}%</Td>
                      <Td right mono className="font-bold text-proc-c-strong">
                        {brl(l.comissao)}
                      </Td>
                      <Td right>
                        <IconButton
                          size="sm"
                          name="eye"
                          label="Ver extrato"
                          onClick={() => abrirExtrato(l.sellerId)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          )}

          {/* Extrato — de onde veio o número */}
          {extratoDe !== null && (
            <Card className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[14px] font-bold text-ink-900">
                    Extrato de {resumo.linhas.find((l) => l.sellerId === extratoDe)?.nome || "vendedor"}
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    Pedido a pedido, como o número foi montado.
                  </p>
                </div>
                <Button variant="ghost" icon="close" onClick={() => { setExtratoDe(null); setExtrato(null); }}>
                  Fechar
                </Button>
              </div>

              {carregandoExtrato ? (
                <p className="py-6 text-center text-[12.5px] text-ink-400">Carregando…</p>
              ) : !extrato || extrato.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-ink-400">
                  Nenhum pedido fechado no período.
                </p>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Pedido</Th>
                      <Th>Fechado em</Th>
                      <Th right>Total</Th>
                      <Th right>Margem</Th>
                      <Th right>Comissão</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrato.map((l) => (
                      <Tr key={l.orderId}>
                        <Td mono className="font-bold">
                          {l.numero}
                          {l.estimado && (
                            <Badge tone="amber" className="ml-1.5">estimado</Badge>
                          )}
                        </Td>
                        <Td mono>{dataBR(l.fechadoEm)}</Td>
                        <Td right mono>{brl(l.total)}</Td>
                        <Td right mono>{brl(l.margem)}</Td>
                        <Td right mono className="font-bold text-proc-c-strong">
                          {brl(l.comissao)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}

              {extrato?.some((l) => l.estimado) && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                  <strong>Margem estimada:</strong> esses pedidos têm itens digitados
                  à mão, sem produto cadastrado — não dá para saber o custo real. O
                  sistema usou a margem padrão do Painel. Cadastrar o produto corrige
                  daqui para a frente.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {tab === "cadastro" && (
        <>
          {/* Nomes que já aparecem em pedidos mas não têm cadastro:
              é a ponte do texto livre antigo para o cadastro novo. */}
          {soltos.length > 0 && (
            <Card className="mt-5 border-cyan-200 bg-cyan-50/50">
              <p className="text-[12.5px] font-semibold text-ink-800">
                Nomes que aparecem em pedidos e ainda não estão cadastrados
              </p>
              <p className="mt-0.5 mb-2.5 text-[11.5px] text-ink-500">
                Foram digitados à mão antes de existir este cadastro. Cadastre para
                que as vendas antigas passem a somar comissão.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {soltos.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setForm({ name: n, commissionRate: "0", active: "sim" });
                      setModal({});
                    }}
                    className="focus-ring cursor-pointer rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-cyan-800 transition-colors hover:bg-cyan-100"
                  >
                    + {n}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {vendedores.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon="person"
                title="Nenhum vendedor cadastrado"
                hint="Cadastre quem vende para acompanhar comissão e extrato por pessoa."
              />
            </Card>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {vendedores.map((v) => (
                <div
                  key={v.id}
                  className="group rounded-xl border border-paper-200 bg-paper-50 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-ink-900">
                        {v.nickname || v.name}
                      </p>
                      {v.nickname && (
                        <p className="truncate text-[11px] text-ink-400">{v.name}</p>
                      )}
                    </div>
                    <Badge tone={v.active ? "green" : "magenta"}>
                      {v.active ? "ativo" : "inativo"}
                    </Badge>
                  </div>

                  <p className="mt-3 font-mono text-[20px] font-bold text-proc-c-strong tnum">
                    {v.commissionRate}%
                  </p>
                  <p className="font-mono text-[10px] tracking-wide text-ink-400 uppercase">
                    sobre a margem
                  </p>

                  <div className="mt-3 space-y-0.5 text-[11.5px] text-ink-600">
                    {v.phone && (
                      <p className="flex items-center gap-1.5">
                        <Icon name="phone" size={12} className="text-ink-400" />
                        {v.phone}
                      </p>
                    )}
                    {v.email && <p className="truncate">{v.email}</p>}
                  </div>

                  <div className="mt-3 flex justify-end gap-0.5 border-t border-dashed border-paper-300 pt-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton
                      size="sm"
                      name="pencil"
                      label="Editar"
                      onClick={() => {
                        setForm({
                          name: v.name,
                          nickname: v.nickname || "",
                          document: v.document || "",
                          phone: v.phone || "",
                          email: v.email || "",
                          commissionRate: String(v.commissionRate),
                          active: v.active ? "sim" : "nao",
                          notes: v.notes || "",
                        });
                        setModal({ edit: v });
                      }}
                    />
                    {v.active && (
                      <IconButton
                        size="sm"
                        name="trash"
                        tone="danger"
                        label="Desativar"
                        onClick={() => desativar(v)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.edit ? "Editar vendedor" : "Novo vendedor"}
        subtitle="A comissão é calculada sobre a margem dos pedidos concluídos."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button loading={salvando} icon="check" onClick={salvar}>Salvar</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome completo" required className="sm:col-span-2">
            <Input value={form.name || ""} onChange={set("name")} placeholder="Tiago Souza" />
          </Field>
          <Field label="Como aparece no PDV" hint="Em branco usa o primeiro nome">
            <Input value={form.nickname || ""} onChange={set("nickname")} placeholder="Tiago" />
          </Field>
          <Field label="Comissão (%)" hint="Sobre a margem, não sobre o total">
            <Input
              mono
              value={form.commissionRate || ""}
              onChange={set("commissionRate")}
              placeholder="3"
            />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone || ""} onChange={set("phone")} placeholder="(21) 9…" />
          </Field>
          <Field label="CPF">
            <Input mono value={form.document || ""} onChange={set("document")} />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input value={form.email || ""} onChange={set("email")} />
          </Field>
          <Field label="Situação">
            <Select value={form.active || "sim"} onChange={set("active")}>
              <option value="sim">Ativo</option>
              <option value="nao">Inativo</option>
            </Select>
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Input value={form.notes || ""} onChange={set("notes")} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
