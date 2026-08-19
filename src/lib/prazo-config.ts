import "server-only";

import { db } from "@/db";
import { products, settings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import {
  CONFIG_PADRAO,
  calcularPrazo,
  dataPorExtenso,
  prazoDoPedido,
  type ConfigPrazo,
  type PrazoProduto,
  type ResultadoPrazo,
} from "@/lib/prazo";

/** Lê o expediente configurado no Painel → Prazos & Expediente. */
export async function getConfigPrazo(): Promise<ConfigPrazo> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const dias = (map.get("prazo_dias_uteis") || "1,2,3,4,5")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const fechamentos = (map.get("prazo_fechamentos") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  const corte = (map.get("prazo_horario_corte") || "17:00").trim();

  const atendimento = (map.get("prazo_dias_atendimento") || "1,2,3,4,5,6")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const sabadoAte = (map.get("prazo_sabado_ate") ?? "13:00").trim();

  return {
    diasUteis: dias.length ? dias : CONFIG_PADRAO.diasUteis,
    horarioCorte: /^\d{1,2}:\d{2}$/.test(corte) ? corte : CONFIG_PADRAO.horarioCorte,
    fechamentos,
    usarFeriados: (map.get("prazo_usar_feriados") ?? "true") !== "false",
    diasAtendimento: atendimento.length ? atendimento : CONFIG_PADRAO.diasAtendimento,
    sabadoAte: /^\d{1,2}:\d{2}$/.test(sabadoAte) ? sabadoAte : "",
  };
}

/** De onde o relógio começa a correr. */
export type GatilhoPrazo = "arte_aprovada" | "pedido_aprovado" | "entrada_paga";

export async function getGatilhoPrazo(): Promise<GatilhoPrazo> {
  const rows = await db.select().from(settings);
  const v = rows.find((r) => r.key === "prazo_conta_de")?.value;
  return (["arte_aprovada", "pedido_aprovado", "entrada_paga"] as const).includes(
    v as GatilhoPrazo
  )
    ? (v as GatilhoPrazo)
    : "arte_aprovada";
}

export interface ItemComPrazo {
  productId?: number | null;
  quantity?: number;
}

export interface PrevisaoEntrega extends ResultadoPrazo {
  /** "sexta, 22/08" */
  porExtenso: string;
  /** "sábado, 23/08" quando a retirada de sábado está disponível. */
  retiradaSabadoPorExtenso: string | null;
  /** Quebra por etapa, para mostrar a conta ao cliente. */
  etapas: { criacao: number; producao: number; acabamento: number };
  /** Nome do produto que puxou o prazo — o gargalo. */
  gargalo: string | null;
}

/**
 * Previsão de entrega de um conjunto de itens.
 *
 * Itens sem produto cadastrado (linha livre digitada no orçamento) não
 * têm prazo conhecido: entram como zero em vez de chutar um número.
 * Melhor o operador ver "1 dia" e corrigir do que o sistema inventar
 * "5 dias" que ninguém combinou.
 */
export async function preverEntrega(
  itens: ItemComPrazo[],
  apartirDe: Date = new Date()
): Promise<PrevisaoEntrega> {
  const ids = itens
    .map((i) => i.productId)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const linhas = ids.length
    ? await db
        .select({
          id: products.id,
          name: products.name,
          criacao: products.leadTimeCreation,
          producao: products.leadTimeProduction,
          acabamento: products.leadTimeFinishing,
          serie: products.leadTimeSerial,
        })
        .from(products)
        .where(inArray(products.id, ids))
    : [];

  const porId = new Map(linhas.map((l) => [l.id, l]));

  const prazos: (PrazoProduto & { nome: string })[] = itens.map((i) => {
    const p = i.productId ? porId.get(i.productId) : undefined;
    return {
      nome: p?.name ?? "item avulso",
      diasCriacao: p?.criacao ?? 0,
      diasProducao: p?.producao ?? 0,
      diasAcabamento: p?.acabamento ?? 0,
      emSerie: p?.serie ?? false,
    };
  });

  const dias = prazoDoPedido(prazos);
  const cfg = await getConfigPrazo();
  const base = calcularPrazo(apartirDe, dias, cfg);

  /* O gargalo é o item que define o prazo. Saber o nome dele ajuda
     o operador a decidir se vale negociar ("tiro a peça 3D e entrego
     o resto amanhã"). */
  let gargalo: string | null = null;
  let maior = -1;
  for (const p of prazos) {
    const t = (p.diasCriacao || 0) + (p.diasProducao || 0) + (p.diasAcabamento || 0);
    if (t > maior) {
      maior = t;
      gargalo = p.nome;
    }
  }

  return {
    ...base,
    porExtenso: dataPorExtenso(base.data),
    retiradaSabadoPorExtenso: base.retiradaSabado ? dataPorExtenso(base.retiradaSabado) : null,
    etapas: {
      criacao: Math.max(0, ...prazos.map((p) => p.diasCriacao || 0)),
      producao: Math.max(0, ...prazos.map((p) => p.diasProducao || 0)),
      acabamento: Math.max(0, ...prazos.map((p) => p.diasAcabamento || 0)),
    },
    gargalo: prazos.length > 1 ? gargalo : null,
  };
}
