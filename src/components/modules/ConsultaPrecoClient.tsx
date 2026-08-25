"use client";

/* Consulta rápida de preço — para responder o cliente no WhatsApp.
   O dono descreveu o caso assim: "quando o cliente me perguntar qual o
   preço da foto no whatsapp eu teria uma resposta rápida".

   Então a tela é otimizada para UMA coisa: digitar duas letras, ver o
   preço e copiar um texto pronto. Sem modal, sem formulário, sem clique
   extra. O campo já vem focado e o primeiro resultado já vem aberto. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, PageHeader, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

export type ProdutoConsulta = {
  id: number;
  sku: string | null;
  nome: string;
  categoria: string;
  venda: number;
  custo: number;
  /* Unidade de venda (PEÇA 0 do PLANO-PORTAL-CLIENTE): "cartela",
     "cento", "pacote"… null = vendido por unidade. Sem isso o texto
     copiado dizia "1 un — R$ 12,90" no adesivo vendido por cartela
     de 60 — e o cliente do WhatsApp lia "1 adesivo por 12,90". */
  unidade: string | null;
  unidadeQtd: number | null;
  faixas: { qtd: number; preco: number }[];
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* 60 → "60" · 12.5 → "12,5" — sem moeda, é quantidade de peça. */
const qtdFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const qtd = (n: number) => qtdFmt.format(n);

/** "por cartela (com 60 un)" ou "por cartela" — null se venda por unidade. */
function sufixoUnidade(p: ProdutoConsulta): string | null {
  if (!p.unidade) return null;
  return p.unidadeQtd ? `por ${p.unidade} (com ${qtd(p.unidadeQtd)} un)` : `por ${p.unidade}`;
}

/* Sem acento e sem caixa: "cartao", "CARTÃO" e "Cartao" acham a mesma coisa. */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Monta o texto que o atendente cola na conversa. */
function textoWhatsApp(p: ProdutoConsulta) {
  const sufixo = sufixoUnidade(p);
  const linhas: string[] = [`*${p.nome}*`];

  /* Formato pedido pelo dono (PEÇA 0, ajuste 2): cada faixa mostra
     quantas UNIDADES o cliente leva — o cliente pensa em adesivos,
     não em cartelas. "2 — R$ 11,75 cada (R$ 23,50) (120 unidades)". */
  const unidadesDaFaixa = (qtdFaixa: number) => {
    const total = qtdFaixa * (p.unidadeQtd || 0);
    return ` (${qtd(total)} ${total === 1 ? "unidade" : "unidades"})`;
  };

  if (p.faixas.length > 1) {
    const porLinha = !!sufixo && !!p.unidadeQtd;
    /* Sem quantidade interna (ex.: só "cento"), o cabeçalho diz a
       unidade; com quantidade, a própria linha já informa. */
    if (sufixo && !porLinha) linhas.push(`${sufixo.charAt(0).toUpperCase()}${sufixo.slice(1)}:`);
    for (const f of p.faixas) {
      const total = f.preco * f.qtd;
      // Em faixa de quantidade, o cliente quer saber o total do pacote.
      if (f.qtd === 1) {
        linhas.push(
          porLinha ? `1 — ${brl(f.preco)}  ${unidadesDaFaixa(1).trim()}` : `1 un — ${brl(f.preco)}`
        );
      } else {
        linhas.push(
          porLinha
            ? `${qtd(f.qtd)} — ${brl(f.preco)} cada  (${brl(total)})${unidadesDaFaixa(f.qtd)}`
            : `${qtd(f.qtd)} un — ${brl(f.preco)} cada  (${brl(total)})`
        );
      }
    }
  } else {
    linhas.push(sufixo ? `${brl(p.venda)} ${sufixo}` : brl(p.venda));
  }

  return linhas.join("\n");
}

