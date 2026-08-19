import "server-only";

/* ──────────────────────────────────────────────────────────────────
   CAMPANHAS DE WHATSAPP — base quente apenas.

   Este arquivo é, antes de tudo, uma lista de recusas. Ele existe
   para dizer NÃO a envios que colocariam o número da gráfica em
   risco de banimento.

   O número que justifica tudo: bot que só fala com quem escreveu
   primeiro tem menos de 2% de banimento em 12 meses; bot que aborda
   contato frio, de 15% a 30%. A diferença é de ordem de grandeza, e
   ela mora numa pergunta só — "essa pessoa já me escreveu?".

   As 6 condições combinadas com o dono (ver
   MARKETING-WHATSAPP-BASE-QUENTE.md):

     1. conversa recebida registrada — não basta estar cadastrado
     2. última interação há menos de 12 meses
     3. opt-in de marketing, com data e origem
     4. máximo 4 mensagens de marketing por pessoa por mês
     5. lote de no máximo 50 por dia
     6. disjuntor automático em 1% de bloqueio

   A base é de ~300 contatos. Nela, cada pessoa vale 0,33%: DUAS
   pessoas irritadas já colocam a conta na zona amarela, SEIS na
   vermelha. Por isso o disjuntor é agressivo — em base pequena não
   há espaço para descobrir devagar.
   ────────────────────────────────────────────────────────────────── */

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignTargets, customers } from "@/db/schema";
import { preencher } from "@/lib/mensagens";

/** Teto por pessoa, por mês. */
export const MAX_POR_PESSOA_MES = 4;
/** Teto de envios por dia, independente do que o operador pedir. */
export const MAX_POR_DIA = 50;
/** Janela de "contato recente". */
export const MESES_VALIDADE = 12;
/** Disjuntor: acima disso, a campanha para sozinha. */
export const LIMITE_BLOQUEIO = 0.01; // 1%
/** Só dispara depois de N envios — 1 bloqueio em 3 não é tendência. */
export const MINIMO_PARA_DISJUNTOR = 20;

export type CampanhaErro = { error: string; status: number; details?: unknown };

export interface Elegivel {
  customerId: number;
  name: string;
  phoneE164: string;
  ultimaMensagem: Date | null;
  recebidasNoMes: number;
}

export interface Inelegivel {
  customerId: number;
  name: string;
  motivo: string;
}

/**
 * Quem pode receber campanha AGORA.
 *
 * Devolve as duas listas de propósito: o operador precisa ver quem
 * ficou de fora e por quê. "Sua base tem 300 pessoas mas só 47 podem
 * receber" é informação que muda a decisão de disparar.
 */
