import type { Metadata } from "next";
import { WhatsAppClient } from "@/components/modules/WhatsAppClient";
import { MensagensEditor } from "@/components/modules/MensagensEditor";
import { listarMensagens } from "@/lib/mensagens";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const mensagens = await listarMensagens();

  return (
    <>
      <WhatsAppClient />
      {/* Fora do componente de conexão de propósito: dá para escrever
          o texto com o bot desligado. Corrigir uma vírgula não pode
          depender do celular estar pareado. */}
      <MensagensEditor
        mensagens={mensagens.map((m) => ({
          ...m,
          atualizadaEm: m.atualizadaEm ? m.atualizadaEm.toISOString() : null,
        }))}
      />
    </>
  );
}
