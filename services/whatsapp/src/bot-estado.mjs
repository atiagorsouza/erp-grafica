/* ──────────────────────────────────────────────────────────────────
   LIGA/DESLIGA DO BOT — sem sair do WhatsApp.

   O problema que isto resolve: até agora, para o bot parar de
   responder só havia `/desconectar`, que derruba a sessão do Baileys.
   Reconectar exige ler o QR de novo no celular, e enquanto isso o
   número fica fora do ar — não recebe nem registra nada.

   Aqui a conexão continua de pé. O que muda é só uma coisa: o bot
   deixa de RESPONDER. Ele continua:

     · recebendo as mensagens
     · gravando tudo no histórico
     · vinculando ao cliente certo

   Ou seja, você não perde mensagem nenhuma — só passa a responder na
   mão.

   ── Duas decisões que valem explicação ──

   1. PAUSA COM VALIDADE. "Pausar e esquecer" é o jeito mais fácil de
      deixar cliente sem resposta por dias. Por isso a pausa aceita um
      prazo e o bot religa sozinho quando ele vence. Pausa sem prazo
      existe, mas é escolha explícita.

   2. "SAIR" FUNCIONA MESMO PAUSADO. Se alguém pede para não receber
      mais mensagens, isso tem de ser atendido sempre — é LGPD, não é
      recurso do bot. Silenciar o opt-out seria ignorar um pedido
      formal do titular.

   O estado mora em `settings`, tabela que o ERP e este serviço já
   compartilham. Assim o botão da web tem efeito imediato aqui, sem
   reiniciar processo nenhum.
   ────────────────────────────────────────────────────────────────── */

export const CHAVES = {
  pausado: "wa_bot_pausado",
  ate: "wa_bot_pausado_ate",
  por: "wa_bot_pausado_por",
  motivo: "wa_bot_pausado_motivo",
  ausencia: "wa_bot_ausencia_ativa",
};

/** Cria o controlador de estado. Cache curto: o bot consulta a cada
 *  mensagem e o valor muda uma vez por dia, no máximo. */
export function criarEstadoBot({ pool, ttlMs = 10_000 }) {
  let cache = null;
  let expira = 0;

  async function ler(forcar = false) {
    if (!forcar && cache && Date.now() < expira) return cache;

    const vazio = {
      pausado: false,
      ate: null,
      por: null,
      motivo: null,
      ausenciaAtiva: false,
    };

    try {
      const { rows } = await pool.query(
        `SELECT key, value FROM settings WHERE key = ANY($1)`,
        [Object.values(CHAVES)]
      );
      const m = new Map(rows.map((r) => [r.key, r.value]));

      const ateBruto = String(m.get(CHAVES.ate) || "").trim();
      const ate = ateBruto ? new Date(ateBruto) : null;
      const ateValido = ate && !Number.isNaN(ate.getTime()) ? ate : null;

      let pausado = String(m.get(CHAVES.pausado) || "") === "true";

      /* Prazo vencido religa sozinho. Fazemos isso na LEITURA, não por
         cron: o serviço pode ter ficado parado durante a pausa, e um
         cron perderia o horário de religar. */
      if (pausado && ateValido && ateValido.getTime() <= Date.now()) {
        pausado = false;
        await pool.query(
          `UPDATE settings SET value = 'false', updated_at = now() WHERE key = $1`,
          [CHAVES.pausado]
        );
        await pool.query(
          `UPDATE settings SET value = '', updated_at = now() WHERE key = $1`,
          [CHAVES.ate]
        );
        console.log("[bot] pausa venceu — voltando a responder");
      }

      cache = {
        pausado,
        ate: pausado ? ateValido : null,
        por: m.get(CHAVES.por) || null,
        motivo: m.get(CHAVES.motivo) || null,
        ausenciaAtiva: String(m.get(CHAVES.ausencia) || "") === "true",
      };
      expira = Date.now() + ttlMs;
      return cache;
    } catch (e) {
      /* Banco fora do ar: assumimos ATIVO. Um bot que emudece sozinho
         por falha de leitura é pior que um bot que responde demais —
         o cliente ficaria sem resposta sem ninguém perceber. */
      console.error("[bot-estado] leitura falhou, assumindo ativo:", e.message);
      return vazio;
    }
  }

  async function gravar(chave, valor) {
    await pool.query(
      `INSERT INTO settings (key, value, category)
       VALUES ($1, $2, 'whatsapp')
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [chave, valor == null ? "" : String(valor)]
    );
  }

  /**
   * Desliga o bot.
   * @param minutos  null = até religar na mão
   */
  async function pausar({ minutos = null, por = null, motivo = null } = {}) {
    const ate =
      Number.isFinite(minutos) && minutos > 0
        ? new Date(Date.now() + minutos * 60_000)
        : null;

    await gravar(CHAVES.pausado, "true");
    await gravar(CHAVES.ate, ate ? ate.toISOString() : "");
    await gravar(CHAVES.por, por || "");
    await gravar(CHAVES.motivo, motivo || "");
    expira = 0;
    return ler(true);
  }

  async function retomar() {
    await gravar(CHAVES.pausado, "false");
    await gravar(CHAVES.ate, "");
    await gravar(CHAVES.motivo, "");
    expira = 0;
    return ler(true);
  }

  async function definirAusencia(ativa) {
    await gravar(CHAVES.ausencia, ativa ? "true" : "false");
    expira = 0;
    return ler(true);
  }

  function invalidar() {
    expira = 0;
  }

  return { ler, pausar, retomar, definirAusencia, invalidar };
}