export async function audiencia(): Promise<{ elegiveis: Elegivel[]; inelegiveis: Inelegivel[] }> {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_VALIDADE);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  /* A consulta junta tudo que as regras pedem. `whatsapp_mensagens` é
     criada pelo serviço do bot; se ele nunca rodou, a tabela não
     existe e ninguém é elegível — que é a resposta correta, porque
     sem histórico não há como saber quem escreveu primeiro. */
  let linhas: {
    id: number; name: string; phoneE164: string | null;
    optOut: boolean; optIn: boolean;
    recebidas: number; ultima: Date | null; noMes: number;
  }[] = [];

  try {
    const r = await db.execute<{
      id: number; name: string; phone_e164: string | null;
      opt_out: boolean; opt_in: boolean;
      recebidas: string; ultima: Date | null; no_mes: string;
    }>(sql`
      SELECT c.id,
             c.name,
             c.phone_e164,
             c.whatsapp_opt_out AS opt_out,
             c.marketing_opt_in AS opt_in,
             coalesce(m.recebidas, 0) AS recebidas,
             m.ultima,
             coalesce(camp.no_mes, 0) AS no_mes
        FROM customers c
        LEFT JOIN (
          SELECT phone_e164,
                 count(*) FILTER (WHERE direcao = 'recebida') AS recebidas,
                 max(criado_em) FILTER (WHERE direcao = 'recebida') AS ultima
            FROM whatsapp_mensagens
           GROUP BY phone_e164
        ) m ON m.phone_e164 = c.phone_e164
        LEFT JOIN (
          SELECT t.customer_id, count(*) AS no_mes
            FROM campaign_targets t
           WHERE t.status = 'enviado' AND t.sent_at >= ${inicioMes}
           GROUP BY t.customer_id
        ) camp ON camp.customer_id = c.id
       WHERE coalesce(c.phone_e164, '') <> ''
       ORDER BY m.ultima DESC NULLS LAST
    `);
    linhas = (r.rows || []).map((x) => ({
      id: Number(x.id),
      name: String(x.name),
      phoneE164: x.phone_e164,
      optOut: x.opt_out === true,
      optIn: x.opt_in === true,
      recebidas: Number(x.recebidas || 0),
      ultima: x.ultima ? new Date(x.ultima) : null,
      noMes: Number(x.no_mes || 0),
    }));
  } catch (e) {
    /* Sem a tabela do bot não há base quente. Falhar fechado. */
    console.error("[campanhas] audiência indisponível", e);
    return { elegiveis: [], inelegiveis: [] };
  }

  const elegiveis: Elegivel[] = [];
  const inelegiveis: Inelegivel[] = [];

  for (const l of linhas) {
    const base = { customerId: l.id, name: l.name };

    /* A ordem importa: o motivo mostrado deve ser o mais acionável.
       "Sem opt-in" o operador resolve pedindo; "nunca escreveu" não
       tem solução — e é a recusa mais importante. */
    if (l.recebidas === 0) {
      inelegiveis.push({ ...base, motivo: "nunca escreveu para a gráfica" });
      continue;
    }
    if (l.optOut) {
      inelegiveis.push({ ...base, motivo: "pediu para não receber mensagens" });
      continue;
    }
    if (!l.optIn) {
      inelegiveis.push({ ...base, motivo: "sem autorização para marketing" });
      continue;
    }
    if (!l.ultima || l.ultima < limite) {
      inelegiveis.push({ ...base, motivo: `sem contato há mais de ${MESES_VALIDADE} meses` });
      continue;
    }
    if (l.noMes >= MAX_POR_PESSOA_MES) {
      inelegiveis.push({ ...base, motivo: `já recebeu ${l.noMes} mensagens este mês` });
      continue;
    }

    elegiveis.push({
      customerId: l.id,
      name: l.name,
      phoneE164: l.phoneE164 as string,
      ultimaMensagem: l.ultima,
      recebidasNoMes: l.noMes,
    });
  }

  return { elegiveis, inelegiveis };
}

/** Primeiro nome, para personalizar sem soar formal demais. */
const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

/** Monta o texto final de um destinatário. */
export function textoParaCliente(
  campanha: { body: string; ctaLabel?: string | null; ctaUrl?: string | null },
  cliente: { name: string },
  empresa: string
): string {
  let texto = preencher(campanha.body, {
    nome: primeiroNome(cliente.name),
    empresa,
  });
  /* O Baileys não tem botão nativo (isso é da API oficial). O CTA vai
     como link no fim, que funciona em qualquer WhatsApp. */
  if (campanha.ctaUrl) {
    const rotulo = String(campanha.ctaLabel || "").trim();
    texto += `\n\n${rotulo ? `${rotulo}:\n` : ""}${campanha.ctaUrl}`;
  }
  return texto.trim();
}

