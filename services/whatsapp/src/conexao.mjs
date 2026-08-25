/* ──────────────────────────────────────────────────────────────────
   Conexão com o WhatsApp via Baileys.

   Decisões que importam para não tomar ban:

   1) `syncFullHistory: false` — baixar o histórico inteiro é sinal de
      ferramenta automatizada e pesa muito no primeiro boot.

   2) `markOnlineOnConnect: false` — ficar "online" 24h por dia é
      comportamento que nenhuma pessoa tem. Também evita roubar as
      notificações do celular do usuário.

   3) Nunca respondemos a `broadcast`, `newsletter` ou `status@`.

   4) Reconexão com espera crescente. Reconectar em laço apertado
      depois de cair é o padrão que mais rápido queima um número.

   5) Se o WhatsApp devolver `loggedOut`, NÃO reconectamos: a sessão
      morreu de verdade e insistir só piora. Exige QR novo.
   ────────────────────────────────────────────────────────────────── */
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { usePostgresAuthState } from "./auth-state.mjs";

const log = pino({ level: process.env.WA_LOG_LEVEL || "warn" });

/* Espera crescente: 5s, 10s, 20s, 40s, 80s, teto de 5min. */
const ESPERA_BASE = 5_000;
const ESPERA_TETO = 300_000;

