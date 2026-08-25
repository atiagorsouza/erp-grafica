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

interface PedidoResumo {
  id: number;
  numero: string;
  status: string;
  producao: string;
  total: number;
  entrega: string | null;
  criadoEm: string;
}

interface VendaResumo {
  id: number;
  numero: string;
  total: number;
  pagamento: string | null;
  criadoEm: string;
}

interface OrcamentoResumo {
  id: number;
  numero: string;
  total: number;
  status: string;
  criadoEm: string;
}

interface CobrancaResumo {
  id: number;
  descricao: string;
  valor: number;
  status: string;
  criadoEm: string;
}

interface Ficha {
  id: number;
  nome: string;
  tipo: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  desde: string | null;
  ltv: number;
  pedidos: PedidoResumo[];
  orcamentosAbertos: number;
  vendas: VendaResumo[];
  orcamentos: OrcamentoResumo[];
  cobrancas: CobrancaResumo[];
}

interface Rapida {
  slug: string;
  titulo: string;
  texto: string;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dataBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
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

/* Rótulos em português para a ficha 360º — mesmos nomes que as telas
   de origem (PDV, orçamentos, cobranças) usam, para o operador não
   precisar traduzir status cru do banco. */
const ROTULO_ORC: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

const ROTULO_COB: Record<string, string> = {
  pendente: "Aguardando",
  pago: "Pago",
  expirado: "Expirado",
  cancelado: "Cancelado",
  erro: "Erro",
};

const ROTULO_PAG: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  debit_card: "Débito",
  credito: "Crédito",
  credit_card: "Crédito",
};

/* ── FICHA 360º ── corpo reaproveitado em dois lugares: na coluna
   lateral (telas largas, sempre visível — estilo Waplus) e no overlay
   que cobre a conversa (telas estreitas). O conteúdo é O MESMO; muda
   só a moldura em volta. */