export async function criarCampanha(raw: {
  name?: unknown; body?: unknown; ctaLabel?: unknown; ctaUrl?: unknown;
  imageDataUri?: unknown; dailyLimit?: unknown; createdBy?: unknown;
}): Promise<{ ok: true; row: typeof campaigns.$inferSelect } | CampanhaErro> {
  const name = String(raw.name ?? "").trim();
  const body = String(raw.body ?? "").trim();

  if (name.length < 3) return { error: "Dê um nome à campanha", status: 422 };
  if (body.length < 10) return { error: "A mensagem está curta demais", status: 422 };
  if (body.length > 900) return { error: "A mensagem passou de 900 caracteres", status: 422 };

  const ctaUrl = String(raw.ctaUrl ?? "").trim();
  if (ctaUrl && !/^https?:\/\/\S+$/i.test(ctaUrl)) {
    return { error: "O link do botão precisa começar com http:// ou https://", status: 422 };
  }

  /* Variáveis: só as duas que fazem sentido em massa. Uma chave
     inventada sairia literal na conversa do cliente. */
  const permitidas = new Set(["nome", "empresa"]);
  const usadas = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const ruim = usadas.find((u) => !permitidas.has(u));
  if (ruim) {
    return { error: `A variável {${ruim}} não existe. Use {nome} ou {empresa}.`, status: 422 };
  }

  /* Mensagem que não pede resposta é perigosa: taxa de resposta baixa
     é sinal de spam para a plataforma. Isto é um aviso, não um
     bloqueio — não cabe ao sistema reprovar o texto do dono. */
  const pedeResposta = /\?|responda|me chama|me avisa|quer|interessa|posso/i.test(body);

  const limite = Math.min(
    Math.max(1, Number(raw.dailyLimit) || MAX_POR_DIA),
    MAX_POR_DIA
  );

  const [row] = await db
    .insert(campaigns)
    .values({
      name,
      body,
      ctaLabel: String(raw.ctaLabel ?? "").trim() || null,
      ctaUrl: ctaUrl || null,
      imageDataUri: String(raw.imageDataUri ?? "").trim() || null,
      dailyLimit: limite,
      createdBy: String(raw.createdBy ?? "").trim() || null,
      audienceFilter: { base: "quente", avisoResposta: !pedeResposta },
    })
    .returning();

  return { ok: true, row };
}

/**
 * Congela a audiência na fila da campanha.
 *
 * Separado do envio de propósito: o operador monta a fila, VÊ quantos
 * são e só então decide disparar. E a fila é reavaliada no momento do
 * envio — alguém pode pedir opt-out entre uma coisa e outra.
 */
export async function montarFila(campaignId: number): Promise<{ ok: true; total: number } | CampanhaErro> {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!camp) return { error: "Campanha não encontrada", status: 404 };
  if (camp.status !== "rascunho") {
    return { error: "Só dá para montar a fila de uma campanha em rascunho", status: 409 };
  }

  const { elegiveis } = await audiencia();
  if (!elegiveis.length) {
    return { error: "Ninguém na base atende às regras de envio agora", status: 422 };
  }

  await db.delete(campaignTargets).where(eq(campaignTargets.campaignId, campaignId));

  /* Mais recentes primeiro: quem falou com você ontem tem muito mais
     chance de responder do que quem sumiu há 11 meses, e resposta é
     o sinal que protege a conta. */
  const ordenados = [...elegiveis].sort(
    (a, b) => (b.ultimaMensagem?.getTime() ?? 0) - (a.ultimaMensagem?.getTime() ?? 0)
  );

  await db.insert(campaignTargets).values(
    ordenados.map((e) => ({
      campaignId,
      customerId: e.customerId,
      phoneE164: e.phoneE164,
    }))
  ).onConflictDoNothing();

  await db
    .update(campaigns)
    .set({ totalTargets: ordenados.length, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  return { ok: true, total: ordenados.length };
}

/**
 * Revalida um destinatário no instante do envio.
 *
 * A fila pode ter sido montada há dias. Entre montar e enviar, a
 * pessoa pode ter pedido opt-out — e mandar mesmo assim seria
 * exatamente o que a LGPD proíbe.
 */
export async function podeEnviarAgora(
  customerId: number
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const [c] = await db
    .select({
      optOut: customers.whatsappOptOut,
      optIn: customers.marketingOptIn,
      fone: customers.phoneE164,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!c) return { ok: false, motivo: "cliente removido" };
  if (c.optOut) return { ok: false, motivo: "pediu para não receber" };
  if (!c.optIn) return { ok: false, motivo: "opt-in retirado" };
  if (!c.fone) return { ok: false, motivo: "sem telefone" };

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.customerId, customerId),
        eq(campaignTargets.status, "enviado"),
        gte(campaignTargets.sentAt, inicioMes)
      )
    );

  if (Number(n) >= MAX_POR_PESSOA_MES) {
    return { ok: false, motivo: `limite de ${MAX_POR_PESSOA_MES}/mês atingido` };
  }
  return { ok: true };
}