export function criarGerenciador({ pool, aoReceberMensagem, sessionId = "default" }) {
  let sock = null;
  let auth = null;
  let tentativas = 0;
  let paradoDeVez = false;
  let timer = null;

  const estado = {
    status: "desconectado",   // desconectado | conectando | qr | conectado | banido
    qrDataUrl: null,
    qrExpiraEm: null,
    numero: null,
    nome: null,
    conectadoDesde: null,
    ultimoErro: null,
    tentativas: 0,
    mensagensRecebidas: 0,
    mensagensEnviadas: 0,
  };

  const ouvintes = new Set();
  const notificar = () => {
    for (const fn of ouvintes) {
      try { fn({ ...estado }); } catch { /* ouvinte quebrado não derruba o serviço */ }
    }
  };

  function agendarReconexao() {
    if (paradoDeVez) return;
    clearTimeout(timer);
    const espera = Math.min(ESPERA_BASE * 2 ** tentativas, ESPERA_TETO);
    tentativas++;
    estado.tentativas = tentativas;
    log.warn(`reconectando em ${Math.round(espera / 1000)}s (tentativa ${tentativas})`);
    timer = setTimeout(() => conectar().catch((e) => log.error(e)), espera);
  }

  async function conectar() {
    if (paradoDeVez) return;
    estado.status = "conectando";
    estado.ultimoErro = null;
    notificar();

    auth = await usePostgresAuthState(pool, sessionId);
    const { version } = await fetchLatestBaileysVersion();
    log.info(`Baileys protocolo ${version.join(".")}`);

    sock = makeWASocket({
      version,
      auth: {
        creds: auth.state.creds,
        /* Cache das chaves do Signal: sem isso cada mensagem faz
           várias idas ao banco e o bot fica lento sob carga. */
        keys: makeCacheableSignalKeyStore(auth.state.keys, log),
      },
      logger: log,
      printQRInTerminal: false,      // geramos o QR nós mesmos (data URL)
      browser: ["PrintFlow ERP", "Chrome", "121.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      /* Não reenviar automaticamente: retry agressivo é sinal de bot. */
      maxMsgRetryCount: 2,
      retryRequestDelayMs: 1500,
    });

    sock.ev.on("creds.update", auth.saveCreds);

    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        estado.status = "qr";
        estado.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        // O QR do WhatsApp vira ~60s; a UI usa isto para avisar.
        estado.qrExpiraEm = Date.now() + 60_000;
        log.info("QR gerado — leia no WhatsApp do celular");
        notificar();
      }

      if (connection === "open") {
        tentativas = 0;
        estado.status = "conectado";
        estado.qrDataUrl = null;
        estado.qrExpiraEm = null;
        estado.tentativas = 0;
        estado.conectadoDesde = new Date().toISOString();
        estado.numero = sock.user?.id?.split(":")[0] || null;
        estado.nome = sock.user?.name || null;
        log.info(`conectado como ${estado.nome} (${estado.numero})`);
        notificar();
      }

      if (connection === "close") {
        const codigo = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const motivo = Object.entries(DisconnectReason)
          .find(([, v]) => v === codigo)?.[0] || codigo;
        estado.ultimoErro = String(motivo);

        if (codigo === DisconnectReason.loggedOut) {
          /* Sessão encerrada no celular (ou banida). Reconectar em
             laço aqui é o que transforma um problema em número
             queimado. Limpamos e esperamos QR novo. */
          log.error("sessão encerrada — é preciso ler o QR novamente");
          estado.status = "desconectado";
          estado.numero = null;
          estado.conectadoDesde = null;
          await auth.limparSessao();
          notificar();
          return;
        }

        if (codigo === 401 || codigo === 403) {
          log.error(`recusado pelo WhatsApp (${codigo}) — possível bloqueio`);
          estado.status = "banido";
          notificar();
          return;
        }

        estado.status = "desconectado";
        notificar();
        agendarReconexao();
      }
    });

    /* Espião de eventos: mostra TUDO que o Baileys emite.
       Ligue com WA_DEBUG=1 quando o bot parecer mudo — é a única
       forma de saber se a mensagem sequer chega à biblioteca, ou se
       ela está vindo por um evento diferente de messages.upsert. */
    if (process.env.WA_DEBUG === "1") {
      sock.ev.process((eventos) => {
        for (const nome of Object.keys(eventos)) {
          console.log(`[wa-debug] evento: ${nome}`);
          if (nome === "messages.upsert") {
            console.log("[wa-debug]", JSON.stringify(eventos[nome], null, 2).slice(0, 1500));
          }
        }
      });
    }

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      /* Log de entrada ANTES de qualquer filtro, em nível WARN.
         Estava em `info` e o padrão do serviço é `warn` — ou seja, a
         linha existia e nunca aparecia. Diagnosticar bot mudo sem
         rastro é impossível, então este log fica sempre visível. */
      log.warn(
        { tipo: type, quantidade: messages.length, de: messages.map((x) => x.key?.remoteJid) },
        "→ messages.upsert recebido"
      );

      // "notify" = mensagem chegando agora. "append" = histórico.
      if (type !== "notify") {
        log.warn(`ignorado: tipo "${type}" (só tratamos "notify")`);
        return;
      }

      for (const m of messages) {
        const jid = m.key?.remoteJid || "";

        /* Cada descarte é registrado. Filtro que rejeita em silêncio
           foi a causa do bot mudo no @lid — não repetir o erro. */
        const pular = (motivo) => { log.warn(`  ignorado (${motivo}): ${jid}`); };

        if (m.key?.fromMe) { pular("enviada por nós"); continue; }
        if (jid.endsWith("@g.us")) { pular("grupo"); continue; }
        if (jid.endsWith("@broadcast")) { pular("transmissão"); continue; }
        if (jid.endsWith("@newsletter")) { pular("canal"); continue; }
        if (jid === "status@broadcast") { pular("status"); continue; }

        /* O WhatsApp está migrando para LID (Linked ID): o remetente
           chega como "219743428550712@lid" em vez do número real. Um
           filtro que só aceita "@s.whatsapp.net" descarta a mensagem
           em silêncio — o bot fica conectado e mudo.

           Resolvemos o número real na ordem em que o WhatsApp o
           oferece; se nada funcionar, ignoramos a mensagem em vez de
           cadastrar um LID como se fosse telefone. */
        let jidReal = jid;
        if (jid.endsWith("@lid")) {
          jidReal = (await resolverLid(sock, m, jid)) || "";
          if (!jidReal) {
            log.warn({ lid: jid }, "não consegui resolver o LID para um número — mensagem ignorada");
            continue;
          }
        } else if (!jid.endsWith("@s.whatsapp.net")) {
          pular("sufixo desconhecido");
          continue;
        }

        estado.mensagensRecebidas++;
        const texto = extrairTexto(m);
        log.warn(`  ✓ tratando: ${jidReal} — "${texto.slice(0, 60)}"`);
        try {
          await aoReceberMensagem({ sock, msg: m, jid: jidReal, texto });
        } catch (e) {
          log.error({ err: e }, "erro ao tratar mensagem recebida");
        }
      }
      notificar();
    });

    return sock;
  }

  return {
    conectar,
    estado: () => ({ ...estado }),
    aoMudar: (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    socket: () => sock,
    contarEnviada: () => { estado.mensagensEnviadas++; },
    desconectar: async ({ apagarSessao = false } = {}) => {
      paradoDeVez = true;
      clearTimeout(timer);
      try { await sock?.logout(); } catch { /* já pode estar caído */ }
      if (apagarSessao && auth) await auth.limparSessao();
      estado.status = "desconectado";
      estado.numero = null;
      notificar();
    },
    reiniciar: async () => {
      paradoDeVez = false;
      tentativas = 0;
      clearTimeout(timer);
      try { sock?.end(); } catch { /* ignora */ }
      return conectar();
    },
  };
}

