"use client";

/* ──────────────────────────────────────────────────────────────────
   Abas da tela de WhatsApp.

   Antes, os quatro blocos vinham empilhados: conexão, conversas,
   campanhas e mensagens — 1.400 linhas de componente numa rolagem só.
   Para responder um cliente era preciso passar por tudo.

   Ideia do dono, e ele tem razão. Quatro abas:

     Conversas   ← o que se usa todo dia, por isso vem primeiro
     Campanhas   ← eventual
     Mensagens   ← raro (texto do robô)
     Conexão     ← só quando cai

   Três decisões que valem registro:

   1. A ORDEM não é a da importância técnica, é a da frequência de
      uso. A conexão era o primeiro bloco porque foi o primeiro a ser
      construído — péssima razão. Quem abre esta tela quer responder
      alguém.

   2. O CONTADOR de conversas esperando fica na aba, não dentro dela.
      Serve para justamente não precisar entrar para saber se tem
      gente esperando.

   3. TODAS as abas continuam montadas, escondidas com CSS em vez de
      desmontadas. Assim o polling do chat segue rodando em segundo
      plano e o contador se atualiza mesmo com o operador olhando as
      campanhas. Trocar de aba não perde rascunho nem recarrega nada.
   ────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui";
import { cn } from "@/lib/format";

type Aba = "conversas" | "campanhas" | "mensagens" | "conexao";

export function WhatsAppAbas({
  conversas,
  campanhas,
  mensagens,
  conexao,
  esperandoInicial = 0,
}: {
  conversas: React.ReactNode;
  campanhas: React.ReactNode;
  mensagens: React.ReactNode;
  conexao: React.ReactNode;
  esperandoInicial?: number;
}) {
  const [aba, setAba] = useState<Aba>("conversas");
  const [esperando, setEsperando] = useState(esperandoInicial);
  const [online, setOnline] = useState<boolean | null>(null);

  /* Duas informações que precisam aparecer SEM entrar na aba: quantos
     esperam resposta e se o WhatsApp caiu. */
  useEffect(() => {
    let vivo = true;

    async function medir() {
      try {
        const [c, s] = await Promise.all([
          fetch("/api/whatsapp-chat").then((r) => r.json()).catch(() => null),
          fetch("/api/whatsapp/status").then((r) => r.json()).catch(() => null),
        ]);
        if (!vivo) return;
        if (c?.conversas) {
          setEsperando(
            (c.conversas as { naoLidas: number }[]).filter((x) => x.naoLidas > 0).length
          );
        }
        if (s) setOnline(s.status === "conectado");
      } catch {
        /* a próxima rodada corrige */
      }
    }

    /* Timeout de 0 na primeira: setState síncrono dentro do efeito
       dispara render em cascata. */
    const inicial = setTimeout(() => { if (vivo) void medir(); }, 0);
    const t = setInterval(() => { if (vivo) void medir(); }, 10000);
    return () => { vivo = false; clearTimeout(inicial); clearInterval(t); };
  }, []);

  const opcoes: { value: Aba; label: string; count?: number }[] = [
    { value: "conversas", label: "Conversas", ...(esperando > 0 ? { count: esperando } : {}) },
    { value: "campanhas", label: "Campanhas" },
    { value: "mensagens", label: "Mensagens" },
    { value: "conexao", label: "Conexão" },
  ];

  return (
    <>
      <div className="mt-4 mb-1 flex flex-wrap items-center gap-3">
        <Segmented options={opcoes} value={aba} onChange={setAba} />

        {/* Sinal de conexão sempre visível. Se o WhatsApp caiu às 9h,
            o operador tem de saber às 9h — não às 11h, quando for
            responder alguém e descobrir que nada saiu. */}
        {online !== null && (
          <button
            type="button"
            onClick={() => setAba("conexao")}
            className={cn(
              "focus-ring flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
              online
                ? "bg-ok-50 text-ok-700 hover:bg-ok-100"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            )}
            title={online ? "WhatsApp conectado" : "WhatsApp desconectado — clique para reconectar"}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                online ? "bg-ok-500" : "bg-red-500"
              )}
            />
            {online ? "conectado" : "desconectado"}
          </button>
        )}
      </div>

      {/* `hidden` em vez de desmontar: o polling do chat continua e o
          contador se mantém vivo em qualquer aba. */}
      <div className={cn(aba !== "conversas" && "hidden")}>{conversas}</div>
      <div className={cn(aba !== "campanhas" && "hidden")}>{campanhas}</div>
      <div className={cn(aba !== "mensagens" && "hidden")}>{mensagens}</div>
      <div className={cn(aba !== "conexao" && "hidden")}>{conexao}</div>
    </>
  );
}
