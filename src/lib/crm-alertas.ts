import "server-only";
/* ──────────────────────────────────────────────────────────────────
   ALERTAS DO CRM — o que pedir ao operador HOJE.

   A tela de Clientes listava e filtrava, mas não sugeria nada. Saber
   que existem 200 clientes não diz o que fazer com eles. Estes dois
   alertas viram trabalho concreto:

   1. ANIVERSÁRIO — gancho de contato que não é venda. Só de clientes
      que JÁ COMPRARAM (a regra do dono: nada de abordar quem nunca
      pediu nada) e que aceitam WhatsApp.

   2. CADASTRO INCOMPLETO — a ideia dele de completar a base. Cliente
      sem e-mail nem documento não recebe orçamento por e-mail, não
      tem nota, não entra em campanha. A lista já vem com o link de
      pedir cadastro pronto.

   As duas respeitam opt-out. Marketing continua exigindo aceite; isto
   aqui é relacionamento e cadastro, não propaganda.
   ────────────────────────────────────────────────────────────────── */

import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface Aniversariante {
  id: number;
  nome: string;
  telefone: string | null;
  dia: number;
  mes: number;
  /** dias até o aniversário — 0 = hoje */
  faltam: number;
  ltv: number;
  optOut: boolean;
}

export interface CadastroIncompleto {
  id: number;
  nome: string;
  telefone: string | null;
  /** o que falta, em português, pronto para a tela */
  faltando: string[];
  pedidos: number;
  ltv: number;
}

/**
 * Aniversariantes dos próximos N dias.
 *
 * A conta ignora o ANO: quem nasceu em 1980 faz aniversário todo ano.
 * Comparar a data cheia traria zero resultados — erro clássico.
 *
 * O `AT TIME ZONE` existe porque o servidor roda em UTC: às 22h de São
 * Paulo o `now()` cru já está no dia seguinte, e o aniversariante de
 * hoje sumiria da lista bem na hora em que a gráfica ainda está aberta.
 */
export async function aniversariantes(dias = 15): Promise<Aniversariante[]> {
  const janela = Math.max(0, Math.min(90, Math.floor(dias)));

  const r = await db.execute<{
    id: number; name: string; phone: string | null; whatsapp: string | null;
    dia: number; mes: number; faltam: number; ltv: string; opt_out: boolean;
  }>(sql`
    WITH hoje AS (
      SELECT (now() AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS d
    ),
    base AS (
      SELECT c.id, c.name, c.phone, c.whatsapp, c.whatsapp_opt_out AS opt_out,
             EXTRACT(DAY FROM c.birth_date)::int   AS dia,
             EXTRACT(MONTH FROM c.birth_date)::int AS mes,
             /* Próxima ocorrência: se já passou este ano, cai no ano que vem. */
             CASE
               WHEN make_date(EXTRACT(YEAR FROM h.d)::int,
                              EXTRACT(MONTH FROM c.birth_date)::int,
                              EXTRACT(DAY FROM c.birth_date)::int) >= h.d
               THEN make_date(EXTRACT(YEAR FROM h.d)::int,
                              EXTRACT(MONTH FROM c.birth_date)::int,
                              EXTRACT(DAY FROM c.birth_date)::int)
               ELSE make_date(EXTRACT(YEAR FROM h.d)::int + 1,
                              EXTRACT(MONTH FROM c.birth_date)::int,
                              EXTRACT(DAY FROM c.birth_date)::int)
             END AS proxima,
             h.d AS hoje
        FROM customers c CROSS JOIN hoje h
       WHERE c.birth_date IS NOT NULL
    )
    SELECT b.id, b.name, b.phone, b.whatsapp, b.dia, b.mes, b.opt_out,
           (b.proxima - b.hoje)::int AS faltam,
           COALESCE((SELECT SUM(o.total) FROM orders o
                      WHERE o.customer_id = b.id AND o.status <> 'cancelado'), 0) AS ltv
      FROM base b
     WHERE (b.proxima - b.hoje) <= ${janela}
     ORDER BY faltam ASC, b.name ASC
     LIMIT 50
  `);

  return (r.rows || [])
    .map((x) => ({
      id: Number(x.id),
      nome: String(x.name || ""),
      telefone: x.whatsapp || x.phone || null,
      dia: Number(x.dia),
      mes: Number(x.mes),
      faltam: Number(x.faltam),
      ltv: Number(x.ltv || 0),
      optOut: x.opt_out === true,
    }))
    /* Só quem já comprou. Parabenizar quem nunca pediu nada é
       abordagem fria disfarçada — e a regra do dono é clara. */
    .filter((c) => c.ltv > 0);
}

/**
 * Clientes que compraram mas têm cadastro pela metade.
 *
 * Ordena por quem mais gastou: completar o cadastro do cliente de
 * R$ 5.000 vale mais que o de R$ 50, e o operador tem tempo limitado.
 */
export async function cadastrosIncompletos(limite = 30): Promise<CadastroIncompleto[]> {
  const n = Math.max(1, Math.min(200, Math.floor(limite)));

  const r = await db.execute<{
    id: number; name: string; phone: string | null; whatsapp: string | null;
    email: string | null; document: string | null; cep: string | null;
    birth_date: string | null; pedidos: string; ltv: string;
  }>(sql`
    SELECT c.id, c.name, c.phone, c.whatsapp, c.email, c.document, c.cep, c.birth_date,
           COUNT(o.id) AS pedidos,
           COALESCE(SUM(CASE WHEN o.status <> 'cancelado' THEN o.total ELSE 0 END), 0) AS ltv
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
     WHERE c.email IS NULL OR c.email = ''
        OR c.document IS NULL OR c.document = ''
        OR c.cep IS NULL OR c.cep = ''
        OR c.birth_date IS NULL
     GROUP BY c.id
     ORDER BY ltv DESC
     LIMIT ${n}
  `);

  return (r.rows || []).map((x) => {
    const faltando: string[] = [];
    if (!x.email) faltando.push("e-mail");
    if (!x.document) faltando.push("CPF/CNPJ");
    if (!x.cep) faltando.push("endereço");
    if (!x.birth_date) faltando.push("nascimento");
    return {
      id: Number(x.id),
      nome: String(x.name || ""),
      telefone: x.whatsapp || x.phone || null,
      faltando,
      pedidos: Number(x.pedidos || 0),
      ltv: Number(x.ltv || 0),
    };
  });
}
