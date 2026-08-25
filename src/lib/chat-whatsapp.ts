import "server-only";

/* ──────────────────────────────────────────────────────────────────
   CHAT DE ACOMPANHAMENTO

   Lê as conversas que o serviço do WhatsApp grava e devolve para a
   tela do ERP. É só leitura — quem envia é o serviço, por
   /api/whatsapp/enviar.

   Nota sobre as tabelas: `whatsapp_conversas` e `whatsapp_mensagens`
   são criadas pelo SERVIÇO (services/whatsapp), não pelo drizzle.
   Isso é proposital — o serviço precisa subir sozinho numa máquina
   onde o ERP talvez nem tenha rodado ainda. Aqui, portanto, toda
   consulta tolera a ausência delas: sistema sem bot instalado mostra
   "nenhuma conversa", não uma tela de erro.
   ────────────────────────────────────────────────────────────────── */

import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface ConversaResumo {
  phoneE164: string;
  customerId: number | null;
  nome: string;
  etapa: string;
  assumidaPor: string | null;
  assumidaEm: string | null;
  ultimaMensagem: string | null;
  ultimaEm: string | null;
  ultimaDirecao: string | null;
  naoLidas: number;
  optOut: boolean;
}

export interface MensagemChat {
  id: number;
  direcao: "recebida" | "enviada";
  texto: string;
  criadoEm: string;
}

/** Silencia erro de tabela ausente — bot não instalado é estado válido. */
async function tolerante<T>(fn: () => Promise<T>, vazio: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|não existe/i.test(msg)) return vazio;
    console.error("[chat]", e);
    return vazio;
  }
}

/** Lista de conversas, mais recentes primeiro. */
export async function listarConversas(limite = 60): Promise<ConversaResumo[]> {
  return tolerante(async () => {
    const r = await db.execute<{
      phone_e164: string; customer_id: number | null; nome: string | null;
      etapa: string; assumida_por: string | null; assumida_em: Date | null;
      ultima_texto: string | null; ultima_em: Date | null; ultima_direcao: string | null;
      nao_lidas: string; opt_out: boolean | null;
    }>(sql`
      SELECT co.phone_e164,
             co.customer_id,
             cli.name AS nome,
             co.etapa,
             co.assumida_por,
             co.assumida_em,
             ult.texto   AS ultima_texto,
             ult.criado_em AS ultima_em,
             ult.direcao AS ultima_direcao,
             coalesce(nl.n, 0) AS nao_lidas,
             cli.whatsapp_opt_out AS opt_out
        FROM whatsapp_conversas co
        LEFT JOIN customers cli ON cli.id = co.customer_id
        LEFT JOIN LATERAL (
          SELECT texto, criado_em, direcao
            FROM whatsapp_mensagens m
           WHERE m.phone_e164 = co.phone_e164
           ORDER BY m.criado_em DESC
           LIMIT 1
        ) ult ON true
        LEFT JOIN LATERAL (
          /* "Não lidas" = recebidas depois da última resposta nossa.
             É o que o atendente precisa ver: quem está esperando. */
          SELECT count(*) AS n
            FROM whatsapp_mensagens m
           WHERE m.phone_e164 = co.phone_e164
             AND m.direcao = 'recebida'
             AND m.criado_em > coalesce(
               (SELECT max(criado_em) FROM whatsapp_mensagens e
                 WHERE e.phone_e164 = co.phone_e164 AND e.direcao = 'enviada'),
               '-infinity'::timestamptz
             )
        ) nl ON true
       ORDER BY ult.criado_em DESC NULLS LAST
       LIMIT ${limite}
    `);

    return (r.rows || []).map((x) => ({
      phoneE164: String(x.phone_e164),
      customerId: x.customer_id ? Number(x.customer_id) : null,
      nome: String(x.nome || "").trim() || "Sem cadastro",
      etapa: String(x.etapa || ""),
      assumidaPor: x.assumida_por || null,
      assumidaEm: x.assumida_em ? new Date(x.assumida_em).toISOString() : null,
      ultimaMensagem: x.ultima_texto || null,
      ultimaEm: x.ultima_em ? new Date(x.ultima_em).toISOString() : null,
      ultimaDirecao: x.ultima_direcao || null,
      naoLidas: Number(x.nao_lidas || 0),
      optOut: x.opt_out === true,
    }));
  }, []);
}

/** Histórico de uma conversa, com aviso de que existe mais atrás.
 *
 *  Antes trazia 200 mensagens de uma vez. Numa conversa de meses isso
 *  vira uma parede de texto: o operador rola, rola e não chega ao fim
 *  — e o que ele quer é quase sempre a última troca.
 *
 *  Agora traz um lote (padrão 30) e informa se há mais para trás, para
 *  a tela oferecer "ver anteriores" em vez de despejar tudo. */
