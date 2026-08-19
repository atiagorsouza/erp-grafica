import "server-only";

/* ──────────────────────────────────────────────────────────────────
   CATÁLOGO DE MENSAGENS DO WHATSAPP

   Tudo que o bot escreve está aqui, e tudo pode ser editado pela web
   sem tocar em código nem reiniciar o serviço.

   Duas regras que valem mais que o resto:

   1. O PADRÃO MORA NO CÓDIGO. A tabela só guarda o que foi
      customizado. Banco fora do ar, linha apagada, texto salvo em
      branco — em qualquer desses casos o sistema cai no padrão e o
      cliente recebe a mensagem certa. Um bot mudo é pior que um bot
      com texto genérico.

   2. VARIÁVEL QUE NÃO EXISTE NÃO É TROCADA. Se alguém escrever
      {nomee} por engano, o texto sai com "{nomee}" literal em vez de
      "undefined". Feio, mas visível — e quem editou percebe na hora.
      Trocar por vazio esconderia o erro até o cliente estranhar.
   ────────────────────────────────────────────────────────────────── */

import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export interface DefinicaoMensagem {
  slug: string;
  /** Nome curto na tela de edição. */
  titulo: string;
  /** Quando esta mensagem é disparada — o operador precisa saber. */
  quando: string;
  /** Texto de fábrica. */
  padrao: string;
  /** Variáveis aceitas, com explicação para a tela. */
  variaveis: { nome: string; descricao: string }[];
  /** Agrupamento na tela. */
  grupo: "bot" | "cadastro";
  /** false = mensagem essencial, não pode ser desligada. */
  desligavel?: boolean;
}

const VAR_EMPRESA = { nome: "empresa", descricao: "Nome fantasia da sua gráfica" };
const VAR_NOME = { nome: "nome", descricao: "Primeiro nome do cliente" };

/* ── O catálogo ────────────────────────────────────────────────────
   Os textos aqui são os que já estavam em produção. Mudou só a
   menção a nota fiscal, que saiu a pedido do dono. */
