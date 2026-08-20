import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatsAppClient } from "@/components/modules/WhatsAppClient";
import { MensagensEditor } from "@/components/modules/MensagensEditor";
import { ChatWhatsApp } from "@/components/modules/ChatWhatsApp";
import { CampanhasWhatsApp } from "@/components/modules/CampanhasWhatsApp";
import { WhatsAppAbas } from "@/components/modules/WhatsAppAbas";
import { listarMensagens } from "@/lib/mensagens";
import { contarEsperando } from "@/lib/chat-whatsapp";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  /* As duas leituras são independentes — em paralelo. */
  const [mensagens, esperando] = await Promise.all([
    listarMensagens(),
    contarEsperando(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Atendimento"
        title="WhatsApp"
        description="Conversas, campanhas e os textos do robô."
        icon="whatsapp"
      />

      {/* Ordem por frequência de uso, não por ordem de construção:
          quem abre esta tela quase sempre quer responder alguém. A
          conexão, que antes vinha primeiro, foi para o fim — só
          importa quando cai, e o sinal ao lado das abas avisa disso. */}
      <WhatsAppAbas
        esperandoInicial={esperando}
        conversas={<ChatWhatsApp />}
        campanhas={<CampanhasWhatsApp />}
        mensagens={
          <MensagensEditor
            mensagens={mensagens.map((m) => ({
              ...m,
              atualizadaEm: m.atualizadaEm ? m.atualizadaEm.toISOString() : null,
            }))}
          />
        }
        conexao={<WhatsAppClient semCabecalho />}
      />
    </>
  );
}
