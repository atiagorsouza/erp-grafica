import type { Metadata } from "next";
import { WhatsAppClient } from "@/components/modules/WhatsAppClient";
import { MensagensEditor } from "@/components/modules/MensagensEditor";
import { ChatWhatsApp } from "@/components/modules/ChatWhatsApp";
import { CampanhasWhatsApp } from "@/components/modules/CampanhasWhatsApp";
import { listarMensagens } from "@/lib/mensagens";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const mensagens = await listarMensagens();

  return (
    <>
      <WhatsAppClient />

      {/* Ordem pensada para o dia a dia: primeiro o que exige ação
          agora (conversas esperando resposta), depois o que é
          campanha, por último os textos que raramente mudam.

          Todos fora do componente de conexão: dá para responder,
          preparar campanha e editar texto com o bot desligado. */}
      <ChatWhatsApp />
      <CampanhasWhatsApp />
      <MensagensEditor
        mensagens={mensagens.map((m) => ({
          ...m,
          atualizadaEm: m.atualizadaEm ? m.atualizadaEm.toISOString() : null,
        }))}
      />
    </>
  );
}