/* ──────────────────────────────────────────────────────────────────
   LID → número de telefone.

   O WhatsApp passou a esconder o número atrás de um "Linked ID"
   ("219743428550712@lid"). O mapeamento para o telefone real vem em
   campos diferentes conforme a origem da mensagem, e nem sempre vem.

   Tentamos, nesta ordem:
     1. key.remoteJidAlt  — o próprio Baileys já resolveu
     2. key.senderPn      — "phone number" do remetente
     3. key.participantPn — usado em alguns fluxos
     4. lidMapping        — cache interno do Baileys
     5. onWhatsApp()      — pergunta ao servidor

   Devolve null se nenhuma funcionar. Melhor perder a mensagem do que
   gravar um LID no lugar do telefone: isso criaria um cliente
   fantasma que ninguém consegue contactar.
   ────────────────────────────────────────────────────────────────── */
async function resolverLid(sock, m, lid) {
  const candidatos = [
    m.key?.remoteJidAlt,
    m.key?.senderPn,
    m.key?.participantPn,
    m.key?.participantAlt,
  ].filter(Boolean);

  for (const c of candidatos) {
    if (typeof c === "string" && c.endsWith("@s.whatsapp.net")) return c;
  }

  // Cache de LID do próprio Baileys (existe a partir da 6.7.x).
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(lid);
    if (pn && String(pn).endsWith("@s.whatsapp.net")) return String(pn);
  } catch { /* nem toda versão expõe isso */ }

  // Último recurso: perguntar ao servidor pelo número puro do LID.
  try {
    const numero = lid.split("@")[0].replace(/\D/g, "");
    if (numero) {
      const r = await sock?.onWhatsApp?.(numero);
      const achado = Array.isArray(r) ? r.find((x) => x?.exists && x?.jid) : null;
      if (achado?.jid?.endsWith("@s.whatsapp.net")) return achado.jid;
    }
  } catch { /* offline ou sem permissão */ }

  return null;
}

/* O texto pode vir em vários formatos dependendo de como foi enviado. */
export function extrairTexto(m) {
  const c = m.message || {};
  return (
    c.conversation ||
    c.extendedTextMessage?.text ||
    c.imageMessage?.caption ||
    c.videoMessage?.caption ||
    c.documentMessage?.caption ||
    c.buttonsResponseMessage?.selectedDisplayText ||
    c.listResponseMessage?.title ||
    c.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  ).trim();
}