export async function mensagensDe(
  phoneE164: string,
  limite = 30
): Promise<{ mensagens: MensagemChat[]; temAnteriores: boolean; total: number }> {
  const fone = String(phoneE164 || "").replace(/\D/g, "");
  if (!fone) return { mensagens: [], temAnteriores: false, total: 0 };

  const lote = Math.max(1, Math.min(500, Math.floor(limite)));

  return tolerante(async () => {
    const [linhas, contagem] = await Promise.all([
      db.execute<{ id: number; direcao: string; texto: string | null; criado_em: Date }>(sql`
        SELECT id, direcao, texto, criado_em
          FROM whatsapp_mensagens
         WHERE phone_e164 = ${fone}
         ORDER BY criado_em DESC
         LIMIT ${lote}
      `),
      db.execute<{ n: string }>(sql`
        SELECT count(*) AS n FROM whatsapp_mensagens WHERE phone_e164 = ${fone}
      `),
    ]);

    /* Vem do banco em ordem decrescente (para o LIMIT pegar as mais
       novas) e é invertido aqui: a tela lê de cima para baixo. */
    const mensagens = (linhas.rows || [])
      .map((x) => ({
        id: Number(x.id),
        direcao: (x.direcao === "enviada" ? "enviada" : "recebida") as "enviada" | "recebida",
        texto: String(x.texto || ""),
        criadoEm: new Date(x.criado_em).toISOString(),
      }))
      .reverse();

    const total = Number(contagem.rows?.[0]?.n || 0);
    return { mensagens, temAnteriores: total > mensagens.length, total };
  }, { mensagens: [], temAnteriores: false, total: 0 });
}

export interface PedidoResumo {
  id: number;
  numero: string;
  status: string;
  producao: string;
  total: number;
  entrega: string | null;
  criadoEm: string;
}

export interface FichaChat {
  id: number;
  nome: string;
  tipo: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  desde: string | null;
  ltv: number;
  pedidos: PedidoResumo[];
  orcamentosAbertos: number;
  /* FICHA 360º (25/08): o chat precisa responder "o que esse cliente
     fez?" sem sair da conversa — balcão, orçamento e cobrança junto
     com o pedido que já vinha. */
  vendas: VendaResumo[];
  orcamentos: OrcamentoResumo[];
  cobrancas: CobrancaResumo[];
}

export interface VendaResumo {
  id: number;
  numero: string;
  total: number;
  pagamento: string | null;
  criadoEm: string;
}

export interface OrcamentoResumo {
  id: number;
  numero: string;
  total: number;
  status: string;
  criadoEm: string;
}

export interface CobrancaResumo {
  id: number;
  descricao: string;
  valor: number;
  status: string;
  criadoEm: string;
}

/** Ficha do cliente para o chat: quem é, quanto já comprou e o que
 *  está em produção agora.
 *
 *  Atender sem isto é atender às cegas: o cliente pergunta "e o meu
 *  pedido?" e o operador tinha que abrir outra aba, procurar pelo nome
 *  e voltar. Aqui vem junto da conversa.
 *
 *  LTV exclui cancelados — cobrar valor de pedido cancelado no
 *  histórico do cliente é erro que aparece na frente dele. */
export async function fichaDoCliente(customerId: number): Promise<FichaChat | null> {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) return null;

  return tolerante(async () => {
    const [cli, peds, ltv, orc, vendas, ltvVendas, orcLista, cobranca] = await Promise.all([
      db.execute<{
        id: number; name: string; type: string | null; document: string | null;
        email: string | null; phone: string | null; whatsapp: string | null;
        city: string | null; state: string | null; created_at: Date;
      }>(sql`
        SELECT id, name, type::text AS type, document, email, phone, whatsapp, city, state, created_at
          FROM customers WHERE id = ${id} LIMIT 1
      `),
      db.execute<{
        id: number; number: string; status: string; production_status: string;
        total: string; due_date: string | null; created_at: Date;
      }>(sql`
        SELECT id, number, status, production_status, total, due_date, created_at
          FROM orders WHERE customer_id = ${id}
         ORDER BY created_at DESC LIMIT 5
      `),
      db.execute<{ v: string }>(sql`
        SELECT COALESCE(SUM(total),0) AS v FROM orders
         WHERE customer_id = ${id} AND status <> 'cancelado'
      `),
      db.execute<{ n: string }>(sql`
        SELECT count(*) AS n FROM quotes
         WHERE customer_id = ${id} AND status IN ('rascunho','enviado')
      `),
      db.execute<{
        id: number; number: string; total: string; payment_method: string | null; created_at: Date;
      }>(sql`
        SELECT id, number, total, payment_method, created_at
          FROM sales WHERE customer_id = ${id} AND status <> 'cancelada'
         ORDER BY created_at DESC LIMIT 5
      `),
      db.execute<{ v: string }>(sql`
        SELECT COALESCE(SUM(total),0) AS v FROM sales
         WHERE customer_id = ${id} AND status <> 'cancelada'
      `),
      db.execute<{ id: number; number: string; total: string; status: string; created_at: Date }>(sql`
        SELECT id, number, total, status, created_at
          FROM quotes WHERE customer_id = ${id}
         ORDER BY created_at DESC LIMIT 5
      `),
      db.execute<{ id: number; description: string; amount: string; status: string; created_at: Date }>(sql`
        SELECT id, description, amount, status, created_at
          FROM payment_links WHERE customer_id = ${id}
         ORDER BY created_at DESC LIMIT 5
      `),
    ]);

    const c = cli.rows?.[0];
    if (!c) return null;

    return {
      id: Number(c.id),
      nome: String(c.name || ""),
      tipo: c.type || null,
      documento: c.document || null,
      email: c.email || null,
      telefone: c.whatsapp || c.phone || null,
      cidade: c.city || null,
      estado: c.state || null,
      desde: c.created_at ? new Date(c.created_at).toISOString() : null,
      /* LTV completo: pedido (produção) + venda de balcão. Antes só
         pedido — cliente fiel do balcão aparecia como "nunca comprou". */
      ltv: Number(ltv.rows?.[0]?.v || 0) + Number(ltvVendas.rows?.[0]?.v || 0),
      orcamentosAbertos: Number(orc.rows?.[0]?.n || 0),
      pedidos: (peds.rows || []).map((p) => ({
        id: Number(p.id),
        numero: String(p.number || ""),
        status: String(p.status || ""),
        producao: String(p.production_status || ""),
        total: Number(p.total || 0),
        entrega: p.due_date || null,
        criadoEm: new Date(p.created_at).toISOString(),
      })),
      vendas: (vendas.rows || []).map((v) => ({
        id: Number(v.id),
        numero: String(v.number || ""),
        total: Number(v.total || 0),
        pagamento: v.payment_method || null,
        criadoEm: new Date(v.created_at).toISOString(),
      })),
      orcamentos: (orcLista.rows || []).map((o) => ({
        id: Number(o.id),
        numero: String(o.number || ""),
        total: Number(o.total || 0),
        status: String(o.status || ""),
        criadoEm: new Date(o.created_at).toISOString(),
      })),
      cobrancas: (cobranca.rows || []).map((k) => ({
        id: Number(k.id),
        descricao: String(k.description || ""),
        valor: Number(k.amount || 0),
        status: String(k.status || ""),
        criadoEm: new Date(k.created_at).toISOString(),
      })),
    };
  }, null);
}

