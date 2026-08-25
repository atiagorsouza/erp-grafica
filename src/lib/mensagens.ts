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
  grupo: "bot" | "cadastro" | "orcamento" | "pedido" | "rapidas" | "campanha";
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

  /* ── Orçamento por WhatsApp ──
     Nasceu do balcão: o cliente pede orçamento e o sistema só sabia
     imprimir. O texto fica aqui, editável pelo Painel, porque a forma
     de falar com o cliente é do dono — não do programador.

     `itens` chega pronto (uma linha por item) porque o preenchimento
     é troca simples de {chave}: não sabe montar lista. */
  {
    slug: "orcamento.enviar",
    titulo: "Envio do orçamento por WhatsApp",
    quando: 'Você clica em "WhatsApp" na tela de Orçamentos.',
    grupo: "orcamento",
    variaveis: [
      VAR_NOME,
      VAR_EMPRESA,
      { nome: "numero", descricao: "Número do orçamento (ex.: ORC-2026-0042)" },
      { nome: "itens", descricao: "Lista dos itens, um por linha, já formatada" },
      { nome: "total", descricao: "Valor total (ex.: R$ 300,00)" },
      { nome: "validade", descricao: "Data até quando a proposta vale" },
    ],
    padrao:
      "Olá, {nome}! 🙂\n\n" +
      "Segue o orçamento que você pediu:\n\n" +
      "*{numero}*\n" +
      "{itens}\n\n" +
      "*Total: {total}*\n" +
      "_Válido até {validade}_\n\n" +
      "Qualquer dúvida é só chamar. Se aprovar, me avisa que já coloco na produção!\n\n" +
      "— {empresa}",
  },

  /* ── Pedido ──────────────────────────────────────────────────────
     O texto que vai ao cliente quando o pedido já existe. Não é a
     ordem de produção: aquilo é papel interno, cheio de status que
     não dizem nada para quem comprou. Aqui vale o que ele quer saber
     — o que pediu, quanto é, quando fica pronto. */
  {
    slug: "pedido.andamento",
    titulo: "Andamento do pedido por WhatsApp",
    quando: 'Você clica em "WhatsApp" na tela de Pedidos & OS.',
    grupo: "pedido",
    variaveis: [
      VAR_NOME,
      VAR_EMPRESA,
      { nome: "numero", descricao: "Número do pedido (ex.: PED-2026-0042)" },
      { nome: "situacao", descricao: "Em que pé está a produção, em português" },
      { nome: "total", descricao: "Valor total (ex.: R$ 300,00)" },
      { nome: "prazo", descricao: "Data prevista de entrega" },
    ],
    padrao:
      "Oi, {nome}! 🙂\n\n" +
      "Passando o andamento do seu pedido *{numero}*:\n\n" +
      "*Situação:* {situacao}\n" +
      "*Previsão de entrega:* {prazo}\n" +
      "*Total:* {total}\n\n" +
      "Qualquer dúvida é só chamar!\n\n" +
      "— {empresa}",
  },
  {
    slug: "pedido.pronto",
    titulo: "Pedido pronto para retirada",
    quando: 'Atalho na tela de Pedidos, quando o trabalho fica pronto.',
    grupo: "pedido",
    variaveis: [
      VAR_NOME,
      VAR_EMPRESA,
      { nome: "numero", descricao: "Número do pedido" },
      { nome: "total", descricao: "Valor total" },
    ],
    padrao:
      "Boa notícia, {nome}! ✅\n\n" +
      "Seu pedido *{numero}* está pronto.\n\n" +
      "Pode retirar de segunda a sexta das 9h às 18h, ou sábado até as 13h, " +
      "na Rua Araquém, 910 — Bangu.\n\n" +
      "— {empresa}",
  },

  /* ── Respostas rápidas ──────────────────────────────────────────
     Atalhos de um clique no chat, para quando o operador assumiu a
     conversa e o robô está calado. São as perguntas que mais chegam:
     digitar a mesma resposta dez vezes por dia é trabalho que o
     sistema devia poupar.

     Todas editáveis pelo Painel → Mensagens, como tudo que o cliente
     lê. O texto sai exatamente como estiver ali. */
  {
    slug: "rapida.saudacao",
    titulo: "Bom dia / boa tarde",
    quando: "Atalho no chat — abrir o atendimento.",
    grupo: "rapidas",
    desligavel: true,
    variaveis: [VAR_NOME, VAR_EMPRESA],
    padrao:
      "Oi, {nome}! Aqui é da {empresa} 🙂\n\n" +
      "Em que posso te ajudar hoje?",
  },
  {
    slug: "rapida.prazo",
    titulo: "Prazo de produção",
    quando: 'Atalho no chat — responder "quanto tempo demora?".',
    grupo: "rapidas",
    desligavel: true,
    variaveis: [VAR_NOME],
    padrao:
      "O prazo depende do que você precisa, {nome}.\n\n" +
      "Impressão rápida costuma sair no mesmo dia ou no dia seguinte. " +
      "Trabalhos com arte, acabamento especial ou quantidade maior levam de 2 a 5 dias úteis.\n\n" +
      "Me diz o que você precisa que eu te falo o prazo certinho.",
  },
  {
    slug: "rapida.pagamento",
    titulo: "Formas de pagamento",
    quando: 'Atalho no chat — responder "como posso pagar?".',
    grupo: "rapidas",
    desligavel: true,
    variaveis: [],
    padrao:
      "Aceitamos PIX, dinheiro, débito e crédito 💳\n\n" +
      "No PIX ou dinheiro trabalhamos com 50% na aprovação e 50% na entrega. " +
      "No cartão o valor é integral, e dá para parcelar.\n\n" +
      "Qual fica melhor para você?",
  },
  {
    slug: "rapida.endereco",
    titulo: "Endereço e horário",
    quando: 'Atalho no chat — responder "onde vocês ficam?".',
    grupo: "rapidas",
    desligavel: true,
    variaveis: [VAR_EMPRESA],
    padrao:
      "Estamos na Rua Araquém, 910 — Bangu, Rio de Janeiro 📍\n\n" +
      "Atendemos de segunda a sexta, das 9h às 18h, e sábado até as 13h.\n\n" +
      "Te espero por aqui!",
  },
  {
    slug: "rapida.arte",
    titulo: "Pedir a arte",
    quando: "Atalho no chat — pedir o arquivo para produzir.",
    grupo: "rapidas",
    desligavel: true,
    variaveis: [VAR_NOME],
    padrao:
      "{nome}, me manda a arte por aqui mesmo 📎\n\n" +
      "Se puder, em PDF ou PNG em boa qualidade. Se você ainda não tem, a gente cria para você — é só avisar.",
  },
  {
    slug: "rapida.pronto",
    titulo: "Pedido pronto para retirada",
    quando: "Atalho no chat — avisar que o trabalho ficou pronto.",
    grupo: "rapidas",
    desligavel: true,
    variaveis: [VAR_NOME, VAR_EMPRESA],
    padrao:
      "Boa notícia, {nome}! Seu pedido está pronto ✅\n\n" +
      "Pode retirar de segunda a sexta das 9h às 18h, ou sábado até as 13h, " +
      "na Rua Araquém, 910 — Bangu.\n\n" +
      "— {empresa}",
  },
  {
    slug: "rapida.aguarde",
    titulo: "Já te respondo",
    quando: "Atalho no chat — avisar que vai demorar um pouco.",
    grupo: "rapidas",
    desligavel: true,
    variaveis: [],
    padrao:
      "Recebi sua mensagem! Só um minutinho que já te respondo direitinho 🙂",
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
