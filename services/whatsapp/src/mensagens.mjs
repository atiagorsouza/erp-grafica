/* ──────────────────────────────────────────────────────────────────
   Mensagens editáveis — lado do bot.

   Espelha `src/lib/mensagens.ts` do ERP. Os dois leem a MESMA tabela
   (`message_templates`), então o que o operador edita na web passa a
   valer aqui sem reiniciar nada.

   Por que duplicar os padrões em vez de importar: este serviço roda
   em outro processo, com outro `package.json`, e o arquivo do ERP tem
   `import "server-only"` — não é executável fora do Next. Duplicar 9
   strings é mais barato que acoplar os dois builds.

   Se os dois arquivos divergirem, quem manda é este para o bot e o
   outro para o ERP. Na prática o texto vem do banco assim que o
   operador editar uma vez.
   ────────────────────────────────────────────────────────────────── */

/** Padrões de fábrica. Chave = slug, igual ao catálogo do ERP. */
export const PADRAO = {
  "bot.saudacao":
    "Olá! Aqui é da {empresa} 🙂\n\nPara te atender direitinho, como posso te chamar?",
  "bot.nome_invalido": "Desculpe, não entendi. Pode me dizer só o seu nome?",
  "bot.pede_tipo":
    "Prazer, {nome}! 😊\n\nÉ para você ou para uma empresa?\n\n1️⃣ Para mim\n2️⃣ Para minha empresa",
  "bot.tipo_invalido":
    "Só para eu registrar certo: responda *1* para você ou *2* para empresa.",
  "bot.concluido":
    "Perfeito, anotado! ✅\n\nMe conta o que você precisa que já encaminho para a equipe.",
  "bot.passa_equipe": "Recebi! Já estou passando para a equipe te responder 🙂",
  "bot.cliente_conhecido":
    "Oi, {nome}! Que bom te ver por aqui 🙂\nJá estou chamando a equipe para te atender.",
  "bot.quer_humano": "Claro! Já estou chamando alguém da equipe. Um instante 🙂",
  "bot.opt_out":
    "Pronto, não envio mais mensagens automáticas. Se precisar, é só escrever.",
  "bot.ausencia":
    "Recebi sua mensagem! 🙂\n\nEstamos fora do atendimento automático agora, mas já anotei aqui e a equipe responde assim que possível.",
};

/** Troca {chave} pelos valores. Chave desconhecida fica literal. */
export function preencher(texto, valores = {}) {
  const trocado = String(texto).replace(/\{(\w+)\}/g, (bruto, chave) =>
    chave in valores ? String(valores[chave] ?? "") : bruto
  );
  return trocado
    .split("\n")
    .filter((linha) => !/^\s*[—\-–]\s*$/.test(linha))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cria o leitor de mensagens.
 *
 * Cache curto (30s) porque o bot consulta a cada resposta e a tabela
 * muda uma vez por mês. Meio minuto é rápido o bastante para o
 * operador ver o efeito da edição sem F5, e evita uma consulta por
 * mensagem trocada.
 */
export function criarMensagens({ pool, ttlMs = 30_000 }) {
  let cache = new Map();
  let expira = 0;

  async function garantirTabela() {
    /* O ERP cria via drizzle-kit, mas o bot pode subir antes numa
       instalação nova. Idempotente. */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id         serial PRIMARY KEY,
        slug       text NOT NULL UNIQUE,
        body       text,
        active     boolean NOT NULL DEFAULT true,
        updated_by text,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
  }

  async function recarregar() {
    try {
      const { rows } = await pool.query(
        `SELECT slug, body, active FROM message_templates`
      );
      cache = new Map(rows.map((r) => [r.slug, r]));
      expira = Date.now() + ttlMs;
    } catch (e) {
      /* Banco fora do ar não pode calar o bot: seguimos no padrão e
         tentamos de novo no próximo ciclo. */
      console.error("[mensagens] leitura falhou, usando padrões:", e.message);
      expira = Date.now() + 5_000;
    }
  }

  /**
   * Texto pronto para enviar.
   * Devolve null quando a mensagem foi DESLIGADA pelo operador — quem
   * chama decide se pula ou usa outra coisa.
   */
  async function texto(slug, valores = {}) {
    if (Date.now() > expira) await recarregar();

    const linha = cache.get(slug);
    if (linha && linha.active === false) return null;

    const corpo = String(linha?.body ?? "").trim();
    const base = corpo || PADRAO[slug];
    if (!base) {
      console.error(`[mensagens] slug sem padrão: ${slug}`);
      return null;
    }
    return preencher(base, valores);
  }

  /** Força releitura (usado após edição, se quisermos avisar o bot). */
  function invalidar() {
    expira = 0;
  }

  return { garantirTabela, texto, invalidar };
}