/* ── CADASTRO DIRETO DO CHAT (ficha 360º) ──────────────────────────
   Conversa "sem cadastro": o operador cadastra sem sair do WhatsApp.
   Nome vem pré-preenchido do nome da conversa; telefone é o E164 que
   já identifica a conversa. Se o cliente JÁ existe (telefone igual,
   máscara diferente), não duplica — só vincula a conversa a ele. */
export async function cadastrarDoChat(
  rawNome: string,
  phoneE164: string
): Promise<{ ok: true; customerId: number; criado: boolean } | { error: string; status: number }> {
  const nome = String(rawNome || "").trim();
  const fone = String(phoneE164 || "").replace(/\D+/g, "");
  if (nome.length < 2) return { error: "Informe o nome do cliente", status: 422 };
  if (fone.length < 10 || fone.length > 15) return { error: "Telefone inválido", status: 422 };

  const variantes = fone.startsWith("55") && fone.length >= 12 ? [fone, fone.slice(2)] : [fone];

  /* drizzle expande array puro como tupla ($1,$2), que quebra o
     ANY(::text[]) — sql.join emite uma lista de parâmetros de verdade. */
  const existente = await db.execute<{ id: number }>(sql`
    SELECT id FROM customers
     WHERE regexp_replace(coalesce(whatsapp, phone, ''), '\\D', '', 'g')
       IN (${sql.join(variantes.map((v) => sql`${v}`), sql`, `)})
     LIMIT 1
  `);
  let customerId = Number(existente.rows?.[0]?.id || 0);
  let criado = false;

  if (!customerId) {
    const ins = await db.execute<{ id: number }>(sql`
      INSERT INTO customers (name, phone, whatsapp, type)
      VALUES (${nome}, ${fone}, ${fone}, 'pf')
      RETURNING id
    `);
    customerId = Number(ins.rows?.[0]?.id || 0);
    criado = true;
  }
  if (!customerId) return { error: "Não foi possível cadastrar o cliente", status: 500 };

  await db.execute(sql`
    UPDATE whatsapp_conversas SET customer_id = ${customerId}
     WHERE phone_e164 = ${fone} AND coalesce(customer_id, 0) <> ${customerId}
  `);

  return { ok: true as const, customerId, criado };
}

/** Quantas conversas esperam resposta — para o badge do menu. */
export async function contarEsperando(): Promise<number> {
  return tolerante(async () => {
    const r = await db.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM whatsapp_conversas co
       WHERE EXISTS (
         SELECT 1 FROM whatsapp_mensagens m
          WHERE m.phone_e164 = co.phone_e164
            AND m.direcao = 'recebida'
            AND m.criado_em > coalesce(
              (SELECT max(criado_em) FROM whatsapp_mensagens e
                WHERE e.phone_e164 = co.phone_e164 AND e.direcao = 'enviada'),
              '-infinity'::timestamptz
            )
       )
    `);
    return Number(r.rows?.[0]?.n || 0);
  }, 0);
}