export const CATALOGO: DefinicaoMensagem[] = [
  /* ── Funil do bot ── */
  {
    slug: "bot.saudacao",
    titulo: "Primeira mensagem (pede o nome)",
    quando: "Alguém escreve pela primeira vez e ainda não é cliente.",
    grupo: "bot",
    variaveis: [VAR_EMPRESA],
    padrao: "Olá! Aqui é da {empresa} 🙂\n\nPara te atender direitinho, como posso te chamar?",
  },
  {
    slug: "bot.nome_invalido",
    titulo: "Não entendeu o nome",
    quando: "A resposta não parecia um nome (só emoji, número, frase solta).",
    grupo: "bot",
    variaveis: [],
    padrao: "Desculpe, não entendi. Pode me dizer só o seu nome?",
  },
  {
    slug: "bot.pede_tipo",
    titulo: "Pergunta se é pessoa ou empresa",
    quando: "Logo depois de o cliente dizer o nome.",
    grupo: "bot",
    variaveis: [VAR_NOME],
    padrao:
      "Prazer, {nome}! 😊\n\nÉ para você ou para uma empresa?\n\n1️⃣ Para mim\n2️⃣ Para minha empresa",
  },
  {
    slug: "bot.tipo_invalido",
    titulo: "Não entendeu pessoa/empresa",
    quando: "A resposta não foi 1, 2 nem equivalente.",
    grupo: "bot",
    variaveis: [],
    padrao: "Só para eu registrar certo: responda *1* para você ou *2* para empresa.",
  },
  {
    slug: "bot.concluido",
    titulo: "Pré-cadastro concluído",
    quando: "Nome e tipo registrados. Convida a dizer o que precisa.",
    grupo: "bot",
    variaveis: [VAR_NOME],
    padrao: "Perfeito, anotado! ✅\n\nMe conta o que você precisa que já encaminho para a equipe.",
  },
  {
    slug: "bot.passa_equipe",
    titulo: "Encaminhando para a equipe",
    quando: "O cliente diz o que precisa e o bot se retira.",
    grupo: "bot",
    variaveis: [VAR_NOME],
    padrao: "Recebi! Já estou passando para a equipe te responder 🙂",
  },
  {
    slug: "bot.cliente_conhecido",
    titulo: "Quem já é cliente",
    quando: "Cliente com cadastro escreve. Não passa pelo funil.",
    grupo: "bot",
    variaveis: [VAR_NOME],
    padrao: "Oi, {nome}! Que bom te ver por aqui 🙂\nJá estou chamando a equipe para te atender.",
  },
  {
    slug: "bot.quer_humano",
    titulo: "Pediu atendente",
    quando: 'O cliente escreve "atendente", "humano", "falar com alguém".',
    grupo: "bot",
    variaveis: [],
    padrao: "Claro! Já estou chamando alguém da equipe. Um instante 🙂",
  },
  {
    slug: "bot.ausencia",
    titulo: "Aviso enquanto o bot está desligado",
    quando:
      "Só quando você desliga o bot E deixa o aviso ligado. Sai uma vez por conversa.",
    grupo: "bot",
    variaveis: [VAR_EMPRESA],
    padrao:
      "Recebi sua mensagem! 🙂\n\nEstamos fora do atendimento automático agora, mas já anotei aqui e a equipe responde assim que possível.",
  },
  {
    slug: "bot.opt_out",
    titulo: "Pediu para não receber mais",
    quando: 'O cliente escreve "sair", "parar", "cancelar".',
    grupo: "bot",
    variaveis: [],
    padrao: "Pronto, não envio mais mensagens automáticas. Se precisar, é só escrever.",
  },

  /* ── Link de cadastro ── */
  {
    slug: "cadastro.pedir",
    titulo: "Pedido de cadastro (com o link)",
    quando: 'Você clica em "Pedir cadastro" na ficha do cliente.',
    grupo: "cadastro",
    variaveis: [
      VAR_NOME,
      VAR_EMPRESA,
      { nome: "link", descricao: "Endereço único do formulário" },
      { nome: "validade", descricao: "Quantos dias o link vale (hoje: 7)" },
    ],
    padrao:
      "Oi, {nome}!\n\n" +
      "Para seguir com seu orçamento, preciso do seu cadastro completo. Leva 1 minuto:\n" +
      "{link}\n\n" +
      "Já deixei seu nome e telefone preenchidos. O link vale {validade} dias.\n\n" +
      "— {empresa}",
  },
];

const POR_SLUG = new Map(CATALOGO.map((m) => [m.slug, m]));

export function definicao(slug: string): DefinicaoMensagem | undefined {
  return POR_SLUG.get(slug);
}

/**
 * Troca {variaveis} pelos valores.
 *
 * Chave desconhecida fica literal de propósito — ver comentário do
 * topo. Valor vazio some junto com a linha se ela ficar só com ele,
 * para não deixar "— " solto no fim da mensagem.
 */
export function preencher(texto: string, valores: Record<string, string>): string {
  const trocado = texto.replace(/\{(\w+)\}/g, (bruto, chave: string) =>
    chave in valores ? String(valores[chave] ?? "") : bruto
  );

  /* Linha que virou só pontuação depois da troca (o "— {empresa}" de
     quem não preencheu o nome da empresa) não deve sobrar. */
  return trocado
    .split("\n")
    .filter((linha) => !/^\s*[—\-–]\s*$/.test(linha))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface MensagemResolvida {
  slug: string;
  texto: string;
  ativa: boolean;
  /** true = está usando o texto de fábrica. */
  padrao: boolean;
}

/** Lê uma mensagem já preenchida, caindo no padrão quando preciso. */
export async function mensagem(
  slug: string,
  valores: Record<string, string> = {}
): Promise<MensagemResolvida> {
  const def = POR_SLUG.get(slug);
  if (!def) {
    /* Slug inexistente é erro de programação, não do operador. */
    throw new Error(`Mensagem desconhecida: ${slug}`);
  }

  let bruto = def.padrao;
  let ativa = true;
  let ehPadrao = true;

  try {
    const [linha] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.slug, slug))
      .limit(1);
    if (linha) {
      ativa = linha.active;
      const corpo = String(linha.body ?? "").trim();
      if (corpo) {
        bruto = corpo;
        ehPadrao = false;
      }
    }
  } catch (e) {
    /* Banco inacessível não pode calar o bot. */
    console.error("[mensagens] leitura falhou, usando padrão", e);
  }

  return { slug, texto: preencher(bruto, valores), ativa, padrao: ehPadrao };
}

