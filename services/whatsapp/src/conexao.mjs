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

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // "notify" = mensagem chegando agora. "append" = histórico.
      if (type !== "notify") return;

      for (const m of messages) {
        const jid = m.key?.remoteJid || "";

        if (m.key?.fromMe) continue;                    // eco do que enviamos
        if (jid.endsWith("@g.us")) continue;            // grupo
        if (jid.endsWith("@broadcast")) continue;       // lista de transmissão
        if (jid.endsWith("@newsletter")) continue;      // canal
        if (jid === "status@broadcast") continue;       // status
        if (!jid.endsWith("@s.whatsapp.net")) continue; // qualquer outra coisa

        estado.mensagensRecebidas++;
        try {
          await aoReceberMensagem({ sock, msg: m, jid, texto: extrairTexto(m) });
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