function PainelFicha({ ficha }: { ficha: Ficha }) {
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Já comprou", v: brl(ficha.ltv) },
          { k: "Pedidos", v: String(ficha.pedidos.length) },
          { k: "Orç. abertos", v: String(ficha.orcamentosAbertos) },
        ].map((x) => (
          <div key={x.k} className="rounded-lg border border-paper-200 bg-white px-2.5 py-2 text-center">
            <p className="font-mono text-[9.5px] tracking-wide text-ink-400 uppercase">{x.k}</p>
            <p className="mt-0.5 text-[13px] font-bold text-ink-900">{x.v}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-wide text-ink-400 uppercase">
          Últimas compras no balcão
        </p>
        {ficha.vendas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-paper-300 px-3 py-4 text-center text-[12px] text-ink-400">
            Nenhuma venda no balcão.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ficha.vendas.map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2">
                <div className="min-w-0 grow">
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{v.numero}</p>
                  <p className="text-[11px] text-ink-500">
                    {ROTULO_PAG[v.pagamento || ""] || (v.pagamento || "").replace(/_/g, " ") || "—"}
                    {" · "}
                    {dataBR(v.criadoEm)}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-proc-c-strong">{brl(v.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-wide text-ink-400 uppercase">
          Últimos pedidos
        </p>
        {ficha.pedidos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-paper-300 px-3 py-4 text-center text-[12px] text-ink-400">
            Nenhum pedido ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ficha.pedidos.map((p) => (
              <button
                key={p.id}
                onClick={() => window.open(`/pedidos?id=${p.id}`, "_blank")}
                className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2 text-left transition-colors hover:border-cyan-400"
              >
                <div className="min-w-0 grow">
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{p.numero}</p>
                  <p className="text-[11px] text-ink-500">
                    {p.producao.replace(/_/g, " ")} · entrega {dataBR(p.entrega)}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-proc-c-strong">{brl(p.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-wide text-ink-400 uppercase">
          Últimos orçamentos
        </p>
        {ficha.orcamentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-paper-300 px-3 py-4 text-center text-[12px] text-ink-400">
            Nenhum orçamento.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ficha.orcamentos.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2">
                <div className="min-w-0 grow">
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{o.numero}</p>
                  <p className="text-[11px] text-ink-500">
                    {ROTULO_ORC[o.status] || o.status} · {dataBR(o.criadoEm)}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-proc-c-strong">{brl(o.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-wide text-ink-400 uppercase">
          Últimas cobranças
        </p>
        {ficha.cobrancas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-paper-300 px-3 py-4 text-center text-[12px] text-ink-400">
            Nenhuma cobrança.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ficha.cobrancas.map((k) => (
              <div key={k.id} className="flex items-center gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2">
                <div className="min-w-0 grow">
                  <p className="truncate text-[11.5px] font-semibold text-ink-900">{k.descricao || "—"}</p>
                  <p className="text-[11px] text-ink-500">
                    {ROTULO_COB[k.status] || k.status} · {dataBR(k.criadoEm)}
                  </p>
                </div>
                <span className="font-mono text-[12px] font-bold text-proc-c-strong">{brl(k.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-paper-300 pt-2.5 text-[11.5px] text-ink-500">
        {ficha.email && <p className="truncate">{ficha.email}</p>}
        <p>Cliente desde {dataBR(ficha.desde)}</p>
      </div>
    </div>
  );
}

/* ── CADASTRO ── campos do cadastro direto pelo chat, reutilizados
   no overlay (telas estreitas) e na coluna lateral (largas). */
function PainelCadastro({
  nome,
  onNome,
  salvando,
  onSalvar,
}: {
  nome: string;
  onNome: (v: string) => void;
  salvando: boolean;
  onSalvar: () => void;
}) {
  return (
    <div className="space-y-3.5">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
        Esta conversa ainda não está ligada a nenhum cliente. Cadastre para ver a ficha
        completa — compras, pedidos, orçamentos e cobranças.
      </p>

      <div>
        <label className="mb-1 block font-mono text-[10px] tracking-wide text-ink-400 uppercase">
          Nome do cliente
        </label>
        <Input
          value={nome}
          onChange={(e) => onNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim().length >= 2 && !salvando) {
              e.preventDefault();
              onSalvar();
            }
          }}
          placeholder="Como o cliente se identifica"
        />
      </div>

      <Button icon="check" onClick={onSalvar} disabled={salvando || nome.trim().length < 2}>
        {salvando ? "Salvando…" : "Salvar e ver ficha"}
      </Button>

      <p className="text-[11px] text-ink-400">
        Se este telefone já pertence a um cliente cadastrado, nada é duplicado — a conversa
        apenas é vinculada a ele.
      </p>
    </div>
  );
}

export function ChatWhatsApp() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef<HTMLDivElement>(null);

  /* Quantas mensagens estão à mostra. Cresce só quando o operador
     pede: carregar a conversa inteira de saída é o que transformava
     a tela numa parede de texto sem fim. */
  const [limite, setLimite] = useState(30);
  const [temAnteriores, setTemAnteriores] = useState(false);
  const [totalMensagens, setTotalMensagens] = useState(0);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);

  /* Ficha do cliente: sobreposta ao chat, aberta a pedido. */
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [fichaAberta, setFichaAberta] = useState(false);
  const [rapidas, setRapidas] = useState<Rapida[]>([]);

  /* Cadastro direto pela conversa (ficha 360º): conversa sem cliente
     vinculado não tem ficha — cadastrar aqui evita trocar de tela e
     perder o fio da conversa. O telefone é o E164 que já identifica
     a conversa; só o nome é digitado. */
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

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

  const carregarMensagens = useCallback(async (fone: string, quantas: number) => {
    try {
      const r = await fetch(
        `/api/whatsapp-chat?fone=${encodeURIComponent(fone)}&limite=${quantas}`
      );
      const d = (await r.json()) as {
        mensagens?: Mensagem[];
        temAnteriores?: boolean;
        total?: number;
      };
      setMensagens(d.mensagens || []);
      setTemAnteriores(!!d.temAnteriores);
      setTotalMensagens(Number(d.total || 0));
    } catch {
      /* idem */
    }
  }, []);

  /* Ficha só quando o painel abre: são várias consultas (cliente,
     pedidos, vendas, orçamentos, cobranças), e o chat recarrega
     sozinho a cada 6 segundos — não faz sentido buscá-la junto. */
  const carregarFicha = useCallback(async (customerId: number) => {
    try {
      const r = await fetch(`/api/whatsapp-chat?ficha=${customerId}`);
      const d = (await r.json()) as { ficha?: Ficha };
      setFicha(d.ficha || null);
    } catch {
      setFicha(null);
    }
  }, []);

  /* Salva o cadastro vindo da própria conversa. Se o telefone já
     pertence a um cliente, não duplica — só vincula a conversa a ele
     (o robô escreve customer_id, mas aqui o operador está no controle). */
  async function salvarCadastro() {
    if (!aberta) return;
    setSalvandoCadastro(true);
    try {
      const r = await fetch("/api/whatsapp-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "cadastrar", nome: nomeNovo, phoneE164: aberta }),
      });
      const d = (await r.json()) as {
        ok?: boolean; customerId?: number; criado?: boolean; error?: string;
      };
      if (!r.ok || !d.customerId) {
        toast.error(d.error || "Não foi possível cadastrar o cliente.");
        return;
      }
      toast.success(
        d.criado
          ? "Cliente cadastrado e vinculado a esta conversa."
          : "Cliente já existia — conversa vinculada a ele."
      );
      setCadastroAberto(false);
      await carregarConversas();
      setFichaAberta(true);
      void carregarFicha(d.customerId);
    } catch {
      toast.error("Falha de rede ao cadastrar.");
    } finally {
      setSalvandoCadastro(false);
    }
  }

  /* Respostas rápidas saem do mesmo catálogo editável das outras
     mensagens: o que o cliente lê nunca mora no código. */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/whatsapp-chat?rapidas=1");
        const d = (await r.json()) as { rapidas?: Rapida[] };
        if (!vivo) return;
        setRapidas(d.rapidas || []);
      } catch {
        /* sem atalhos é degradação aceitável: o operador digita */
      }
    })();
    return () => { vivo = false; };
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
    const inicial = setTimeout(() => { if (vivo) void carregarMensagens(aberta, limite); }, 0);
    const t = setInterval(() => { if (vivo) void carregarMensagens(aberta, limite); }, 6000);
    return () => { vivo = false; clearTimeout(inicial); clearInterval(t); };
  }, [aberta, limite, carregarMensagens]);

  /* Trocar de conversa recomeça do lote pequeno e fecha a ficha da
     anterior: herdar o estado da conversa passada confunde.

     Feito no clique, e não num efeito sobre `aberta`: setState dentro
     de efeito dispara renderização em cascata (o lint reclama, e com
     razão — a regra já vale no resto deste arquivo). */
  const abrirConversa = useCallback((fone: string, customerId: number | null) => {
    setAberta(fone);
    setLimite(30);
    setFichaAberta(false);
    setFicha(null);
    setTexto("");
    /* A ficha carrega junto com a conversa: na coluna lateral (telas
       largas) ela está sempre à mostra. Nas estreitas o overlay segue
       a pedido do botão — e a ficha já vem quente quando ele clicar. */
    if (customerId) void carregarFicha(customerId);
  }, [carregarFicha]);

  /* Só desce sozinho quando chega mensagem nova. Ao carregar as
     anteriores o operador está LENDO o passado — puxar a tela para o
     fim ali desfaria justamente o que ele pediu. */
  const ultimaId = mensagens.length ? mensagens[mensagens.length - 1].id : 0;
  useEffect(() => {
    if (carregandoAnteriores) return;
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ultimaId, carregandoAnteriores]);

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
      await carregarMensagens(aberta, limite);
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
        <div className="grid lg:grid-cols-[290px_1fr] xl:grid-cols-[290px_1fr_330px]">
          {/* ── Lista ── */}
          <div className="max-h-[300px] overflow-y-auto border-b border-paper-200 lg:max-h-[calc(100vh-330px)] lg:min-h-[460px] lg:border-r lg:border-b-0">
            {conversas.map((c) => (
              <button
                key={c.phoneE164}
                type="button"
                onClick={() => abrirConversa(c.phoneE164, c.customerId)}
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
            <div className="flex h-[calc(100vh-330px)] min-h-[460px] items-center justify-center p-6">
              <p className="text-[13px] text-ink-400">Escolha uma conversa ao lado.</p>
            </div>
          ) : (
            <div className="relative flex h-[calc(100vh-330px)] min-h-[460px] flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 px-4 py-2.5">
                <div className="grow">
                  <p className="text-[13.5px] font-semibold text-ink-900">{atual.nome}</p>
                  <p className="font-mono text-[11.5px] text-ink-500">
                    {telefoneBonito(atual.phoneE164)}
                  </p>
                </div>
                {/* Botões de ficha/cadastro abrem OVERLAY — recurso de
                    tela estreita. Em telas largas a ficha é a coluna
                    lateral fixa e o cadastro mora nela: nada de botão. */}
                <span className="contents xl:hidden">
                {atual.customerId ? (
                  <Button
                    size="sm"
                    variant={fichaAberta ? "outline" : "ghost"}
                    icon="eye"
                    onClick={() => {
                      const abrindo = !fichaAberta;
                      setFichaAberta(abrindo);
                      if (abrindo && atual.customerId) void carregarFicha(atual.customerId);
                    }}
                  >
                    {fichaAberta ? "Voltar à conversa" : "Ficha e pedidos"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={fichaAberta ? "outline" : "ghost"}
                    icon="person"
                    onClick={() => {
                      setCadastroAberto(true);
                      setNomeNovo("");
                    }}
                  >
                    Cadastrar cliente
                  </Button>
                )}
                </span>
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

                {/* Ficha por cima do chat: o chat fica largo por padrão
                    e o detalhe aparece só quando o operador pede.

                    Fica FORA da área rolável das mensagens de propósito:
                    dentro dela, `absolute inset-0` se ancora no conteúdo
                    já rolado e a ficha nasce fora da vista. Aqui cobre a
                    conversa inteira, menos o cabeçalho. */}
                {/* Ficha por cima do chat: em telas estreitas cobre a
                    conversa. Em telas largas (xl) este overlay não
                    renderiza — lá a ficha é a coluna lateral fixa. */}
                {fichaAberta && (
                  <div className="absolute inset-x-0 top-[57px] bottom-0 z-20 overflow-y-auto bg-paper-50 px-4 py-3.5 xl:hidden">
                    {!ficha ? (
                      <p className="py-6 text-center text-[12.5px] text-ink-400">
                        Carregando ficha…
                      </p>
                    ) : (
                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold text-ink-900">{ficha.nome}</p>
                            <p className="font-mono text-[11px] text-ink-500">
                              {ficha.documento || "sem documento"}
                              {ficha.cidade ? ` · ${ficha.cidade}/${ficha.estado || ""}` : ""}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" icon="close" onClick={() => setFichaAberta(false)}>
                            Fechar
                          </Button>
                        </div>

                        <PainelFicha ficha={ficha} />
                      </div>
                    )}
                  </div>
                )}

                {/* Cadastro por cima do chat: mesma moldura da ficha.
                    O telefone não é editável — é o E164 que identifica
                    esta conversa; errar aqui seria vincular outra pessoa. */}
                {/* Cadastro por cima do chat (telas estreitas): mesma
                    moldura da ficha. O telefone não é editável — é o
                    E164 que identifica esta conversa; errar aqui seria
                    vincular outra pessoa. Em telas largas o formulário
                    mora na coluna lateral, sem overlay. */}
                {cadastroAberto && (
                  <div className="absolute inset-x-0 top-[57px] bottom-0 z-30 overflow-y-auto bg-paper-50 px-4 py-3.5 xl:hidden">
                    <div className="space-y-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-ink-900">Cadastrar cliente</p>
                          <p className="font-mono text-[11px] text-ink-500">
                            {telefoneBonito(atual.phoneE164)}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" icon="close" onClick={() => setCadastroAberto(false)}>
                          Fechar
                        </Button>
                      </div>

                      <PainelCadastro
                        nome={nomeNovo}
                        onNome={setNomeNovo}
                        salvando={salvandoCadastro}
                        onSalvar={() => void salvarCadastro()}
                      />
                    </div>
                  </div>
                )}

              <div className="relative grow space-y-2 overflow-y-auto bg-[#0b141a] px-4 py-3">
                {/* Histórico antigo entra a pedido. Trazer tudo de uma
                    vez é o que fazia a conversa não ter fim. */}
                {temAnteriores && (
                  <div className="pb-1 text-center">
                    <button
                      onClick={() => {
                        setCarregandoAnteriores(true);
                        setLimite((n) => n + 50);
                        window.setTimeout(() => setCarregandoAnteriores(false), 900);
                      }}
                      className="focus-ring cursor-pointer rounded-full border border-[#2a3942] bg-[#182229] px-3.5 py-1.5 font-mono text-[10.5px] text-[#8696a0] transition-colors hover:text-[#e9edef]"
                    >
                      ↑ Ver mensagens anteriores ({totalMensagens - mensagens.length} atrás)
                    </button>
                  </div>
                )}

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

                {/* Respostas rápidas: as perguntas que mais chegam,
                    respondidas em um clique. O texto vai para o campo
                    em vez de sair direto — o operador ainda decide, e
                    quase sempre quer completar com algo. */}
                {rapidas.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rapidas.map((r) => (
                      <button
                        key={r.slug}
                        title={r.texto.slice(0, 120)}
                        onClick={() => {
                          const primeiro = String(atual.nome || "").trim().split(/\s+/)[0] || "";
                          setTexto(
                            r.texto
                              .replace(/\{nome\}/g, primeiro)
                              .replace(/\{empresa\}/g, "VTDIGITAL")
                          );
                        }}
                        className="focus-ring cursor-pointer rounded-full border border-paper-300 bg-paper-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600 transition-colors hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800"
                      >
                        {r.titulo}
                      </button>
                    ))}
                  </div>
                )}

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

          {/* ── Ficha lateral (só em telas largas) ── sempre visível
              com a conversa aberta: quem atende quer ler a ficha e a
              conversa AO MESMO TEMPO, sem clicar pra lá e pra cá.
              Referência do dono: painel fixo do Waplus. Em telas
              estreitas este aside nem renderiza — lá vale o overlay. */}
          <aside className="hidden max-h-[calc(100vh-330px)] min-h-[460px] flex-col overflow-y-auto border-l border-paper-200 bg-paper-50 px-3.5 py-3 xl:flex">
            {!atual ? (
              <p className="py-6 text-center text-[12px] text-ink-400">
                Abra uma conversa para ver a ficha do cliente aqui do lado.
              </p>
            ) : !atual.customerId ? (
              <div className="space-y-3.5">
                <div className="min-w-0 border-b border-dashed border-paper-300 pb-2.5">
                  <p className="text-[13px] font-bold text-ink-900">Cadastrar cliente</p>
                  <p className="font-mono text-[11px] text-ink-500">
                    {telefoneBonito(atual.phoneE164)}
                  </p>
                </div>
                <PainelCadastro
                  nome={nomeNovo}
                  onNome={setNomeNovo}
                  salvando={salvandoCadastro}
                  onSalvar={() => void salvarCadastro()}
                />
              </div>
            ) : !ficha ? (
              <p className="py-6 text-center text-[12px] text-ink-400">Carregando ficha…</p>
            ) : (
              <div className="space-y-3.5">
                <div className="min-w-0 border-b border-dashed border-paper-300 pb-2.5">
                  <p className="truncate text-[14px] font-bold text-ink-900">{ficha.nome}</p>
                  <p className="truncate font-mono text-[11px] text-ink-500">
                    {ficha.documento || "sem documento"}
                    {ficha.cidade ? ` · ${ficha.cidade}/${ficha.estado || ""}` : ""}
                  </p>
                </div>
                <PainelFicha ficha={ficha} />
              </div>
            )}
          </aside>
        </div>
      )}
    </Card>
  );
}
