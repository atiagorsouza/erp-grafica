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

/** Histórico de uma conversa. */
export async function mensagensDe(phoneE164: string, limite = 200): Promise<MensagemChat[]> {
  const fone = String(phoneE164 || "").replace(/\D/g, "");
  if (!fone) return [];

  return tolerante(async () => {
    const r = await db.execute<{
      id: number; direcao: string; texto: string | null; criado_em: Date;
    }>(sql`
      SELECT id, direcao, texto, criado_em
        FROM whatsapp_mensagens
       WHERE phone_e164 = ${fone}
       ORDER BY criado_em DESC
       LIMIT ${limite}
    `);

    /* Vem do banco em ordem decrescente (para o LIMIT pegar as mais
       novas) e é invertido aqui: a tela lê de cima para baixo. */
    return (r.rows || [])
      .map((x) => ({
        id: Number(x.id),
        direcao: (x.direcao === "enviada" ? "enviada" : "recebida") as "enviada" | "recebida",
        texto: String(x.texto || ""),
        criadoEm: new Date(x.criado_em).toISOString(),
      }))
      .reverse();
  }, []);
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
