"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";

type Estado = {
  status: "desconectado" | "conectando" | "qr" | "conectado" | "banido";
  qrDataUrl: string | null;
  qrExpiraEm: number | null;
  numero: string | null;
  nome: string | null;
  conectadoDesde: string | null;
  ultimoErro: string | null;
  tentativas: number;
  mensagensRecebidas: number;
  mensagensEnviadas: number;
  /* Conexão e bot são independentes: dá para estar conectado com o
     bot desligado (v3.53.0). */
  bot?: {
    pausado: boolean;
    pausadoAte: string | null;
    pausadoPor: string | null;
    motivo: string | null;
    ausenciaAtiva: boolean;
  };
};

const VAZIO: Estado = {
  status: "desconectado", qrDataUrl: null, qrExpiraEm: null, numero: null,
  nome: null, conectadoDesde: null, ultimoErro: null, tentativas: 0,
  mensagensRecebidas: 0, mensagensEnviadas: 0,
  bot: { pausado: false, pausadoAte: null, pausadoPor: null, motivo: null, ausenciaAtiva: false },
};

const ROTULO: Record<Estado["status"], { texto: string; tone: "green" | "amber" | "red" | "neutral" | "cyan" }> = {
  conectado:    { texto: "Conectado",     tone: "green" },
  qr:           { texto: "Aguardando QR", tone: "cyan" },
  conectando:   { texto: "Conectando…",   tone: "amber" },
  desconectado: { texto: "Desconectado",  tone: "neutral" },
  banido:       { texto: "Bloqueado",     tone: "red" },
};

/* `semCabecalho` (v3.56.0): quando esta tela virou aba, o PageHeader
   passou a viver na página — senão apareceria duas vezes, e sumiria
   junto com a aba quando o operador fosse ver as conversas. */
