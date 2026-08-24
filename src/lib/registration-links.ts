import "server-only";

/* ──────────────────────────────────────────────────────────────────
   LINKS DE CADASTRO PÚBLICO

   Fluxo desenhado com o usuário:
     1. operador clica "Pedir cadastro por WhatsApp" na ficha
     2. sistema gera link único, válido 7 dias, uso único
     3. o bot só ENTREGA o link — não decide mandar (bot é auxiliar)
     4. cliente abre, confere nome/telefone já preenchidos, completa
     5. o MESMO cadastro é atualizado — nunca cria duplicado

   Regras que moram aqui e não na rota:
     - token é segredo, comparado em tempo constante não é necessário
       (é lookup por índice único, não HMAC), mas nunca é logado;
     - expiração é verificada na LEITURA, não por cron: um link vencido
       que ninguém abriu continua "pendente" no banco até alguém tocar
       nele. Marcamos como expirado de forma preguiçosa.
   ────────────────────────────────────────────────────────────────── */

import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, registrationLinks, settings } from "@/db/schema";

/** Dias de validade — valor de reserva. Curto o bastante para não
 *  virar porta aberta, longo o bastante para o cliente responder na
 *  segunda-feira.
 *
 *  Só vale quando o painel não tem nada gravado: o número real vem de
 *  `getValidadeDias()`. Deixado exportado porque a página pública o usa
 *  como texto de apoio antes de consultar o banco. */
export const VALIDADE_DIAS = 7;

/** Quanto tempo o link de cadastro fica de pé, conforme o painel.
 *
 *  Era constante no código: mudar exigia programador. Sete dias é
 *  pouco para quem manda orçamento na sexta e só é respondido depois
 *  do fim de semana seguinte — e era exatamente a queixa do dono.
 *
 *  Limites: 1 a 90 dias. Abaixo de 1 o link nasce morto; acima de 90
 *  deixa de ser link de cadastro e vira porta aberta. Valor inválido
 *  ou em branco cai no padrão em vez de derrubar o cadastro. */
export async function getValidadeDias(): Promise<number> {
  try {
    const [linha] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "cadastro_link_validade_dias"))
      .limit(1);
    const n = Number(String(linha?.value ?? "").trim());
    if (!Number.isFinite(n)) return VALIDADE_DIAS;
    return Math.max(1, Math.min(90, Math.floor(n)));
  } catch {
    return VALIDADE_DIAS;
  }
}

/* Base58: alfabeto sem 0/O/I/l. O link é lido em voz alta no telefone
   com alguma frequência — ambiguidade visual custa atendimento. */
const ALFABETO = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function gerarToken(tamanho = 22): string {
  const bytes = randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i++) saida += ALFABETO[bytes[i] % ALFABETO.length];
  return saida;
}

export type LinkErro = { error: string; status: number };

const ATIVOS = ["pendente", "aberto"] as const;

/**
 * Cria (ou substitui) o link de cadastro de um cliente.
 *
 * Reenviar é a operação mais comum — o cliente perdeu a mensagem. Por
 * isso não devolvemos erro quando já existe link vivo: revogamos o
 * antigo e entregamos um novo. Dois links válidos ao mesmo tempo
 * confundiriam o cliente e o índice parcial do schema proíbe.
 */
export async function criarLinkCadastro(
  customerId: number,
  opts: { createdBy?: string; sentVia?: string } = {}
) {
  const [cliente] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, whatsapp: customers.whatsapp })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!cliente) return { error: "Cliente não encontrado", status: 404 } satisfies LinkErro;

  return db.transaction(async (tx) => {
    await tx
      .update(registrationLinks)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(
        and(
          eq(registrationLinks.customerId, customerId),
          inArray(registrationLinks.status, [...ATIVOS])
        )
      );

    const dias = await getValidadeDias();
    const expiresAt = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    const [row] = await tx
      .insert(registrationLinks)
      .values({
        token: gerarToken(),
        customerId,
        snapshotName: cliente.name,
        snapshotPhone: cliente.whatsapp || cliente.phone || null,
        createdBy: opts.createdBy || null,
        sentVia: opts.sentVia || null,
        expiresAt,
      })
      .returning();

    return { ok: true as const, row };
  });
}

