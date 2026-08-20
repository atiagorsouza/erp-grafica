/* ──────────────────────────────────────────────────────────────────
   BOTÕES NATIVOS (CTA) NO BAILEYS

   Eu disse ao dono que "botão nativo só existe na API oficial".
   Estava ERRADO — ele já tinha feito funcionar. Fui verificar:

     $ node -e "const {proto}=require('baileys');
                console.log(!!proto.Message.InteractiveMessage.NativeFlowMessage)"
     true

   O protobuf do baileys 6.7.24 TEM a estrutura. O que o
   `sock.sendMessage({buttons})` não faz é montá-la — mas dá para
   montar à mão com `generateWAMessageFromContent` + `relayMessage`,
   que é o caminho que os forks usam.

   O detalhe que o dono chamou de "persistência": o WhatsApp NÃO
   renderiza o botão de forma confiável em toda conta e todo
   aparelho. Depende de o número ser business, da versão do app de
   quem recebe, e às vezes some sem aviso. Por isso aqui:

     1. tenta o botão nativo
     2. se falhar, manda a mesma mensagem com o link no texto

   O cliente sempre recebe. No pior caso, recebe mais feio — nunca
   recebe nada.

   Referências (2026): WhiskeySockets/Baileys #2626, #2239;
   zqdevelopers/zq_baileys_helper (documenta os nós binários
   biz/interactive/native_flow que o cliente oficial emite).
   ────────────────────────────────────────────────────────────────── */

/* Import nomeado, não `default`. Em ESM o baileys expõe `proto` e
   `generateWAMessageFromContent` direto — `pkg.default.proto` é
   undefined, e o erro só aparece em execução (o fallback engoliria
   para sempre, mandando texto e nunca botão). */
import { proto, generateWAMessageFromContent } from "baileys";

/** Tipos de botão que fazem sentido para uma gráfica. */
export const TIPOS = {
  /* Abre um link. É o nosso caso principal: catálogo, orçamento,
     página de cadastro. */
  url: (rotulo, url) => ({
    name: "cta_url",
    buttonParamsJson: JSON.stringify({
      display_text: String(rotulo).slice(0, 25),
      url,
      /* `merchant_url` repetido não é engano: sem ele o botão some em
         parte dos aparelhos. */
      merchant_url: url,
    }),
  }),

  /* Liga para a gráfica. */
  ligar: (rotulo, telefone) => ({
    name: "cta_call",
    buttonParamsJson: JSON.stringify({
      display_text: String(rotulo).slice(0, 25),
      phone_number: telefone,
    }),
  }),

  /* Copia um código — útil para PIX copia-e-cola. */
  copiar: (rotulo, codigo) => ({
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: String(rotulo).slice(0, 25),
      id: "copy",
      copy_code: codigo,
    }),
  }),

  /* Resposta rápida: o cliente toca e o texto volta como mensagem
     dele. Excelente para "Aprovar" / "Pedir ajuste". */
  resposta: (rotulo, id) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: String(rotulo).slice(0, 25),
      id: String(id),
    }),
  }),
};

/**
 * Monta a mensagem interativa no formato que o WhatsApp espera.
 *
 * O `viewOnceMessage` por fora não é para a mensagem sumir — é o
 * envelope que o cliente oficial usa para mensagens interativas, e
 * sem ele o botão não aparece. Parece errado e não é.
 */
function montar(jid, { texto, rodape, titulo, botoes }) {
  return generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
            ...(rodape
              ? { footer: proto.Message.InteractiveMessage.Footer.create({ text: rodape }) }
              : {}),
            ...(titulo
              ? {
                  header: proto.Message.InteractiveMessage.Header.create({
                    title: titulo,
                    hasMediaAttachment: false,
                  }),
                }
              : {}),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: botoes }),
          }),
        },
      },
    },
    {}
  );
}

/** Texto de reserva: o botão vira linha no fim da mensagem. */
export function comoTexto({ texto, rodape, botoes }) {
  const linhas = [texto];

  for (const b of botoes) {
    let p = {};
    try {
      p = JSON.parse(b.buttonParamsJson || "{}");
    } catch {
      continue;
    }
    if (b.name === "cta_url" && p.url) {
      linhas.push("", `${p.display_text || "Acesse"}:`, p.url);
    } else if (b.name === "cta_call" && p.phone_number) {
      linhas.push("", `${p.display_text || "Ligue"}: ${p.phone_number}`);
    } else if (b.name === "cta_copy" && p.copy_code) {
      linhas.push("", `${p.display_text || "Código"}:`, p.copy_code);
    } else if (b.name === "quick_reply" && p.display_text) {
      /* Sem botão, o cliente precisa saber o que escrever. */
      linhas.push(`Responda *${p.display_text}*`);
    }
  }

  if (rodape) linhas.push("", `_${rodape}_`);
  return linhas.join("\n").trim();
}

/**
 * Envia com botões; se não der, envia como texto.
 *
 * Devolve `{ ok, modo }` — `modo` diz qual caminho foi usado, e isso
 * vai para o log. Se o botão parar de funcionar num update do
 * WhatsApp, dá para ver na hora em vez de descobrir pelo cliente
 * reclamando.
 */
export async function enviarComBotoes(sock, jid, { texto, rodape, titulo, botoes }) {
  const lista = (botoes || []).filter(Boolean).slice(0, 3);

  if (!lista.length) {
    await sock.sendMessage(jid, { text: texto });
    return { ok: true, modo: "texto" };
  }

  try {
    const msg = montar(jid, { texto, rodape, titulo, botoes: lista });
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return { ok: true, modo: "botoes" };
  } catch (e) {
    /* Não é motivo para falhar o envio: a mensagem importa mais que
       o formato dela. */
    console.warn("[botoes] nativo falhou, mandando como texto:", e?.message || e);
    try {
      await sock.sendMessage(jid, { text: comoTexto({ texto, rodape, botoes: lista }) });
      return { ok: true, modo: "texto-fallback", erro: e?.message };
    } catch (e2) {
      return { ok: false, modo: "falhou", erro: e2?.message };
    }
  }
}

/** O protobuf desta instalação suporta botão nativo? */
export function suportaBotoes() {
  try {
    return !!proto?.Message?.InteractiveMessage?.NativeFlowMessage;
  } catch {
    return false;
  }
}
