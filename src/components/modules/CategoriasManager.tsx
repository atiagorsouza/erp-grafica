"use client";

/* ──────────────────────────────────────────────────────────────────
   Gestão de categorias — criar, renomear, mover e apagar.

   Até agora as categorias só nasciam de script. O dono pediu para
   poder mexer pela tela, e faz sentido: o negócio muda (ele acabou de
   começar a fazer abridor de botton) e esperar uma versão nova só
   para criar uma linha é absurdo.

   Vale para produto e material — o mesmo componente, mudando o
   `module`.

   Duas decisões de interface:

   · Mostra a ÁRVORE inteira, sempre. Categoria é coisa que se olha
     em conjunto: "onde encaixo isto?" só se responde vendo o resto.

   · O botão de apagar não pergunta "tem certeza?" e sim explica o
     que impede, quando impede. O servidor recusa apagar categoria
     com item dentro, e a mensagem dele é mais útil que um confirm.
   ────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge, Button, Card, IconButton, Input, Modal, Select, toast,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

type Row = Record<string, unknown>;

/* Emojis oferecidos. Lista curta de propósito: um seletor completo
   viraria distração, e o que importa é distinguir de relance. */
const EMOJIS = [
  "📁", "🖨️", "🎨", "🥤", "🤖", "📓", "🎉", "🛍️", "💼", "📣",
  "🏷️", "📄", "🧊", "✂️", "📦", "🧰", "👕", "🎖️", "🍪", "🏆",
  "☕", "🍸", "📑", "🖇️", "🎁", "💡",
];

const CORES = [
  "#0ea5e9", "#e11d8f", "#7c3aed", "#f59e0b", "#10b981",
  "#f43f5e", "#64748b", "#94a3b8", "#06b6d4", "#8b5cf6",
];

interface Props {
  categorias: Row[];
  /** "product" ou "material" */
  module: string;
  /** quantos itens cada categoria tem, por id */
  contagem?: Record<string, number>;
  titulo?: string;
}

