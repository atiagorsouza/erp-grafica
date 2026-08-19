"use client";

/* ──────────────────────────────────────────────────────────────────
   Chat de acompanhamento com takeover.

   A tela existe para responder uma pergunta: quem está esperando?

   Por isso a lista é ordenada pela última mensagem e destaca as
   conversas com mensagem recebida sem resposta. O resto é
   consequência disso.

   "Assumir" silencia o bot NAQUELA conversa (não no sistema todo — o
   liga/desliga geral fica na faixa acima). Enquanto assumida, o bot
   continua gravando tudo, mas não responde: dois falando ao mesmo
   tempo é pior que ninguém falando.
   ────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

interface Conversa {
  phoneE164: string;
  customerId: number | null;
  nome: string;
  etapa: string;
  assumidaPor: string | null;
  ultimaMensagem: string | null;
  ultimaEm: string | null;
  ultimaDirecao: string | null;
  naoLidas: number;
  optOut: boolean;
}

interface Mensagem {
  id: number;
  direcao: "recebida" | "enviada";
  texto: string;
  criadoEm: string;
}

function hora(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function telefoneBonito(e164: string) {
  const d = e164.replace(/\D/g, "");
  const s = d.startsWith("55") ? d.slice(2) : d;
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return e164;
}

export function ChatWhatsApp() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregarConversas = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp-chat");
      const d = (await r.json()) as { conversas?: Conversa[] };
      setConversas(d.conversas || []);
    } catch {
      /* silencioso: o polling tenta de novo */
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarMensagens = useCallback(async (fone: string) => {
    try {
      const r = await fetch(`/api/whatsapp-chat?fone=${encodeURIComponent(fone)}`);
      const d = (await r.json()) as { mensagens?: Mensagem[] };
      setMensagens(d.mensagens || []);
    } catch {
      /* idem */
    }
  }, []);

  /* Polling a cada 8s. SSE seria mais elegante, mas o stream de
     eventos do serviço é sobre a CONEXÃO, não sobre mensagens novas —
     e inventar um segundo canal para isto seria complexidade sem
     retorno numa tela que o operador olha por minutos, não horas. */
  useEffect(() => {
    let vivo = true;
    /* A primeira carga vai num timeout de 0 em vez de direto no corpo
       do efeito: chamar setState de forma síncrona aqui dispara
       renderização em cascata (o lint reclama, e com razão). */
    const inicial = setTimeout(() => { if (vivo) void carregarConversas(); }, 0);
    const t = setInterval(() => { if (vivo) void carregarConversas(); }, 8000);
    return () => { vivo = false; clearTimeout(inicial); clearInterval(t); };
  }, [carregarConversas]);

  useEffect(() => {
    if (!aberta) return;
    let vivo = true;
    const inicial = setTimeout(() => { if (vivo) void carregarMensagens(aberta); }, 0);
    const t = setInterval(() => { if (vivo) void carregarMensagens(aberta); }, 6000);
    return () => { vivo = false; clearTimeout(inicial); clearInterval(t); };
  }, [aberta, carregarMensagens]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  const atual = conversas.find((c) => c.phoneE164 === aberta) || null;

  async function acao(rota: string, corpo: unknown, sucesso: string) {
    try {
      const r = await fetch(`/api/whatsapp/${rota}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        toast.error(d.erro || "Não foi possível concluir.");
        return false;
      }
      toast.success(sucesso);
      await carregarConversas();
      return true;
    } catch {
      toast.error("O serviço do WhatsApp não respondeu.");
      return false;
    }
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || !aberta) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ para: aberta, texto: t }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        toast.error(d.erro || "Não foi possível enviar.");
        return;
      }
      setTexto("");
      await carregarMensagens(aberta);
      await carregarConversas();
    } catch {
      toast.error("O serviço do WhatsApp não respondeu.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <Card className="mt-5">
        <p className="py-8 text-center text-[13px] text-ink-500">Carregando conversas…</p>
      </Card>
    );
  }

  return (
    <Card className="mt-5 overflow-hidden p-0">
      <div className="border-b border-paper-200 px-5 py-3.5">
        <h2 className="display-expanded text-[15px] font-bold text-ink-900">
          Conversas
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Tudo que entra pelo WhatsApp fica aqui, mesmo com o robô desligado.
          Assumir uma conversa cala o robô só nela.
        </p>
      </div>

      {conversas.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon="whatsapp"
            title="Nenhuma conversa ainda"
            hint="Quando alguém escrever para o número conectado, a conversa aparece aqui — com o histórico completo."
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[290px_1fr]">
          {/* ── Lista ── */}
          <div className="max-h-[540px] overflow-y-auto border-b border-paper-200 lg:border-r lg:border-b-0">
            {conversas.map((c) => (
              <button
                key={c.phoneE164}
                type="button"
                onClick={() => setAberta(c.phoneE164)}
                className={cn(
                  "block w-full border-b border-paper-100 px-4 py-3 text-left transition-colors",
                  aberta === c.phoneE164 ? "bg-proc-c/8" : "hover:bg-paper-50"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="grow truncate text-[13px] font-semibold text-ink-900">
                    {c.nome}
                  </span>
                  {c.naoLidas > 0 && (
                    <span className="shrink-0 rounded-full bg-proc-m px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                      {c.naoLidas}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">
                    {hora(c.ultimaEm)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">
                  {c.ultimaDirecao === "enviada" && (
                    <Icon name="check" size={10} className="mr-1 inline text-ink-400" />
                  )}
                  {(c.ultimaMensagem || "").replace(/\n+/g, " ")}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.assumidaPor && <Badge tone="cyan">você assumiu</Badge>}
                  {c.optOut && <Badge tone="amber">sem zap</Badge>}
                  {!c.customerId && <Badge tone="neutral">sem cadastro</Badge>}
                </span>
              </button>
            ))}
          </div>

          {/* ── Conversa ── */}
          {!atual ? (
            <div className="flex min-h-[380px] items-center justify-center p-6">
              <p className="text-[13px] text-ink-400">Escolha uma conversa ao lado.</p>
            </div>
          ) : (
            <div className="flex min-h-[540px] flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 px-4 py-2.5">
                <div className="grow">
                  <p className="text-[13.5px] font-semibold text-ink-900">{atual.nome}</p>
                  <p className="font-mono text-[11.5px] text-ink-500">
                    {telefoneBonito(atual.phoneE164)}
                  </p>
                </div>
                {atual.customerId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="eye"
                    onClick={() => window.open(`/clientes?id=${atual.customerId}`, "_blank")}
                  >
                    Ficha
                  </Button>
                )}
                {atual.assumidaPor ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon="refresh"
                    onClick={() => acao("devolver", { telefone: atual.phoneE164 }, "Robô voltou a responder.")}
                  >
                    Devolver ao robô
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    icon="person"
                    onClick={() => acao("assumir", { telefone: atual.phoneE164, atendente: "operador" }, "Você assumiu — o robô calou nesta conversa.")}
                  >
                    Assumir
                  </Button>
                )}
              </div>

              <div className="grow space-y-2 overflow-y-auto bg-[#0b141a] px-4 py-3">
                {mensagens.length === 0 && (
                  <p className="py-8 text-center text-[12.5px] text-ink-400">
                    Sem mensagens nesta conversa.
                  </p>
                )}
                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap",
                      m.direcao === "enviada"
                        ? "ml-auto rounded-tr-sm bg-[#005c4b] text-[#e9edef]"
                        : "rounded-tl-sm bg-[#202c33] text-[#e9edef]"
                    )}
                  >
                    {m.texto}
                    <span className="mt-1 block text-right font-mono text-[9.5px] text-[#8696a0]">
                      {hora(m.criadoEm)}
                    </span>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>

              <div className="border-t border-paper-200 p-3">
                {atual.optOut ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
                    Este cliente pediu para não receber mensagens. Responder aqui é
                    possível, mas só faça se ele escreveu agora.
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    placeholder="Escreva sua resposta…"
                    className="grow"
                  />
                  <Button icon="send" onClick={enviar} disabled={enviando || !texto.trim()}>
                    {enviando ? "…" : "Enviar"}
                  </Button>
                </div>
                {!atual.assumidaPor && (
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    Dica: clique em <strong>Assumir</strong> antes de conversar, para o
                    robô não responder junto.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