/** Marca envio efetivado (o WhatsApp aceitou a mensagem). */
export async function marcarEnviado(id: number, via: string) {
  const [row] = await db
    .update(registrationLinks)
    .set({ sentVia: via, sentAt: new Date(), updatedAt: new Date() })
    .where(eq(registrationLinks.id, id))
    .returning();
  return row || null;
}

export async function cancelarLink(id: number) {
  const [row] = await db
    .update(registrationLinks)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(eq(registrationLinks.id, id))
    .returning();
  return row || null;
}

export interface LinkResolvido {
  link: typeof registrationLinks.$inferSelect;
  cliente: typeof customers.$inferSelect;
}

/**
 * Resolve o token para uso PÚBLICO. Devolve erro genérico em todos os
 * casos de recusa — quem tenta adivinhar token não deve descobrir se
 * errou o token, se expirou ou se já foi usado.
 */
export async function resolverToken(
  token: string
): Promise<LinkResolvido | LinkErro> {
  const limpo = String(token || "").trim();
  if (!limpo || limpo.length > 64) {
    return { error: "Link inválido ou expirado", status: 404 };
  }

  const [row] = await db
    .select()
    .from(registrationLinks)
    .where(eq(registrationLinks.token, limpo))
    .limit(1);

  if (!row) return { error: "Link inválido ou expirado", status: 404 };

  if (row.status === "concluido") {
    return { error: "Este cadastro já foi concluído", status: 410 };
  }
  if (row.status === "cancelado") {
    return { error: "Link inválido ou expirado", status: 404 };
  }

  /* Expiração preguiçosa: nada de cron para uma tabela que cresce
     algumas linhas por dia. */
  if (row.expiresAt.getTime() < Date.now()) {
    if (row.status !== "expirado") {
      await db
        .update(registrationLinks)
        .set({ status: "expirado", updatedAt: new Date() })
        .where(eq(registrationLinks.id, row.id));
    }
    return { error: "Este link expirou. Peça um novo à gráfica.", status: 410 };
  }
  if (row.status === "expirado") {
    return { error: "Este link expirou. Peça um novo à gráfica.", status: 410 };
  }

  const [cliente] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1);
  if (!cliente) return { error: "Link inválido ou expirado", status: 404 };

  return { link: row, cliente };
}

/** Registra a primeira abertura. Silencioso: falhar aqui não pode
 *  impedir o cliente de ver o formulário. */
export async function registrarAbertura(id: number, ip?: string, userAgent?: string) {
  try {
    await db
      .update(registrationLinks)
      .set({
        status: sql`case when ${registrationLinks.status} = 'pendente' then 'aberto'::registration_link_status else ${registrationLinks.status} end`,
        openedAt: sql`coalesce(${registrationLinks.openedAt}, now())`,
        ip: ip || null,
        userAgent: userAgent ? userAgent.slice(0, 300) : null,
        updatedAt: new Date(),
      })
      .where(eq(registrationLinks.id, id));
  } catch (e) {
    console.error("[registration-links] abertura", e);
  }
}

/** Queima o link após o envio bem-sucedido do formulário. */
export async function concluirLink(id: number, ip?: string, userAgent?: string) {
  await db
    .update(registrationLinks)
    .set({
      status: "concluido",
      completedAt: new Date(),
      ip: ip || null,
      userAgent: userAgent ? userAgent.slice(0, 300) : null,
      updatedAt: new Date(),
    })
    .where(eq(registrationLinks.id, id));
}

/** Links vivos, para o CRM mostrar "enviado, ainda não abriu". */
export async function linksDoCliente(customerId: number) {
  return db
    .select()
    .from(registrationLinks)
    .where(eq(registrationLinks.customerId, customerId))
    .orderBy(sql`${registrationLinks.createdAt} desc`)
    .limit(5);
}

/** IP do cliente atrás do Cloudflare Tunnel / proxy. */
export function ipDaRequisicao(req: Request): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "";
}