export function CategoriasManager({ categorias, module, contagem = {}, titulo }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const arvore = useMemo(() => {
    const mestres = categorias
      .filter((c) => c.parentId == null)
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    return mestres.map((m) => ({
      mestre: m,
      filhos: categorias
        .filter((c) => Number(c.parentId) === Number(m.id))
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)),
    }));
  }, [categorias]);

  const mestres = categorias.filter((c) => c.parentId == null);

  /* Uma mestre "conta" o que está nela e em todas as filhas — é o que
     o operador quer saber antes de apagar. */
  function totalDe(cat: Row): number {
    const direto = contagem[String(cat.id)] ?? 0;
    const filhas = categorias
      .filter((c) => Number(c.parentId) === Number(cat.id))
      .reduce((s, f) => s + (contagem[String(f.id)] ?? 0), 0);
    return direto + filhas;
  }

  function abrirNovo(paiId?: unknown) {
    setEdit(null);
    setForm({
      name: "",
      icon: "📁",
      color: CORES[0],
      order: String((categorias.length + 1) * 1),
      parentId: paiId == null ? "" : String(paiId),
    });
    setAberto(true);
  }

  function abrirEdicao(c: Row) {
    setEdit(c);
    setForm({
      name: String(c.name ?? ""),
      icon: String(c.icon ?? "📁"),
      color: String(c.color ?? CORES[0]),
      order: String(c.order ?? 0),
      parentId: c.parentId == null ? "" : String(c.parentId),
    });
    setAberto(true);
  }

  async function chamar(op: string, data: Record<string, unknown>, id?: number) {
    setOcupado(true);
    try {
      const r = await fetch("/api/crud/item-categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, id, data }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(d.error || "Não foi possível concluir.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      toast.error("Falha de rede.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    const nome = form.name?.trim();
    if (!nome || nome.length < 2) {
      toast.error("Dê um nome à categoria.");
      return;
    }
    const data = {
      module,
      name: nome,
      icon: form.icon || "📁",
      color: form.color || CORES[0],
      order: Number(form.order) || 0,
      parentId: form.parentId ? Number(form.parentId) : null,
    };
    const ok = edit
      ? await chamar("update", data, Number(edit.id))
      : await chamar("create", data);
    if (ok) {
      toast.success(edit ? "Categoria atualizada." : "Categoria criada.");
      setAberto(false);
    }
  }

  async function apagar(c: Row) {
    const ok = await chamar("delete", {}, Number(c.id));
    if (ok) toast.success(`"${String(c.name)}" removida.`);
  }

  return (
    <Card className="mt-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="grow">
          <h2 className="display-expanded text-[15px] font-bold text-ink-900">
            {titulo || "Categorias"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Organizam a lista, a tabela de preços e o catálogo. Dois níveis:
            categoria mestre e subcategoria.
          </p>
        </div>
        <Button icon="plus" onClick={() => abrirNovo()} disabled={ocupado}>
          Nova mestre
        </Button>
      </div>

      {arvore.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-400">
          Nenhuma categoria ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {arvore.map(({ mestre, filhos }) => (
            <div key={String(mestre.id)} className="rounded-xl border border-paper-200 bg-white">
              {/* ── Mestre ── */}
              <div className="flex flex-wrap items-center gap-2 border-b border-paper-100 px-3.5 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: String(mestre.color) }}
                />
                <span className="text-[14px]">{String(mestre.icon)}</span>
                <span className="grow text-[13.5px] font-bold text-ink-900">
                  {String(mestre.name)}
                </span>
                {totalDe(mestre) > 0 && (
                  <Badge tone="neutral">{totalDe(mestre)} itens</Badge>
                )}
                <Button size="xs" variant="ghost" icon="plus" onClick={() => abrirNovo(mestre.id)}>
                  Subcategoria
                </Button>
                <IconButton size="sm" name="pencil" label="Editar" onClick={() => abrirEdicao(mestre)} />
                <IconButton
                  size="sm" name="trash" label="Apagar" tone="danger"
                  onClick={() => apagar(mestre)}
                />
              </div>

              {/* ── Filhas ── */}
              {filhos.length === 0 ? (
                <p className="px-3.5 py-2.5 text-[12px] text-ink-400">
                  Sem subcategorias. Os produtos vão direto nesta.
                </p>
              ) : (
                <div className="divide-y divide-paper-100">
                  {filhos.map((f) => {
                    const n = contagem[String(f.id)] ?? 0;
                    return (
                      <div key={String(f.id)} className="flex flex-wrap items-center gap-2 px-3.5 py-2 pl-8">
                        <span className="text-[13px] text-ink-300">└</span>
                        <span className="text-[13px]">{String(f.icon)}</span>
                        <span className="grow text-[12.5px] text-ink-800">{String(f.name)}</span>
                        <span
                          className={cn(
                            "font-mono text-[11px] tnum",
                            n === 0 ? "text-ink-300" : "text-ink-500"
                          )}
                        >
                          {n === 0 ? "vazia" : `${n} ${n === 1 ? "item" : "itens"}`}
                        </span>
                        <IconButton size="sm" name="pencil" label="Editar" onClick={() => abrirEdicao(f)} />
                        <IconButton
                          size="sm" name="trash" label="Apagar" tone="danger"
                          onClick={() => apagar(f)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-400">
        <Icon name="info" size={12} className="mt-0.5 shrink-0" />
        Categoria com item dentro não pode ser apagada — mova os itens antes.
        Subcategoria vazia é útil: aparece no catálogo mostrando o que você faz.
      </p>

      {/* ── Formulário ── */}
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={edit ? "Editar categoria" : "Nova categoria"}
        subtitle={form.parentId ? "Subcategoria" : "Categoria mestre"}
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button icon="check" onClick={salvar} disabled={ocupado}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Nome
            </span>
            <Input
              value={form.name || ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Bottons & Acessórios"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Fica dentro de
            </span>
            <Select
              value={form.parentId || ""}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
            >
              <option value="">— é uma categoria mestre —</option>
              {mestres
                .filter((m) => !edit || Number(m.id) !== Number(edit.id))
                .map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {String(m.icon)} {String(m.name)}
                  </option>
                ))}
            </Select>
          </label>

          <div>
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Ícone
            </span>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, icon: e }))}
                  className={cn(
                    "focus-ring flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-[15px] transition-colors",
                    form.icon === e
                      ? "border-proc-c bg-proc-c/10"
                      : "border-paper-200 hover:border-ink-300"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Cor
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  style={{ background: c }}
                  className={cn(
                    "focus-ring h-7 w-7 cursor-pointer rounded-lg border-2 transition-transform",
                    form.color === c ? "scale-110 border-ink-900" : "border-transparent"
                  )}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Ordem
            </span>
            <Input
              type="number"
              mono
              value={form.order || "0"}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
            />
            <span className="mt-1 block text-[11.5px] text-ink-400">
              Menor aparece primeiro. Use a ordem do que mais sai, não a alfabética.
            </span>
          </label>
        </div>
      </Modal>
    </Card>
  );
}
