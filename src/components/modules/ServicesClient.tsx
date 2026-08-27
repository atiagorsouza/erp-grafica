"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { formatMoney } from "@/lib/pricing";
import {
  Badge,
  Button,
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
  Th,
  Tr,
  toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";

 
type Row = Record<string, any>;

export function ServicesClient({ services, finishings, serviceCats, finishingCats }: {
  services: Row[];
  finishings: Row[];
  serviceCats: Row[];
  finishingCats: Row[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [tab, setTab] = useState<"servicos" | "acabamentos">("servicos");
  const [svcModal, setSvcModal] = useState<null | { edit?: Row }>(null);
  const [finModal, setFinModal] = useState<null | { edit?: Row }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const svcCat = (id: unknown) => serviceCats.find((c) => Number(c.id) === Number(id));
  const finCat = (id: unknown) => finishingCats.find((c) => Number(c.id) === Number(id));

  async function saveSvc(id?: number) {
    if (!form.name?.trim()) return toast.error("Informe o nome do serviço");
    setSaving(true);
    try {
      const data = {
        name: form.name,
        categoryId: form.categoryId || null,
        type: form.type || "proprio",
        baseCost: form.baseCost || "0",
        estimatedHours: form.estimatedHours || "0",
        becomesProduct: form.becomesProduct === "true",
        partner: form.partner || null,
        description: form.description || null,
      };
      if (id) await mutate("services", "update", data, id);
      else await mutate("services", "create", data);
      setSvcModal(null);
      toast.success("Serviço salvo");
      refresh();
    } catch (e) {
      toast.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function saveFin(id?: number) {
    if (!form.name?.trim()) return toast.error("Informe o nome do acabamento");
    setSaving(true);
    try {
      const data = {
        name: form.name,
        categoryId: form.categoryId || null,
        unit: form.unit || "unidade",
        unitCost: form.unitCost || "0",
        description: form.description || null,
      };
      if (id) await mutate("finishings", "update", data, id);
      else await mutate("finishings", "create", data);
      setFinModal(null);
      toast.success("Acabamento salvo");
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
        eyebrow="Mão de obra & pós-impressão"
        title="Serviços & Acabamentos"
        icon="scissors"
        description="Serviços próprios e terceirizados (design, DTF, lona) e acabamentos que compõem o custo dos produtos — laminação, corte, encadernação."
        actions={
          tab === "servicos" ? (
            <Button icon="plus" onClick={() => { setForm({ type: "proprio", becomesProduct: "false" }); setSvcModal({}); }}>Novo serviço</Button>
          ) : (
            <Button icon="plus" onClick={() => { setForm({ unit: "unidade" }); setFinModal({}); }}>Novo acabamento</Button>
          )
        }
      />

      <Segmented
        className="reveal mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "servicos", label: "Serviços", count: services.length },
          { value: "acabamentos", label: "Acabamentos", count: finishings.length },
        ]}
      />

      {tab === "servicos" && (
        services.length === 0 ? (
          <EmptyState icon="scissors" title="Nenhum serviço" hint="Cadastre design, modelagem 3D, sublimação e terceirizados." />
        ) : (
          <TableWrap className="reveal reveal-1">
            <thead>
              <tr>
                <Th>Serviço</Th>
                <Th>Categoria</Th>
                <Th>Execução</Th>
                <Th right>Custo base</Th>
                <Th right>Horas est.</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const cat = svcCat(s.categoryId);
                return (
                  <Tr key={String(s.id)}>
                    <Td>
                      <p className="font-semibold text-ink-900">{String(s.name)}</p>
                      {s.partner && <p className="text-[10.5px] text-ink-400">parceiro: {String(s.partner)}</p>}
                    </Td>
                    <Td>
                      {cat ? (
                        <span className="flex items-center gap-1.5 text-[12px]">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: String(cat.color) }} />
                          {String(cat.name)}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>
                      <Badge tone={s.type === "proprio" ? "cyan" : "magenta"} dot>
                        {s.type === "proprio" ? "próprio" : "terceirizado"}
                      </Badge>
                      {s.becomesProduct && <Badge tone="yellow" className="ml-1.5">vira produto</Badge>}
                    </Td>
                    <Td right mono className="font-semibold">{formatMoney(Number(s.baseCost || 0))}</Td>
                    <Td right mono>{Number(s.estimatedHours || 0)}h</Td>
                    <Td right>
                      <span className="flex justify-end gap-0.5">
                        <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                          const f: Record<string, string> = {};
                          for (const [k, v] of Object.entries(s)) if (v !== null && typeof v !== "object") f[k] = String(v);
                          setForm({ ...f, becomesProduct: String(!!s.becomesProduct) });
                          setSvcModal({ edit: s });
                        }} />
                        <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={async () => { if (confirm("Arquivar serviço? Itens usados em produtos/orçamentos serão preservados.")) { await mutate("services", "delete", { reason: "Arquivado pelo usuário" }, Number(s.id)); refresh(); } }} />
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )
      )}

      {tab === "acabamentos" && (
        finishings.length === 0 ? (
          <EmptyState icon="scissors" title="Nenhum acabamento" hint="Laminação, guilhotina, plastificação, encadernação…" />
        ) : (
          <TableWrap className="reveal reveal-1">
            <thead>
              <tr>
                <Th>Acabamento</Th>
                <Th>Categoria</Th>
                <Th>Unidade</Th>
                <Th right>Custo</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {finishings.map((f) => {
                const cat = finCat(f.categoryId);
                return (
                  <Tr key={String(f.id)}>
                    <Td className="font-semibold text-ink-900">{String(f.name)}</Td>
                    <Td>
                      {cat ? (
                        <span className="flex items-center gap-1.5 text-[12px]">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: String(cat.color) }} />
                          {String(cat.name)}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td><Badge tone="neutral">{String(f.unit || "unidade")}</Badge></Td>
                    <Td right mono className="font-semibold">{formatMoney(Number(f.unitCost || 0))}</Td>
                    <Td right>
                      <span className="flex justify-end gap-0.5">
                        <IconButton size="sm" name="pencil" label="Editar" onClick={() => {
                          const ff: Record<string, string> = {};
                          for (const [k, v] of Object.entries(f)) if (v !== null && typeof v !== "object") ff[k] = String(v);
                          setForm(ff);
                          setFinModal({ edit: f });
                        }} />
                        <IconButton size="sm" name="trash" label="Excluir" tone="danger" onClick={async () => { if (confirm("Arquivar acabamento? Produtos que usam este acabamento serão preservados.")) { await mutate("finishings", "delete", { reason: "Arquivado pelo usuário" }, Number(f.id)); refresh(); } }} />
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )
      )}

      {/* modal serviço */}
      <Modal open={!!svcModal} onClose={() => setSvcModal(null)} title={svcModal?.edit ? "Editar serviço" : "Novo serviço"}
        footer={<><Button variant="ghost" onClick={() => setSvcModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => saveSvc(svcModal?.edit ? Number(svcModal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2"><Input value={form.name || ""} onChange={set("name")} placeholder="Criação de Logo, DTF UV…" /></Field>
          <Field label="Categoria">
            <Select value={form.categoryId || ""} onChange={set("categoryId")}>
              <option value="">Sem categoria</option>
              {serviceCats.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.icon)} {String(c.name)}</option>)}
            </Select>
          </Field>
          <Field label="Execução">
            <Select value={form.type || "proprio"} onChange={set("type")}>
              <option value="proprio">Próprio</option>
              <option value="terceirizado">Terceirizado</option>
            </Select>
          </Field>
          {form.type === "terceirizado" && (
            <Field label="Parceiro / empresa"><Input value={form.partner || ""} onChange={set("partner")} /></Field>
          )}
          <Field label="Custo base (R$)"><Input mono value={form.baseCost || ""} onChange={set("baseCost")} /></Field>
          <Field label="Horas estimadas"><Input mono value={form.estimatedHours || "0"} onChange={set("estimatedHours")} /></Field>
          <Field label="Vira produto vendável?">
            <Select value={form.becomesProduct || "false"} onChange={set("becomesProduct")}>
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* modal acabamento */}
      <Modal open={!!finModal} onClose={() => setFinModal(null)} title={finModal?.edit ? "Editar acabamento" : "Novo acabamento"}
        footer={<><Button variant="ghost" onClick={() => setFinModal(null)}>Cancelar</Button><Button loading={saving} icon="check" onClick={() => saveFin(finModal?.edit ? Number(finModal.edit.id) : undefined)}>Salvar</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" required className="sm:col-span-2"><Input value={form.name || ""} onChange={set("name")} placeholder="Laminação Fosca, Encadernação…" /></Field>
          <Field label="Categoria">
            <Select value={form.categoryId || ""} onChange={set("categoryId")}>
              <option value="">Sem categoria</option>
              {finishingCats.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.icon)} {String(c.name)}</option>)}
            </Select>
          </Field>
          <Field label="Unidade de cobrança">
            <Select value={form.unit || "unidade"} onChange={set("unit")}>
              {["unidade", "folha", "peça", "lote", "metro", "m2"].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Custo unitário (R$)"><Input mono value={form.unitCost || ""} onChange={set("unitCost")} /></Field>
          <Field label="Descrição"><Input value={form.description || ""} onChange={set("description")} /></Field>
        </div>
      </Modal>
    </div>
  );
}
