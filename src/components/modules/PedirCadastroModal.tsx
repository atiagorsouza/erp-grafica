"use client";

/* ──────────────────────────────────────────────────────────────────
   "Pedir cadastro por WhatsApp"

   Duas etapas de propósito:
     1. gerar → mostra o link e a mensagem que SERÁ enviada
     2. enviar → só depois que o operador leu o texto

   O bot não decide mandar nada. Quem clica é a pessoa, e ela vê
   exatamente o que o cliente vai receber — inclusive podendo editar.
   Se o serviço do WhatsApp estiver fora do ar, o link continua na
   tela para copiar e mandar do celular: a regra não pode impedir o
   atendimento.
   ────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Modal, Textarea, toast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Cliente = {
  id: number;
  name: string;
  whatsapp?: string | null;
  phone?: string | null;
  whatsappOptOut?: boolean | null;
};

export function PedirCadastroModal({
  cliente,
  onClose,
  onDone,
}: {
  cliente: Cliente | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [url, setUrl] = useState("");
  const [linkId, setLinkId] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  const optOut = cliente?.whatsappOptOut === true;
  const semNumero = !String(cliente?.whatsapp || cliente?.phone || "").trim();

  const gerar = useCallback(async () => {
    if (!cliente) return;
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/crm/registration-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "criar", customerId: cliente.id }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        error?: string; url?: string; mensagem?: string; link?: { id: number };
      };
      if (!r.ok) {
        setErro(d.error || "Não foi possível gerar o link.");
        return;
      }
      setUrl(d.url || "");
      setMensagem(d.mensagem || "");
      setLinkId(d.link?.id ?? null);
    } catch {
      setErro("Falha de rede ao gerar o link.");
    } finally {
      setCarregando(false);
    }
  }, [cliente]);

  /* Gera assim que o modal abre: o operador quer o link, não um botão
     a mais para clicar.

     Os resets ficam DENTRO da função assíncrona de propósito. Chamar
     setState direto no corpo do efeito dispara render em cascata — o
     lint reclama e ele tem razão. */
  useEffect(() => {
    if (!cliente) return;
    let vivo = true;
    void (async () => {
      if (!vivo) return;
      setUrl("");
      setMensagem("");
      setLinkId(null);
      setErro("");
      setEnviado(false);
      await gerar();
    })();
    return () => {
      vivo = false;
    };
  }, [cliente, gerar]);

  async function enviar() {
    if (!cliente) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/crm/registration-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "enviar", customerId: cliente.id, linkId, mensagem }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!r.ok) {
        if (d.url) setUrl(d.url);
        setErro(d.error || "O WhatsApp recusou o envio.");
        return;
      }
      setEnviado(true);
      toast.success("Link de cadastro enviado.");
      onDone?.();
    } catch {
      setErro("Falha de rede ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Copie manualmente: o navegador bloqueou a área de transferência.");
    }
  }

  const numeroWa = String(cliente?.whatsapp || cliente?.phone || "").replace(/\D/g, "");
  const waMe = numeroWa
    ? `https://wa.me/${numeroWa.length > 11 ? numeroWa : `55${numeroWa}`}?text=${encodeURIComponent(mensagem)}`
    : "";

  return (
    <Modal
      open={!!cliente}
      onClose={onClose}
      title="Pedir cadastro por WhatsApp"
      subtitle={cliente ? `Para ${cliente.name}` : undefined}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {enviado ? "Fechar" : "Cancelar"}
          </Button>
          {!enviado && (
            <Button
              icon="send"
              onClick={enviar}
              disabled={enviando || carregando || !url || optOut || semNumero}
            >
              {enviando ? "Enviando…" : "Enviar pelo bot"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {optOut && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
            Este cliente pediu para <strong>não</strong> receber mensagens automáticas. O link
            está aqui para você copiar e combinar por outro canal — o bot não vai enviar.
          </p>
        )}
        {semNumero && !optOut && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
            Cliente sem telefone no cadastro. Copie o link e envie pelo canal que você já usa
            com ele.
          </p>
        )}

        {carregando && <p className="text-[13px] text-ink-500">Gerando link…</p>}

        {url && (
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Link único deste cliente
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2.5">
              <Icon name="external" size={13} />
              <code className="grow truncate font-mono text-[12px] text-ink-800">{url}</code>
              <Button variant="ghost" icon="copy" size="sm" onClick={() => copiar(url, "Link")}>
                Copiar
              </Button>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-400">
              Vale 7 dias, serve uma vez só e atualiza o cadastro que já existe — não cria
              cliente duplicado.
            </p>
          </div>
        )}

        {url && (
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
              Mensagem que o cliente vai receber
            </p>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="min-h-[150px] font-mono text-[12.5px]"
            />
            <p className="mt-1 text-[11.5px] text-ink-400">
              Pode editar. O bot manda exatamente este texto, dentro da conversa que o cliente
              já começou.
            </p>
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
            {erro}
            {waMe && (
              <>
                {" "}
                <a
                  href={waMe}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline"
                >
                  Abrir no WhatsApp Web
                </a>
              </>
            )}
          </div>
        )}

        {enviado && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
            <Badge tone="green">Enviado</Badge>
            Assim que o cliente concluir, a ficha é atualizada sozinha.
          </div>
        )}
      </div>
    </Modal>
  );
}