export function ConsultaPrecoClient({
  produtos,
  moldura,
}: {
  produtos: ProdutoConsulta[];
  /* Saudação e assinatura do Painel → Mensagens (grupo "Consulta de
     preço"). Vazia = desligada lá: o copiar sai puro como antes. */
  moldura?: { cabecalho: string; assinatura: string };
}) {
  const [busca, setBusca] = useState("");
  const [mostrarCusto, setMostrarCusto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Atalho "/" para voltar ao campo de busca sem tirar a mão do teclado. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") setBusca("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resultados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    if (!termos.length) return produtos;
    return produtos.filter((p) => {
      const alvo = normalizar(`${p.nome} ${p.sku ?? ""} ${p.categoria}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [busca, produtos]);

  /* Agrupado por categoria, na ordem em que os produtos chegam do servidor. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ProdutoConsulta[]>();
    for (const p of resultados) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)!.push(p);
    }
    return [...mapa.entries()];
  }, [resultados]);

  /* O texto que sai com a moldura: saudação em cima, tabela no meio,
     assinatura embaixo. O que estiver vazio simplesmente não entra —
     sem linha em branco fantasma. */
  function textoComMoldura(p: ProdutoConsulta) {
    return [moldura?.cabecalho, textoWhatsApp(p), moldura?.assinatura]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  async function copiar(p: ProdutoConsulta) {
    const texto = textoComMoldura(p);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${p.nome} copiado`);
    } catch {
      // Clipboard bloqueado (http sem TLS, por exemplo): cai no textarea.
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast.success(`${p.nome} copiado`);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Atendimento"
        title="Consulta Rápida de Preço"
        description="Digite o produto, veja o preço e copie a resposta pronta para o WhatsApp."
        icon="search"
        actions={
          <button
            type="button"
            onClick={() => setMostrarCusto((v) => !v)}
            className={cn(
              "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[11px] tracking-wide uppercase transition",
              mostrarCusto
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-paper-300 bg-paper-50 text-ink-500 hover:text-ink-800"
            )}
          >
            <Icon name={mostrarCusto ? "eye" : "info"} size={14} />
            {mostrarCusto ? "Custo à vista" : "Ver custo"}
          </button>
        }
      />

      {/* Busca grudada no topo: o atendente rola a lista sem perder o campo. */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 bg-paper-100/95 px-1 py-2 backdrop-blur">
        <div className="relative">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-400"
          />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="foto, cartão, cópia colorida, agenda…"
            className="focus-ring w-full rounded-xl border border-paper-300 bg-paper-50 py-3.5 pr-24 pl-11 text-[15px] shadow-card placeholder:text-ink-400"
          />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 font-mono text-[10.5px] text-ink-400">
            {resultados.length} {resultados.length === 1 ? "item" : "itens"}
          </span>
        </div>
      </div>

      {!resultados.length && (
        <Card className="py-12 text-center">
          <Icon name="search" size={28} className="mx-auto mb-3 text-ink-300" />
          <p className="text-[14px] font-semibold text-ink-700">
            Nenhum produto com “{busca}”
          </p>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Tente uma palavra só — “foto”, “copo”, “espiral”.
          </p>
        </Card>
      )}

      <div className="space-y-5">
        {grupos.map(([categoria, itens]) => (
          <section key={categoria}>
            <h2 className="mb-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-proc-c-strong uppercase">
              {categoria}
            </h2>

            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {itens.map((p) => {
                const margem = p.venda ? ((p.venda - p.custo) / p.venda) * 100 : 0;
                return (
                  <Card key={p.id} pad={false} className="overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] leading-tight font-semibold text-ink-900">
                          {p.nome}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] tracking-wide text-ink-400">
                          {p.sku}
                          {mostrarCusto && (
                            <span className="ml-2 text-amber-700">
                              custo {brl(p.custo)} · {margem.toFixed(0)}%
                            </span>
                          )}
                        </p>

                        {/* As faixas são o que o cliente pergunta em seguida:
                            "e se eu levar 100?". Já ficam à vista. */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(p.faixas.length ? p.faixas : [{ qtd: 1, preco: p.venda }]).map(
                            (f) => (
                              <span
                                key={f.qtd}
                                className="rounded-md bg-paper-200/70 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-ink-700"
                              >
                                <b className="mr-1 text-proc-c-strong">{f.qtd}</b>
                                {brl(f.preco)}
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="font-mono text-[19px] leading-none font-semibold text-ink-900 tnum">
                          {brl(p.faixas.length ? p.faixas[0].preco : p.venda)}
                        </span>
                        {/* "R$ 12,90" sozinho já fez cliente ler "por
                            adesivo" no produto vendido por cartela. */}
                        {p.unidade && (
                          <span className="font-mono text-[10px] leading-tight whitespace-nowrap text-ink-400">
                            {`por ${p.unidade}${p.unidadeQtd ? ` · ${qtd(p.unidadeQtd)} un` : ""}`}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => copiar(p)}
                          className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide text-paper-50 uppercase transition hover:bg-ink-800"
                        >
                          <Icon name="copy" size={13} />
                          copiar
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-center font-mono text-[10.5px] text-ink-400">
        Atalhos: <b>/</b> volta para a busca · <b>Esc</b> limpa
      </p>
    </>
  );
}