/**
 * O disjuntor.
 *
 * Numa base de 300, cada bloqueio vale 0,33%. Três já é 1%. Por isso
 * paramos cedo — e exigimos um mínimo de envios antes de julgar, para
 * não parar tudo por causa do primeiro contato mal-humorado.
 */
export async function verificarDisjuntor(
  campaignId: number
): Promise<{ pausar: boolean; taxa: number; motivo?: string }> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c) return { pausar: false, taxa: 0 };

  const enviados = c.sentCount ?? 0;
  const bloqueios = c.blockedCount ?? 0;
  if (enviados < MINIMO_PARA_DISJUNTOR) return { pausar: false, taxa: 0 };

  const taxa = bloqueios / enviados;
  if (taxa > LIMITE_BLOQUEIO) {
    const motivo =
      `${bloqueios} bloqueio(s) em ${enviados} envios (${(taxa * 100).toFixed(1)}%) — ` +
      `acima do limite de ${(LIMITE_BLOQUEIO * 100).toFixed(0)}%`;
    await db
      .update(campaigns)
      .set({ status: "pausada", pausedReason: motivo, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    return { pausar: true, taxa, motivo };
  }
  return { pausar: false, taxa };
}

/** Registra o resultado de um envio e reavalia o disjuntor. */
export async function registrarEnvio(
  campaignId: number,
  targetId: number,
  resultado: { ok: boolean; erro?: string; bloqueado?: boolean }
) {
  const status = resultado.ok ? "enviado" : resultado.bloqueado ? "bloqueado" : "falhou";

  await db
    .update(campaignTargets)
    .set({
      status,
      error: resultado.erro?.slice(0, 300) ?? null,
      sentAt: new Date(),
    })
    .where(eq(campaignTargets.id, targetId));

  await db
    .update(campaigns)
    .set({
      sentCount: resultado.ok ? sql`${campaigns.sentCount} + 1` : campaigns.sentCount,
      failedCount:
        !resultado.ok && !resultado.bloqueado
          ? sql`${campaigns.failedCount} + 1`
          : campaigns.failedCount,
      blockedCount: resultado.bloqueado
        ? sql`${campaigns.blockedCount} + 1`
        : campaigns.blockedCount,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  return verificarDisjuntor(campaignId);
}

/** Lista para a tela, com o resumo de cada campanha. */
export async function listarCampanhas() {
  return db.select().from(campaigns).orderBy(sql`${campaigns.createdAt} desc`).limit(50);
}

export async function campanhaComAlvos(id: number) {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!camp) return null;
  const alvos = await db
    .select({
      id: campaignTargets.id,
      customerId: campaignTargets.customerId,
      status: campaignTargets.status,
      skipReason: campaignTargets.skipReason,
      error: campaignTargets.error,
      sentAt: campaignTargets.sentAt,
      name: customers.name,
      phone: customers.whatsapp,
    })
    .from(campaignTargets)
    .leftJoin(customers, eq(customers.id, campaignTargets.customerId))
    .where(eq(campaignTargets.campaignId, id))
    .limit(500);
  return { campanha: camp, alvos };
}

/** Próximos da fila, respeitando o teto diário. */
export async function proximosDaFila(campaignId: number, quantos: number) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.campaignId, campaignId),
        inArray(campaignTargets.status, ["enviado", "falhou", "bloqueado"]),
        isNotNull(campaignTargets.sentAt),
        gte(campaignTargets.sentAt, hoje)
      )
    );

  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const teto = Math.min(camp?.dailyLimit ?? MAX_POR_DIA, MAX_POR_DIA);
  const resta = Math.max(0, teto - Number(n));
  if (resta === 0) return [];

  return db
    .select()
    .from(campaignTargets)
    .where(and(eq(campaignTargets.campaignId, campaignId), eq(campaignTargets.status, "fila")))
    .limit(Math.min(quantos, resta));
}
