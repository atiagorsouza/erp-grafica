import "server-only";
/* ──────────────────────────────────────────────────────────────────
   COMISSÃO DE VENDEDOR

   Decisões do dono (22/08/2026):

   1. QUANDO CONTA: só quando o pedido fecha de verdade — entregue ou
      pago. Pedido em produção não gera comissão; cancelado não gera
      nunca. Pagar comissão de venda que voltou atrás é dinheiro que
      sai duas vezes.

   2. PERCENTUAL: um por vendedor (Tiago 3%, Maria 5%). Não varia por
      produto — ele preferiu o que dá para explicar em voz alta.

   3. BASE: sobre a MARGEM (preço − custo), não sobre o total. Vender
      com desconto pesado deixa de render a mesma comissão que vender
      no preço cheio, que é o incentivo certo.

   4. CUSTO: recalculado pelo custo ATUAL do produto, não congelado.
      Escolha dele, ciente do efeito: se o papel subir em outubro, a
      comissão de uma venda de agosto encolhe no extrato. Em troca,
      não há coluna nova em `orders` e o número sempre reflete o custo
      real de hoje.

   5. ITEM SEM PRODUTO CADASTRADO: linha digitada à mão ("serviço
      avulso", "urgência") não tem custo conhecido. Usa a margem
      padrão do painel (`comissao_margem_padrao`, 40% de fábrica) e o
      extrato MARCA a linha como estimada — o vendedor precisa saber
      qual número é conta e qual é chute.
   ────────────────────────────────────────────────────────────────── */

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, sellers, settings } from "@/db/schema";
import { round2, toNumber } from "@/lib/money";

/** Status de pedido que contam como fechado. */
const FECHADOS = ["concluido", "entregue"] as const;

export interface LinhaComissao {
  orderId: number;
  numero: string;
  cliente: string | null;
  fechadoEm: string;
  total: number;
  /** margem apurada do pedido (preço − custo) */
  margem: number;
  /** percentual aplicado, em % (3 = 3%) */
  taxa: number;
  comissao: number;
  /** true = alguma linha usou margem estimada por falta de produto */
  estimado: boolean;
}

export interface ExtratoVendedor {
  seller: { id: number; nome: string; taxa: number };
  de: string;
  ate: string;
  linhas: LinhaComissao[];
  totalVendido: number;
  totalMargem: number;
  totalComissao: number;
  /** quantas linhas usaram estimativa — para o aviso na tela */
  pedidosEstimados: number;
}

