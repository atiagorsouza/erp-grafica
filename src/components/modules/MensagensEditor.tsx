"use client";

/* ──────────────────────────────────────────────────────────────────
   Editor das mensagens que o bot envia.

   Fica na página do WhatsApp mas FORA da checagem de conexão: dá para
   escrever o texto com o bot desligado. Corrigir uma vírgula não pode
   depender do celular estar pareado.

   O padrão nunca some. "Restaurar" é um clique, e o texto de fábrica
   fica visível ao lado enquanto se edita — ninguém precisa lembrar do
   que estava escrito antes.
   ────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Textarea, toast } from "@/components/ui";
import { Icon } from "@/components/icons";

export interface MensagemItem {
  slug: string;
  titulo: string;
  quando: string;
  grupo: "bot" | "cadastro" | "orcamento" | "rapidas" | "campanha";
  padrao: string;
  texto: string;
  ativa: boolean;
  customizada: boolean;
  variaveis: { nome: string; descricao: string }[];
  atualizadaEm: string | Date | null;
}

const GRUPOS: { id: MensagemItem["grupo"]; titulo: string; desc: string }[] = [
  {
    id: "bot",
    titulo: "Conversa do bot",
    desc: "O que ele responde a quem escreve. Ele só fala com quem falou primeiro.",
  },
  {
    id: "cadastro",
    titulo: "Pedido de cadastro",
    desc: 'O texto que sai quando você clica em "Pedir cadastro" na ficha do cliente.',
  },
  {
    id: "orcamento",
    titulo: "Envio de orçamento",
    desc: 'O texto que sai quando você clica em "WhatsApp" na tela de Orçamentos.',
  },
  {
    id: "rapidas",
    titulo: "Respostas rápidas do chat",
    desc: "Atalhos de um clique enquanto você atende. Só aparecem quando você assumiu a conversa.",
  },
];

function Item({ m, onSaved }: { m: MensagemItem; onSaved: () => void }) {
  const [texto, setTexto] = useState(m.texto);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const mudou = texto.trim() !== m.texto.trim();
  const igualPadrao = texto.trim() === m.padrao.trim();

  async function chamar(payload: Record<string, unknown>, sucesso: string) {
    setSalvando(true);
    try {
      const r = await fetch("/api/crud/message-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: m.slug, ...payload }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(d.error || "Não foi possível salvar.");
        return;
      }
      toast.success(sucesso);
      onSaved();
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-paper-200 bg-white">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Icon
          name="chevron-down"
          size={14}
          className={`mt-1 shrink-0 text-ink-400 transition-transform ${aberto ? "" : "-rotate-90"}`}
        />
        <span className="grow">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink-900">{m.titulo}</span>
            {m.customizada && <Badge tone="cyan">editada</Badge>}
            {!m.ativa && <Badge tone="amber">desligada</Badge>}
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-500">{m.quando}</span>
          {!aberto && (
            <span className="mt-1.5 block truncate font-mono text-[11.5px] text-ink-400">
              {m.texto.replace(/\n+/g, " · ").slice(0, 96)}
            </span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-paper-200 px-4 py-4">
          <Textarea
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            className="min-h-[132px] font-mono text-[12.5px]"
          />

          {m.variaveis.length > 0 ? (
            <div className="mt-2.5">
              <p className="mb-1.5 font-mono text-[10px] tracking-wider text-ink-400 uppercase">
                Você pode usar
              </p>
              <div className="flex flex-wrap gap-1.5">
                {m.variaveis.map((v) => (
                  <button
                    key={v.nome}
                    type="button"
                    title={v.descricao}
                    onClick={() => setTexto((t) => `${t}{${v.nome}}`)}
                    className="rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono text-[11px] text-ink-700 transition hover:border-proc-c hover:text-proc-c"
                  >
                    {"{" + v.nome + "}"}
                    <span className="ml-1.5 font-sans text-[10.5px] text-ink-400">
                      {v.descricao}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-ink-400">
              Esta mensagem não usa variáveis.
            </p>
          )}

          {m.customizada && !igualPadrao && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11.5px] font-medium text-ink-500">
                Ver o texto original
              </summary>
              <pre className="mt-1.5 rounded-lg bg-paper-100 p-3 font-mono text-[11.5px] whitespace-pre-wrap text-ink-600">
                {m.padrao}
              </pre>
            </details>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon="check"
              disabled={!mudou || salvando}
              onClick={() => chamar({ op: "save", body: texto, active: m.ativa }, "Mensagem salva.")}
            >
              Salvar
            </Button>
            {mudou && (
              <Button size="sm" variant="ghost" onClick={() => setTexto(m.texto)}>
                Desfazer
              </Button>
            )}
            {m.customizada && (
              <Button
                size="sm"
                variant="outline"
                icon="refresh"
                disabled={salvando}
                onClick={() => chamar({ op: "restore" }, "Texto original restaurado.")}
              >
                Restaurar original
              </Button>
            )}
            <span className="ml-auto text-[11px] text-ink-400">
              {m.atualizadaEm && m.customizada
                ? `editada em ${new Date(m.atualizadaEm).toLocaleDateString("pt-BR")}`
                : "texto de fábrica"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MensagensEditor({ mensagens }: { mensagens: MensagemItem[] }) {
  const router = useRouter();
  const recarregar = () => router.refresh();

  return (
    <Card className="mt-5">
      <div className="mb-4">
        <h2 className="display-expanded text-[15px] font-bold text-ink-900">
          Mensagens automáticas
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Tudo que o sistema escreve para o cliente. Edite à vontade — o texto
          original fica guardado e volta com um clique. Não precisa reiniciar
          nada: vale na próxima mensagem.
        </p>
      </div>

      <div className="space-y-5">
        {GRUPOS.map((g) => {
          const doGrupo = mensagens.filter((m) => m.grupo === g.id);
          if (!doGrupo.length) return null;
          return (
            <section key={g.id}>
              <h3 className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                {g.titulo}
              </h3>
              <p className="mt-0.5 mb-2 text-[12px] text-ink-400">{g.desc}</p>
              <div className="space-y-2">
                {doGrupo.map((m) => (
                  <Item key={m.slug} m={m} onSaved={recarregar} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
