"use client";

/* ──────────────────────────────────────────────────────────────────
   Campanhas de WhatsApp — base quente.

   A tela mostra as recusas antes de mostrar o botão de enviar. Isso é
   deliberado: o operador precisa entender que "300 clientes" não é
   "300 destinatários", e por quê.

   O disparo é em lotes pequenos, com o operador olhando. Não há
   worker em background: campanha que roda sozinha de madrugada é
   campanha que ninguém para quando dá errado.
   ────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Modal, Textarea, toast } from "@/components/ui";
import { MODELOS_CAMPANHA } from "@/lib/campanha-modelos";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

interface Campanha {
  id: number;
  name: string;
  status: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  pausedReason: string | null;
  createdAt: string;
}

interface Audiencia {
  elegiveis: number;
  inelegiveis: number;
  motivos: { motivo: string; total: number }[];
  amostra: { nome: string; ultima: string | null }[];
}

const TOM: Record<string, "neutral" | "cyan" | "green" | "amber" | "red"> = {
  rascunho: "neutral",
  enviando: "cyan",
  concluida: "green",
  pausada: "amber",
  cancelada: "red",
};

export function CampanhasWhatsApp() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [aud, setAud] = useState<Audiencia | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({ name: "", body: "", ctaLabel: "", ctaUrl: "" });

  const carregar = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        fetch("/api/campanhas").then((r) => r.json()),
        fetch("/api/campanhas?audiencia=1").then((r) => r.json()),
      ]);
      setCampanhas(c.campanhas || []);
      setAud(a.ok ? a : null);
    } catch {
      /* a próxima leitura corrige */
    }
  }, []);

  useEffect(() => {
    /* Timeout de 0 em vez de chamada direta: evita render em cascata
       (mesmo motivo do ChatWhatsApp). */
    let vivo = true;
    const t = setTimeout(() => { if (vivo) void carregar(); }, 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [carregar]);

  async function chamar(corpo: Record<string, unknown>, sucesso?: string) {
    setOcupado(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        toast.error(String(d.error || "Não foi possível concluir."));
        return null;
      }
      if (sucesso) toast.success(sucesso);
      await carregar();
      return d;
    } catch {
      toast.error("Falha de rede.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function criar() {
    const d = await chamar({ op: "criar", ...form }, "Campanha criada.");
    if (d) {
      setNovaAberta(false);
      setForm({ name: "", body: "", ctaLabel: "", ctaUrl: "" });
    }
  }

  async function dispararLote(id: number) {
    const d = await chamar({ op: "enviar-lote", id, quantos: 5 });
    if (!d) return;
    if (d.pausada) {
      toast.error(`Campanha pausada: ${d.motivoPausa}`);
    } else if (d.concluida) {
      toast.success("Campanha concluída.");
    } else if (d.limiteDiario) {
      toast.success(String(d.aviso));
    } else {
      toast.success(`${d.enviados} enviada(s)${d.falhas ? `, ${d.falhas} falha(s)` : ""}.`);
    }
  }

  const semAudiencia = (aud?.elegiveis ?? 0) === 0;

  return (
    <Card className="mt-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="grow">
          <h2 className="display-expanded text-[15px] font-bold text-ink-900">
            Campanhas · novidades para clientes
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Só para quem <strong>já escreveu</strong> para você e autorizou receber.
            É o que mantém o risco de bloqueio do número abaixo de 2%.
          </p>
        </div>
        <Button icon="plus" onClick={() => setNovaAberta(true)} disabled={ocupado}>
          Nova campanha
        </Button>
      </div>

      {/* ── Audiência: as recusas vêm primeiro, de propósito ── */}
      {aud && (
        <div className="mb-5 rounded-xl border border-paper-200 bg-paper-50 p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <p className="font-mono text-[26px] leading-none font-bold text-ink-900 tnum">
                {aud.elegiveis}
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-wider text-ink-500 uppercase">
                podem receber
              </p>
            </div>
            <div>
              <p className="font-mono text-[26px] leading-none font-bold text-ink-300 tnum">
                {aud.inelegiveis}
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-wider text-ink-400 uppercase">
                fora das regras
              </p>
            </div>
            {aud.motivos.length > 0 && (
              <div className="min-w-[220px] grow">
                <p className="mb-1 font-mono text-[10px] tracking-wider text-ink-400 uppercase">
                  por quê
                </p>
                <ul className="space-y-0.5">
                  {aud.motivos.slice(0, 4).map((m) => (
                    <li key={m.motivo} className="flex gap-2 text-[12px] text-ink-600">
                      <span className="font-mono font-semibold text-ink-800 tnum">{m.total}</span>
                      <span>{m.motivo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {semAudiencia && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
              <strong>Ninguém pode receber campanha ainda.</strong> Faltam duas coisas:
              o cliente precisa ter <strong>escrito para você</strong> pelo WhatsApp
              (o robô registra isso sozinho) e ter <strong>autorizado marketing</strong>
              {" "}na ficha dele, em Clientes &amp; CRM.
            </p>
          )}
        </div>
      )}

      {/* ── Lista ── */}
      {campanhas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-400">
          Nenhuma campanha criada.
        </p>
      ) : (
        <div className="space-y-2.5">
          {campanhas.map((c) => {
            const restam = Math.max(0, c.totalTargets - c.sentCount - c.failedCount);
            const pct = c.totalTargets ? Math.round((c.sentCount / c.totalTargets) * 100) : 0;
            return (
              <div key={c.id} className="rounded-xl border border-paper-200 bg-white p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="grow">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink-900">
                      {c.name}
                      <Badge tone={TOM[c.status] || "neutral"}>{c.status}</Badge>
                    </p>
                    <p className="mt-1 line-clamp-2 text-[12px] text-ink-500">
                      {c.body.replace(/\n+/g, " · ")}
                    </p>
                    {c.ctaUrl && (
                      <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-proc-c">
                        <Icon name="external" size={11} />
                        {c.ctaLabel ? `${c.ctaLabel} → ` : ""}
                        {c.ctaUrl}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {c.status === "rascunho" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado || semAudiencia}
                          onClick={() => chamar({ op: "montar-fila", id: c.id }, "Fila montada.")}
                        >
                          Montar fila
                        </Button>
                        {c.totalTargets > 0 && (
                          <Button size="sm" icon="send" disabled={ocupado} onClick={() => dispararLote(c.id)}>
                            Enviar 5
                          </Button>
                        )}
                      </>
                    )}
                    {c.status === "enviando" && (
                      <>
                        <Button size="sm" icon="send" disabled={ocupado} onClick={() => dispararLote(c.id)}>
                          Enviar mais 5
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado}
                          onClick={() => chamar({ op: "pausar", id: c.id }, "Campanha pausada.")}
                        >
                          Pausar
                        </Button>
                      </>
                    )}
                    {c.status === "pausada" && (
                      <Button size="sm" icon="send" disabled={ocupado} onClick={() => dispararLote(c.id)}>
                        Retomar
                      </Button>
                    )}
                  </div>
                </div>

                {c.totalTargets > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
                      <div
                        className={cn("h-full rounded-full", c.blockedCount > 0 ? "bg-amber-500" : "bg-ok-500")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 flex flex-wrap gap-x-4 font-mono text-[11px] text-ink-500 tnum">
                      <span>{c.sentCount} enviadas</span>
                      <span>{restam} na fila</span>
                      {c.failedCount > 0 && <span className="text-amber-700">{c.failedCount} falharam</span>}
                      {c.blockedCount > 0 && <span className="text-red-600">{c.blockedCount} bloquearam</span>}
                    </p>
                  </div>
                )}

                {c.pausedReason && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    <strong>Pausada:</strong> {c.pausedReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nova campanha ── */}
      <Modal
        open={novaAberta}
        onClose={() => setNovaAberta(false)}
        title="Nova campanha"
        subtitle="A mensagem vai para quem já conversou com você e autorizou"
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNovaAberta(false)}>Cancelar</Button>
            <Button icon="check" onClick={criar} disabled={ocupado}>Criar</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Modelos prontos: o campo em branco é onde nasce a mensagem
              com cara de spam, escrita com pressa. Clicar preenche tudo
              e o operador ajusta — o texto continua sendo dele. */}
          <div>
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Começar de um modelo
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MODELOS_CAMPANHA.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.quando}
                  onClick={() =>
                    setForm({
                      name: m.nome,
                      body: m.corpo,
                      ctaLabel: m.ctaLabel || "",
                      ctaUrl: "",
                    })
                  }
                  className="focus-ring cursor-pointer rounded-lg border border-paper-300 bg-paper-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-600 transition-colors hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800"
                >
                  {m.titulo}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              Passe o mouse para ver quando usar cada um. Depois é só editar.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Nome (só você vê)
            </span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Promoção de canecas — agosto"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Mensagem
            </span>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="min-h-[130px] font-mono text-[12.5px]"
              placeholder={"Oi, {nome}! Tudo bem?\n\nEssa semana estou com uma condição especial em canecas personalizadas. Te interessa?"}
            />
            <span className="mt-1 block text-[11.5px] text-ink-400">
              Use <code className="font-mono">{"{nome}"}</code> e{" "}
              <code className="font-mono">{"{empresa}"}</code>.
            </span>
          </label>

          {/* O aviso mais útil desta tela. */}
          <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 px-3.5 py-2.5 text-[12.5px] text-ink-700">
            <strong>Escreva pedindo conversa, não anunciando.</strong> Mensagem que
            ninguém responde é lida como spam pela plataforma — e derruba a reputação
            do seu número. &ldquo;Te interessa?&rdquo; vale mais que &ldquo;20% OFF&rdquo;.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
                Texto do botão
              </span>
              <Input
                value={form.ctaLabel}
                onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                placeholder="Ver o catálogo"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
                Link
              </span>
              <Input
                value={form.ctaUrl}
                onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                placeholder="https://…"
              />
            </label>
          </div>
          <p className="text-[11.5px] text-ink-400">
            O link entra no fim da mensagem. Botão clicável de verdade só existe na
            API oficial do WhatsApp, que não é a que usamos.
          </p>
        </div>
      </Modal>
    </Card>
  );
}