export function WhatsAppClient({ semCabecalho = false }: { semCabecalho?: boolean } = {}) {
  const [e, setE] = useState<Estado>(VAZIO);
  const [offline, setOffline] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [segundos, setSegundos] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  /* SSE mantém a tela viva: quando o QR troca ou a conexão abre, o
     serviço avisa. Sem isso o usuário ficaria clicando "atualizar"
     enquanto o QR expira a cada 60s. */
  useEffect(() => {
    let vivo = true;

    const abrir = () => {
      const es = new EventSource("/api/whatsapp/eventos");
      esRef.current = es;
      es.onmessage = (ev) => {
        if (!vivo) return;
        try { setE(JSON.parse(ev.data)); setOffline(null); } catch { /* ignora */ }
      };
      es.onerror = () => {
        es.close();
        if (!vivo) return;
        // Serviço caiu ou reiniciou: tenta de novo em 5s.
        setTimeout(() => { if (vivo) abrir(); }, 5000);
      };
    };

    // Primeira leitura por fetch: dá erro claro se o serviço não subiu.
    fetch("/api/whatsapp/status")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) { setOffline(j.dica || j.erro); return; }
        setE(j);
        abrir();
      })
      .catch(() => setOffline("Não consegui falar com o serviço."));

    return () => { vivo = false; esRef.current?.close(); };
  }, []);

  /* Contagem regressiva do QR — o do WhatsApp vira em ~60s.
     O primeiro cálculo vai dentro do intervalo (não solto no corpo do
     effect): chamar setState de forma síncrona aqui dispararia uma
     cascata de renders a cada troca de status. */
  useEffect(() => {
    if (e.status !== "qr" || !e.qrExpiraEm) return;
    const expira = e.qrExpiraEm;
    const tick = () => setSegundos(Math.max(0, Math.round((expira - Date.now()) / 1000)));
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [e.status, e.qrExpiraEm]);

  async function acao(rota: string, corpo?: unknown, msg?: string) {
    setOcupado(true);
    try {
      const r = await fetch(`/api/whatsapp/${rota}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo ?? {}),
      });
      /* Resposta pode não ser JSON (405 do proxy, 502 do nginx). Ler
         com json() direto estoura "Unexpected token" e o usuário vê
         um erro técnico no lugar da causa. */
      const j = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        throw new Error(
          j.erro ||
            (r.status === 405
              ? "O serviço recusou o método desta chamada."
              : r.status === 502 || r.status === 503
                ? "O serviço do WhatsApp não respondeu."
                : `Falhou (HTTP ${r.status}).`)
        );
      }
      if (msg) toast.success(msg);
      /* Pausar/retomar não geram evento SSE (o Baileys não mudou de
         estado). Relemos o status para a tela refletir na hora. */
      try {
        const s = await fetch("/api/whatsapp/status");
        if (s.ok) setE(await s.json());
      } catch { /* a próxima leitura corrige */ }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (offline) {
    return (
      <>
        {!semCabecalho && (
          <PageHeader
            eyebrow="Atendimento"
            title="WhatsApp"
            description="Conexão, pré-cadastro automático e monitoramento das conversas."
            icon="whatsapp"
          />
        )}
        <Card>
          <EmptyState
            icon="alert"
            title="O serviço do WhatsApp não está rodando"
            hint={offline}
          />
          <div className="mt-4 rounded-lg bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-paper-200">
            cd services/whatsapp<br />
            npm install<br />
            npm start
          </div>
          <p className="mt-3 text-[12.5px] text-ink-500">
            Em produção, deixe rodando com PM2 para subir sozinho depois de reiniciar o servidor:
            <span className="ml-1 font-mono text-ink-700">pm2 start npm --name printflow-whatsapp -- start</span>
          </p>
        </Card>
      </>
    );
  }

  const r = ROTULO[e.status];

  return (
    <>
      {!semCabecalho && (
      <PageHeader
        eyebrow="Atendimento"
        title="WhatsApp"
        description="Conexão, pré-cadastro automático e monitoramento das conversas."
        icon="whatsapp"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={r.tone} dot>{r.texto}</Badge>
            {e.status === "conectado" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Desconectar o WhatsApp? Será preciso ler o QR de novo para voltar.")) {
                    acao("desconectar", { apagarSessao: true }, "Desconectado.");
                  }
                }}
                disabled={ocupado}
              >
                Desconectar
              </Button>
            )}
            {(e.status === "desconectado" || e.status === "banido") && (
              <Button onClick={() => acao("reiniciar", {}, "Reconectando…")} disabled={ocupado}>
                Conectar
              </Button>
            )}
          </div>
        }
      />
      )}

      {/* ── Liga/desliga do bot ────────────────────────────────────
          Fica ACIMA das colunas, atravessando a tela: é a informação
          que muda o comportamento do sistema inteiro, e escondê-la
          numa coluna faria alguém achar que o bot está respondendo
          quando não está. */}
      {e.status === "conectado" && <ControleBot e={e} acao={acao} ocupado={ocupado} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* ── Conexão ── */}
        <Card>
          <h2 className="mb-1 text-[15px] font-semibold text-ink-900">Conexão</h2>

          {e.status === "qr" && e.qrDataUrl && (
            <>
              <p className="mb-4 text-[13px] leading-relaxed text-ink-600">
                No celular: <strong>WhatsApp → Configurações → Aparelhos conectados →
                Conectar aparelho</strong>, e aponte para o código.
              </p>
              <div className="flex justify-center rounded-xl border border-paper-300 bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.qrDataUrl} alt="QR Code do WhatsApp" width={280} height={280} />
              </div>
              {segundos !== null && (
                <p className="mt-3 text-center text-[12.5px] text-ink-500">
                  {segundos > 0
                    ? <>Este código expira em <strong className="text-ink-800">{segundos}s</strong> — outro aparece sozinho.</>
                    : "Gerando um novo código…"}
                </p>
              )}
            </>
          )}

          {e.status === "conectando" && (
            <div className="py-10 text-center">
              <Icon name="refresh" size={30} className="mx-auto animate-spin text-ink-400" />
              <p className="mt-3 text-[13px] text-ink-600">
                Conectando ao WhatsApp…
                {e.tentativas > 0 && <><br /><span className="text-ink-400">tentativa {e.tentativas}</span></>}
              </p>
            </div>
          )}

          {e.status === "conectado" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-ok-500/25 bg-ok-500/8 p-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ok-500/15">
                  <Icon name="check" size={20} className="text-ok-600" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink-900">{e.nome || "Conectado"}</p>
                  <p className="font-mono text-[12px] text-ink-500">{formatarNumero(e.numero)}</p>
                </div>
              </div>
              {e.conectadoDesde && (
                <p className="text-[12.5px] text-ink-500">
                  No ar desde {new Date(e.conectadoDesde).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}

          {e.status === "desconectado" && (
            <div className="py-8 text-center">
              <Icon name="whatsapp" size={34} className="mx-auto text-ink-300" />
              <p className="mt-3 text-[13px] text-ink-600">
                Nenhum aparelho conectado.
              </p>
              {e.ultimoErro && (
                <p className="mt-1 font-mono text-[11.5px] text-ink-400">motivo: {e.ultimoErro}</p>
              )}
              <Button className="mt-4" onClick={() => acao("reiniciar", {}, "Gerando QR…")} disabled={ocupado}>
                Gerar QR Code
              </Button>
            </div>
          )}

          {e.status === "banido" && (
            <div className="rounded-lg border border-danger-500/25 bg-danger-500/8 p-4">
              <p className="text-[13.5px] font-semibold text-danger-600">
                O WhatsApp recusou esta conexão
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">
                Pode ser bloqueio temporário do número. Espere algumas horas antes de
                tentar de novo — insistir agora piora a situação. Biblioteca não oficial
                não tem canal de recurso.
              </p>
            </div>
          )}
        </Card>

        {/* ── Como o bot se comporta ── */}
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-ink-900">Movimento</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-paper-200 bg-paper-100 p-3.5">
                <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">Recebidas</p>
                <p className="mt-0.5 text-[24px] font-bold text-ink-900">{e.mensagensRecebidas}</p>
              </div>
              <div className="rounded-lg border border-paper-200 bg-paper-100 p-3.5">
                <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">Enviadas</p>
                <p className="mt-0.5 text-[24px] font-bold text-ink-900">{e.mensagensEnviadas}</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              Contagem desta sessão. Zera quando o serviço reinicia.
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 text-[15px] font-semibold text-ink-900">O que o robô faz</h2>
            <ol className="space-y-2 text-[13px] leading-relaxed text-ink-600">
              <li><strong className="text-ink-800">1.</strong> Cliente escreve → vira lead com o telefone já normalizado</li>
              <li><strong className="text-ink-800">2.</strong> Pergunta o nome e grava no cadastro</li>
              <li><strong className="text-ink-800">3.</strong> Pergunta se é pessoa ou empresa</li>
              <li><strong className="text-ink-800">4.</strong> Passa para o atendimento humano</li>
            </ol>
            <div className="mt-4 space-y-1.5 border-t border-paper-200 pt-3 text-[12.5px] text-ink-500">
              <p>· Só responde a quem escreve primeiro — nunca aborda ninguém</p>
              <p>· Quem já é cliente não passa pelo funil</p>
              <p>· <span className="font-mono text-ink-700">atendente</span> chama uma pessoa na hora</p>
              <p>· <span className="font-mono text-ink-700">sair</span> registra opt-out e silencia de vez</p>
              <p>· Ignora grupos, status e listas de transmissão</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function formatarNumero(e164: string | null) {
  if (!e164) return "—";
  const d = e164.replace(/\D/g, "");
  const s = d.startsWith("55") ? d.slice(2) : d;
  if (s.length === 11) return `+55 (${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `+55 (${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return `+${d}`;
}

/* ──────────────────────────────────────────────────────────────────
   Liga/desliga do bot.

   A distinção que esta faixa precisa deixar óbvia: DESLIGAR O BOT não
   é desconectar o WhatsApp. O número continua no ar, recebendo e
   guardando tudo — só as respostas automáticas param.

   Sem isso, a única forma de calar o bot era "Desconectar", que
   derruba a sessão e exige ler o QR de novo no celular.
   ────────────────────────────────────────────────────────────────── */
function ControleBot({
  e,
  acao,
  ocupado,
}: {
  e: Estado;
  acao: (rota: string, corpo?: unknown, msg?: string) => void;
  ocupado: boolean;
}) {
  const bot = e.bot ?? {
    pausado: false, pausadoAte: null, pausadoPor: null, motivo: null, ausenciaAtiva: false,
  };
  const ativo = !bot.pausado;

  const ate = bot.pausadoAte ? new Date(bot.pausadoAte) : null;
  const ateTexto =
    ate && !Number.isNaN(ate.getTime())
      ? ate.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })
      : null;

  return (
    <Card className={`mb-5 ${ativo ? "" : "border-amber-300 bg-amber-50/40"}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            ativo ? "bg-ok-500/15 text-ok-600" : "bg-amber-100 text-amber-700"
          }`}
        >
          <Icon name={ativo ? "whatsapp" : "clock"} size={21} />
        </div>

        <div className="min-w-[240px] grow">
          <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink-900">
            Respostas automáticas
            <Badge tone={ativo ? "green" : "amber"} dot>
              {ativo ? "Ligadas" : "Desligadas"}
            </Badge>
          </p>

          {ativo ? (
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              O robô responde quem escreve, pré-cadastra e passa para a equipe.
            </p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-amber-800">
              O WhatsApp <strong>continua conectado</strong> e toda mensagem segue
              sendo recebida e gravada — mas ninguém recebe resposta automática.
              {ateTexto ? (
                <> Religa sozinho em <strong>{ateTexto}</strong>.</>
              ) : (
                <> Só volta quando você ligar de novo.</>
              )}
              {bot.motivo ? <> · {bot.motivo}</> : null}
            </p>
          )}

          {!ativo && (
            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={bot.ausenciaAtiva}
                disabled={ocupado}
                onChange={(ev) =>
                  acao(
                    "ausencia",
                    { ativa: ev.target.checked },
                    ev.target.checked ? "Aviso de ausência ligado." : "Aviso desligado."
                  )
                }
              />
              <span>
                Avisar quem escrever que estamos fora do atendimento automático
                <span className="block text-[11.5px] text-ink-400">
                  Uma vez por conversa. O texto está em Mensagens automáticas.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ativo ? (
            <>
              {/* Pausas curtas são o caso comum: almoço, uma reunião,
                  o fim do expediente. Prazo evita o esquecimento. */}
              {[
                { r: "1 hora", m: 60 },
                { r: "Até amanhã", m: 15 * 60 },
              ].map((o) => (
                <Button
                  key={o.m}
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    acao("pausar", { minutos: o.m, motivo: `pausa de ${o.r.toLowerCase()}` },
                      `Bot desligado por ${o.r.toLowerCase()}.`)
                  }
                >
                  {o.r}
                </Button>
              ))}
              <Button
                variant="danger"
                size="sm"
                icon="x"
                disabled={ocupado}
                onClick={() =>
                  acao("pausar", { minutos: null, motivo: "desligado manualmente" },
                    "Bot desligado. O WhatsApp continua conectado.")
                }
              >
                Desligar
              </Button>
            </>
          ) : (
            <Button
              icon="check"
              disabled={ocupado}
              onClick={() => acao("retomar", {}, "Bot ligado de novo.")}
            >
              Ligar respostas
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