/** Margem padrão para item sem produto cadastrado (fração 0-1). */
async function margemPadrao(): Promise<number> {
  const [linha] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "comissao_margem_padrao"))
    .limit(1);
  const n = Number(String(linha?.value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0.4;
  /* Aceita "40" e "0.4": quem digita no painel pensa em porcentagem. */
  return n > 1 ? Math.min(n, 99) / 100 : n;
}

interface ItemPedido {
  productId?: number | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  total?: number | string | null;
}

/**
 * Margem de um pedido: soma item a item.
 *
 * Frete NÃO entra: é repasse de transportadora, não venda. Desconto
 * entra, porque sai da margem — vender a R$ 80 o que custa R$ 60
 * rende menos comissão que vender a R$ 100, e é isso que se quer
 * ensinar.
 */
function margemDoPedido(
  itens: ItemPedido[],
  custoPorProduto: Map<number, number>,
  padrao: number,
  descontoTotal: number,
  subtotal: number
): { margem: number; estimado: boolean } {
  let margem = 0;
  let estimado = false;

  for (const it of itens) {
    const qtd = Math.max(0, toNumber(it.quantity, 1));
    const bruto = toNumber(it.total, toNumber(it.unitPrice, 0) * qtd);
    const pid = Number(it.productId || 0);
    const custoUnit = pid > 0 ? custoPorProduto.get(pid) : undefined;

    if (custoUnit === undefined) {
      /* Sem produto vinculado: não dá para saber o custo. */
      margem += bruto * padrao;
      estimado = true;
    } else {
      margem += bruto - custoUnit * qtd;
    }
  }

  /* O desconto foi dado sobre o pedido inteiro; rateia proporcional
     para não punir nem premiar item nenhum em particular. */
  if (descontoTotal > 0 && subtotal > 0) {
    margem -= descontoTotal;
  }

  return { margem: Math.max(0, round2(margem)), estimado };
}

/**
 * Extrato de um vendedor no período.
 *
 * `de` e `ate` no formato AAAA-MM-DD, no fuso de São Paulo — o
 * servidor roda em UTC e um fechamento das 22h viraria o dia seguinte
 * se comparado direto.
 */
export async function extratoDoVendedor(
  sellerId: number,
  de: string,
  ate: string
): Promise<ExtratoVendedor | null> {
  const id = Number(sellerId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [vend] = await db.select().from(sellers).where(eq(sellers.id, id)).limit(1);
  if (!vend) return null;

  const taxa = toNumber(vend.commissionRate, 0);

  const linhasPedido = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      items: orders.items,
      subtotal: orders.subtotal,
      discount: orders.discount,
      total: orders.total,
      updatedAt: orders.updatedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.sellerId, id),
        inArray(orders.status, [...FECHADOS]),
        sql`(${orders.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${de}::date AND ${ate}::date`
      )
    );

  /* Um SELECT só para todos os custos: uma consulta por item deixaria
     o extrato lento justamente para quem mais vende. */
  const idsProduto = new Set<number>();
  for (const p of linhasPedido) {
    for (const it of (p.items as ItemPedido[]) || []) {
      const pid = Number(it.productId || 0);
      if (pid > 0) idsProduto.add(pid);
    }
  }

  const custoPorProduto = new Map<number, number>();
  if (idsProduto.size) {
    const custos = await db
      /* `costSnapshot` é o custo apurado pelo motor de precificação —
         o mesmo número que alimenta o preço de venda. */
      .select({ id: products.id, baseCost: products.costSnapshot })
      .from(products)
      .where(inArray(products.id, [...idsProduto]));
    for (const c of custos) custoPorProduto.set(c.id, toNumber(c.baseCost, 0));
  }

  const padrao = await margemPadrao();

  const linhas: LinhaComissao[] = linhasPedido.map((p) => {
    const { margem, estimado } = margemDoPedido(
      (p.items as ItemPedido[]) || [],
      custoPorProduto,
      padrao,
      toNumber(p.discount, 0),
      toNumber(p.subtotal, 0)
    );
    return {
      orderId: p.id,
      numero: String(p.number || ""),
      cliente: null,
      fechadoEm: new Date(p.updatedAt || p.createdAt).toISOString(),
      total: round2(toNumber(p.total, 0)),
      margem,
      taxa,
      comissao: round2((margem * taxa) / 100),
      estimado,
    };
  });

  linhas.sort((a, b) => b.fechadoEm.localeCompare(a.fechadoEm));

  return {
    seller: { id: vend.id, nome: String(vend.nickname || vend.name), taxa },
    de,
    ate,
    linhas,
    totalVendido: round2(linhas.reduce((s, l) => s + l.total, 0)),
    totalMargem: round2(linhas.reduce((s, l) => s + l.margem, 0)),
    totalComissao: round2(linhas.reduce((s, l) => s + l.comissao, 0)),
    pedidosEstimados: linhas.filter((l) => l.estimado).length,
  };
}

/** Resumo de todos os vendedores no período — a visão do dono. */
export async function resumoDeComissoes(de: string, ate: string) {
  const ativos = await db
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.active, true));

  const extratos = await Promise.all(
    ativos.map((v) => extratoDoVendedor(v.id, de, ate))
  );

  const linhas = extratos
    .filter((e): e is ExtratoVendedor => e !== null)
    .map((e) => ({
      sellerId: e.seller.id,
      nome: e.seller.nome,
      taxa: e.seller.taxa,
      pedidos: e.linhas.length,
      vendido: e.totalVendido,
      margem: e.totalMargem,
      comissao: e.totalComissao,
      estimados: e.pedidosEstimados,
    }))
    .sort((a, b) => b.comissao - a.comissao);

  return {
    de,
    ate,
    linhas,
    totalVendido: round2(linhas.reduce((s, l) => s + l.vendido, 0)),
    totalComissao: round2(linhas.reduce((s, l) => s + l.comissao, 0)),
  };
}

/** Lista para os seletores de vendedor (PDV, orçamento, pedido). */
export async function listarVendedores(somenteAtivos = true) {
  const q = db
    .select({
      id: sellers.id,
      name: sellers.name,
      nickname: sellers.nickname,
      commissionRate: sellers.commissionRate,
      active: sellers.active,
      document: sellers.document,
      phone: sellers.phone,
      email: sellers.email,
      notes: sellers.notes,
    })
    .from(sellers);

  const linhas = somenteAtivos
    ? await q.where(eq(sellers.active, true))
    : await q;

  return linhas
    .map((v) => ({ ...v, commissionRate: toNumber(v.commissionRate, 0) }))
    .sort((a, b) => String(a.nickname || a.name).localeCompare(String(b.nickname || b.name), "pt-BR"));
}

/** Vendedores que já aparecem em pedidos mas não têm cadastro. */
export async function nomesSoltos(): Promise<string[]> {
  const r = await db
    .select({ nome: orders.sellerName })
    .from(orders)
    .where(and(isNotNull(orders.sellerName), sql`${orders.sellerId} IS NULL`))
    .groupBy(orders.sellerName);

  return r
    .map((x) => String(x.nome || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