/** Catálogo + o que está salvo, para a tela de edição. */
export async function listarMensagens() {
  let salvos: Record<string, { body: string | null; active: boolean; updatedAt: Date }> = {};
  try {
    const linhas = await db
      .select()
      .from(messageTemplates)
      .where(inArray(messageTemplates.slug, CATALOGO.map((m) => m.slug)));
    salvos = Object.fromEntries(
      linhas.map((l) => [l.slug, { body: l.body, active: l.active, updatedAt: l.updatedAt }])
    );
  } catch (e) {
    console.error("[mensagens] listagem falhou", e);
  }

  return CATALOGO.map((def) => {
    const s = salvos[def.slug];
    const corpo = String(s?.body ?? "").trim();
    return {
      ...def,
      /* O que está valendo agora. */
      texto: corpo || def.padrao,
      ativa: s?.active ?? true,
      customizada: !!corpo && corpo !== def.padrao,
      atualizadaEm: s?.updatedAt ?? null,
    };
  });
}

export type MensagemListada = Awaited<ReturnType<typeof listarMensagens>>[number];

export interface ErroMensagem {
  error: string;
  status: number;
}

/** Salva uma customização. Texto igual ao padrão volta a ser padrão. */
export async function salvarMensagem(
  slug: string,
  body: string,
  opts: { active?: boolean; updatedBy?: string } = {}
): Promise<{ ok: true } | ErroMensagem> {
  const def = POR_SLUG.get(slug);
  if (!def) return { error: "Mensagem desconhecida", status: 404 };

  const corpo = String(body ?? "").trim();
  if (corpo.length > 1200) {
    return { error: "Mensagem muito longa (máximo 1200 caracteres)", status: 422 };
  }

  /* Variável inventada vira texto literal na conversa. Melhor recusar
     aqui, com o nome do erro, do que o cliente receber "{nomee}". */
  const conhecidas = new Set(def.variaveis.map((v) => v.nome));
  const usadas = [...corpo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const invalida = usadas.find((u) => !conhecidas.has(u));
  if (invalida) {
    const lista = def.variaveis.map((v) => `{${v.nome}}`).join(", ") || "nenhuma";
    return {
      error: `A variável {${invalida}} não existe nesta mensagem. Disponíveis: ${lista}`,
      status: 422,
    };
  }

  /* Mensagem essencial não pode ficar vazia E ativa: o bot travaria o
     funil esperando uma resposta que nunca pediu. */
  if (!corpo && opts.active !== false && !def.desligavel) {
    /* Texto vazio = volta ao padrão, que é comportamento útil. */
  }

  /* Guardar cópia idêntica ao padrão só cria manutenção: se um dia o
     padrão melhorar, quem não customizou nada deve receber a melhora. */
  const guardar = corpo === def.padrao.trim() ? null : corpo || null;

  await db
    .insert(messageTemplates)
    .values({
      slug,
      body: guardar,
      active: opts.active ?? true,
      updatedBy: opts.updatedBy || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: messageTemplates.slug,
      set: {
        body: guardar,
        active: opts.active ?? true,
        updatedBy: opts.updatedBy || null,
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}

/** Devolve ao texto de fábrica. */
export async function restaurarMensagem(slug: string): Promise<{ ok: true } | ErroMensagem> {
  if (!POR_SLUG.has(slug)) return { error: "Mensagem desconhecida", status: 404 };
  await db
    .update(messageTemplates)
    .set({ body: null, active: true, updatedAt: new Date() })
    .where(eq(messageTemplates.slug, slug));
  return { ok: true };
}
