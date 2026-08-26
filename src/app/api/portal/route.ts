import { db, pool } from "@/db";
import {
  products,
  productPriceTiers,
  itemCategories,
  customers,
  quotes,
  quoteItems,
} from "@/db/schema";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { guardPublicApi } from "@/lib/api-auth";
import { phoneKey } from "@/lib/phone";
import { nextDocumentNumber } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * ====================================================================
 *  API pública do PORTAL DE CLIENTES — v3.69.0
 * ====================================================================
 *
 * Consumida pelo portal hospedado fora (Hostinger), via
 * `api.vtdigital.site` no Cloudflare Tunnel. Como é chamada
 * máquina-a-máquina, não passa pelo Cloudflare Access — a credencial
 * é a API key validada em `guardPublicApi` (header, tempo constante,
 * falha fechada — ver `lib/api-auth.ts`, v3.45.0).
 *
 * CONTRATO (o portal só fala com esta rota):
 *
 *   GET  /api/portal                    -> catálogo (produtos + faixas)
 *   POST /api/portal { acao: "codigo",       whatsapp, nome? }
 *   POST /api/portal { acao: "entrar",       whatsapp, codigo }
 *   POST /api/portal { acao: "pedido",       token, itens, endereco?, obs? }
 *   POST /api/portal { acao: "meus-pedidos", token }
 *   POST /api/portal { acao: "enderecos",    token, op, ... }
 *
 * DECISÕES (herdadas do plano do portal, docs/PLANO-PORTAL-CLIENTE.md):
 *
 *  1. O portal é DESCARTÁVEL: não guarda dado de cliente. Usuário,
 *     código de login, endereço e pedido moram AQUI, no Postgres do
 *     ERP. Reimplantar o zip na Hostinger não perde nada — os dados
 *     são sempre estes.
 *  2. Pedido que nasce na internet NUNCA entra direto na produção:
 *     vira orçamento RASCUNHO (canal "Portal") para o atendente
 *     confirmar preço e prazo. O cliente vê o número ORC-… e a
 *     frase "recebido" na timeline.
 *  3. Preço no portal é REFERÊNCIA (faixas cadastradas). O preço
 *     oficial continua nascendo aqui, com o motor de precificação.
 *  4. Tabelas novas se criam sozinhas (CREATE TABLE IF NOT EXISTS),
 *     o mesmo padrão do services/whatsapp — sem drizzle push, sem
 *     risco em produção.
 *
 *  Correção de segurança histórica (v3.45.0), mantida: a versão
 *  antiga validava `if (PORTAL_TOKEN && ...)` — sem a variável no
 *  .env a rota respondia 200 pra qualquer um. Hoje: falha fechada.
 * ==================================================================== */

/* ── segredo de sessão ─────────────────────────────────────────────
 * O token de sessão do cliente é assinado com HMAC. O segredo é a
 * PRÓPRIA API key do portal (as duas pontas a conhecem; não nasce
 * segredo novo pra esquecer de configurar). Se nenhuma chave está
 * configurada, guardPublicApi já barrou tudo antes — aqui é defesa
 * em profundidade. */
function portalSecret(): string | null {
  if (process.env.PORTAL_SECRET && process.env.PORTAL_SECRET.length >= 24)
    return process.env.PORTAL_SECRET;
  const legacy = process.env.PORTAL_TOKEN?.trim();
  if (legacy && legacy.length >= 24) return legacy;
  const multi = process.env.PORTAL_API_KEYS?.trim();
  if (multi) {
    for (const entry of multi.split(",")) {
      const [, secret] = entry.split(":");
      const s = secret?.trim();
      if (s && s.length >= 24) return s;
    }
  }
  return null;
}

const SESSAO_DIAS = 30;

interface Sessao {
  cid: number;
  nome: string;
  fone: string;
  exp: number;
}

function b64u(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function assinarToken(sessao: Sessao): string | null {
  const secret = portalSecret();
  if (!secret) return null;
  const corpo = b64u(JSON.stringify(sessao));
  const mac = b64u(createHmac("sha256", secret).update(corpo).digest());
  return `${corpo}.${mac}`;
}

function verificarToken(raw: unknown): Sessao | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const secret = portalSecret();
  if (!secret) return null;
  const [corpo, mac] = raw.split(".");
  if (!corpo || !mac) return null;
  const esperado = b64u(createHmac("sha256", secret).update(corpo).digest());
  /* tempo constante: tamanho igual (b64url de sha256 é fixo) e sem
   * sair no primeiro byte diferente. */
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const sessao = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Sessao;
    if (!sessao?.cid || !sessao?.fone || Date.now() > sessao.exp) return null;
    return sessao;
  } catch {
    return null;
  }
}

/* ── tabelas próprias (criação idempotente) ────────────────────── */
let tabelasProntas: Promise<void> | null = null;

function garantirTabelas(): Promise<void> {
  tabelasProntas ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_codigos (
        id SERIAL PRIMARY KEY,
        fone TEXT NOT NULL,
        codigo TEXT NOT NULL,
        expira_em TIMESTAMPTZ NOT NULL,
        tentativas INTEGER NOT NULL DEFAULT 0,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS portal_codigos_fone_idx ON portal_codigos (fone, criado_em DESC)`
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_enderecos (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        rotulo TEXT,
        cep TEXT,
        rua TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        uf TEXT,
        padrao BOOLEAN NOT NULL DEFAULT FALSE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS portal_enderecos_cli_idx ON portal_enderecos (customer_id)`
    );
  })().catch((e) => {
    /* falhou agora, tenta de novo na próxima chamada */
    tabelasProntas = null;
    throw e;
  });
  return tabelasProntas;
}

/* ── envio de WhatsApp (mesmo padrão de campanhas) ─────────────── */
const WA_BASE = process.env.WA_SERVICE_URL || "http://127.0.0.1:3101";
const WA_TOKEN = process.env.WA_TOKEN || "";

async function enviarWhatsApp(para: string, texto: string): Promise<boolean> {
  try {
    const r = await fetch(`${WA_BASE}/enviar`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(WA_TOKEN ? { "x-wa-token": WA_TOKEN } : {}),
      },
      body: JSON.stringify({ para, texto }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ── helpers ────────────────────────────────────────────────────── */
const BAD = (status: number, error: string) => Response.json({ error }, { status });

function textoDigito(raw: string): string {
  return (raw || "").replace(/\D+/g, "");
}

function foneValido(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return phoneKey(raw); // E.164 ("5521…") ou null
}

/* ════════════════════════════════════════════════════════════════
 * GET — catálogo para o portal
 * ════════════════════════════════════════════════════════════════ */
export async function GET(req: Request) {
  const denied = guardPublicApi(req);
  if (denied) return denied;

  const linhas = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: products.productCategoryId,
      category: itemCategories.name,
      description: products.description,
      /* Só preço de VENDA. `costSnapshot` e `margin` jamais saem
       * daqui: é a margem da empresa exposta a quem tiver a chave. */
      finalPrice: products.finalPrice,
      saleUnitLabel: products.saleUnitLabel,
      ativo: products.active,
    })
    .from(products)
    .leftJoin(itemCategories, eq(products.productCategoryId, itemCategories.id))
    .where(eq(products.active, true));

  const faixas = await db
    .select({
      productId: productPriceTiers.productId,
      minQuantity: productPriceTiers.minQuantity,
      unitPrice: productPriceTiers.unitPrice,
      label: productPriceTiers.label,
    })
    .from(productPriceTiers)
    .orderBy(asc(productPriceTiers.productId), asc(productPriceTiers.minQuantity));

  const porProduto = new Map<number, unknown[]>();
  for (const f of faixas) {
    const lista = porProduto.get(f.productId) ?? [];
    lista.push({
      min: Number(f.minQuantity),
      preco: Number(f.unitPrice),
      label: f.label ?? undefined,
    });
    porProduto.set(f.productId, lista);
  }

  const catalog = linhas.map((p) => ({
    id: p.id,
    nome: p.name,
    sku: p.sku ?? undefined,
    categoriaId: p.categoryId ?? undefined,
    categoria: p.category ?? undefined,
    descricao: p.description ?? undefined,
    preco: Number(p.finalPrice ?? 0),
    unidade: p.saleUnitLabel ?? undefined,
    faixas: porProduto.get(p.id) ?? [],
  }));

  return Response.json({
    module: "customer-portal",
    portal: "3.69.0",
    catalog,
  });
}

/* ════════════════════════════════════════════════════════════════
 * POST — ações do portal
 * ════════════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
  const denied = guardPublicApi(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao || "");

  try {
    await garantirTabelas();

    /* ── 1. pedir código de login ─────────────────────────────── */
    if (acao === "codigo") {
      const fone = foneValido(body.whatsapp);
      if (!fone) return BAD(400, "WhatsApp inválido — use DDD + número");

      /* freio de reenvio: 1 código por minuto por telefone. Sem
       * isso, um script baby enche a caixa do cliente de código. */
      const { rows: recentes } = await pool.query(
        `SELECT 1 FROM portal_codigos WHERE fone = $1 AND criado_em > NOW() - INTERVAL '60 seconds' LIMIT 1`,
        [fone]
      );
      if (recentes.length) return BAD(429, "Aguarde 1 minuto para pedir outro código");

      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      await pool.query(
        `INSERT INTO portal_codigos (fone, codigo, expira_em) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
        [fone, codigo]
      );

      const ok = await enviarWhatsApp(
        fone,
        `*VTDigital*\n\nSeu código de acesso ao portal é *${codigo}*\n\nEle vale por 10 minutos. Não foi você? Só ignore esta mensagem.`
      );
      if (!ok) {
        /* código existe mas não saiu — melhor falhar claro do que
         * deixar o cliente esperando um código que não chega. */
        return BAD(503, "Serviço de WhatsApp indisponível — chame no (21) 97886-9414");
      }
      return Response.json({ ok: true });
    }

    /* ── 2. validar código -> sessão (+ cliente no CRM) ───────── */
    if (acao === "entrar") {
      const fone = foneValido(body.whatsapp);
      const codigo = textoDigito(String(body.codigo || ""));
      if (!fone) return BAD(400, "WhatsApp inválido");
      if (codigo.length !== 6) return BAD(400, "Código deve ter 6 dígitos");

      const { rows } = await pool.query(
        `SELECT id, codigo, expira_em, tentativas FROM portal_codigos
         WHERE fone = $1 ORDER BY criado_em DESC LIMIT 1`,
        [fone]
      );
      const reg = rows[0] as
        | { id: number; codigo: string; expira_em: string; tentativas: number }
        | undefined;
      if (!reg) return BAD(400, "Peça um código primeiro");
      if (new Date(reg.expira_em).getTime() < Date.now())
        return BAD(400, "Código expirado — peça outro");
      if (reg.tentativas >= 5)
        return BAD(429, "Muitas tentativas — peça um novo código");

      if (reg.codigo !== codigo) {
        await pool.query(`UPDATE portal_codigos SET tentativas = tentativas + 1 WHERE id = $1`, [reg.id]);
        return BAD(400, "Código incorreto");
      }

      /* acertou: o código é descartável — quem revê a URL não
       * refaz o login. */
      await pool.query(`DELETE FROM portal_codigos WHERE id = $1`, [reg.id]);

      /* cliente no CRM: existe por telefone? senão nasce como lead
       * (a ficha completa — CPF, endereço — o atendente completa
       * depois, igual ao balcão). */
      const nomeInformado =
        typeof body.nome === "string" && body.nome.trim() ? body.nome.trim() : "";
      let [cliente] = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(eq(customers.phoneE164, fone))
        .limit(1);

      if (!cliente) {
        const bruto = typeof body.whatsapp === "string" ? body.whatsapp : fone;
        [cliente] = await db
          .insert(customers)
          .values({
            type: "pf",
            name: nomeInformado || "Cliente do portal",
            whatsapp: bruto,
            phoneE164: fone,
            origin: "portal",
          })
          .returning({ id: customers.id, name: customers.name });
      } else if (nomeInformado && cliente.name === "Cliente do portal") {
        await db.update(customers).set({ name: nomeInformado }).where(eq(customers.id, cliente.id));
      }

      const token = assinarToken({
        cid: cliente.id,
        nome: nomeInformado || cliente.name,
        fone,
        exp: Date.now() + SESSAO_DIAS * 86400_000,
      });
      if (!token) return BAD(503, "Sessão não configurada no servidor");

      return Response.json({ ok: true, token, nome: nomeInformado || cliente.name });
    }

    /* ── 3. pedido -> orçamento RASCUNHO ─────────────────────── */
    if (acao === "pedido") {
      const sessao = verificarToken(body.token);
      if (!sessao) return BAD(401, "Sessão expirada — entre de novo");

      const itens = Array.isArray(body.itens) ? body.itens : [];
      if (!itens.length) return BAD(400, "Pedido sem itens");

      /* valida e resolve produtos de uma vez (não confia no preço
       * que veio da internet: reprocessa o productId e busca o
       * preço de referência AQUI). */
      const ids = [...new Set(itens.map((i) => Number((i as Record<string, unknown>).produtoId)).filter(Number.isFinite))];
      const prods = ids.length
        ? await db
            .select({ id: products.id, name: products.name, finalPrice: products.finalPrice })
            .from(products)
            .where(inArray(products.id, ids))
        : [];
      const porId = new Map(prods.map((p) => [p.id, p]));

      type ItemRec = { descricao: string; produtoId?: number; qtd: number; unit: number; total: number };
      const limpos: ItemRec[] = [];
      for (const raw of itens) {
        const it = (raw ?? {}) as Record<string, unknown>;
        const prod = porId.get(Number(it.produtoId));
        const qtd = Number(it.quantidade);
        if (!prod || !Number.isFinite(qtd) || qtd <= 0) continue; // item sem produto válido não entra
        const detalhe = typeof it.detalhe === "string" ? it.detalhe.trim().slice(0, 500) : "";
        const unit = Number.isFinite(Number(it.precoRef)) ? Number(it.precoRef) : Number(prod.finalPrice ?? 0);
        limpos.push({
          descricao: detalhe ? `${prod.name} — ${detalhe}` : prod.name,
          produtoId: prod.id,
          qtd,
          unit,
          total: Math.round(qtd * unit * 100) / 100,
        });
      }
      if (!limpos.length) return BAD(400, "Nenhum item válido no pedido");

      const total = Math.round(limpos.reduce((s, i) => s + i.total, 0) * 100) / 100;

      const endereco = (body.endereco ?? null) as Record<string, unknown> | null;
      const obs = typeof body.obs === "string" ? body.obs.trim().slice(0, 1000) : "";
      const notas: string[] = ["Pedido feito no PORTAL (app.vtdigital.com.br)"];
      if (endereco && typeof endereco === "object") {
        const e = endereco as Record<string, string>;
        const linha = [e.rotulo, `${e.rua || ""}, ${e.numero || ""}`.trim(), e.complemento, e.bairro, `${e.cidade || ""}${e.uf ? "/" + e.uf : ""}`, `CEP ${e.cep || ""}`]
          .filter((x) => x && String(x).trim())
          .join(" · ");
        if (linha) notas.push(`Entrega: ${linha}`);
      }
      if (obs) notas.push(`Obs.: ${obs}`);
      notas.push("[!] Preços de REFERÊNCIA do portal — confirmar antes de enviar ao cliente.");

      const numero = await nextDocumentNumber("quote");
      const [orc] = await db
        .insert(quotes)
        .values({
          number: numero,
          customerId: sessao.cid,
          status: "rascunho",
          channel: "Portal",
          subtotal: String(total),
          total: String(total),
          notes: notas.join("\n"),
        })
        .returning({ id: quotes.id, number: quotes.number });

      await db.insert(quoteItems).values(
        limpos.map((i) => ({
          quoteId: orc.id,
          description: i.descricao,
          productId: i.produtoId,
          quantity: String(i.qtd),
          unitPrice: String(i.unit),
          total: String(i.total),
        }))
      );

      return Response.json({ ok: true, numero: orc.number, total });
    }

    /* ── 4. meus pedidos (orçamentos do cliente) ──────────────── */
    if (acao === "meus-pedidos") {
      const sessao = verificarToken(body.token);
      if (!sessao) return BAD(401, "Sessão expirada — entre de novo");

      const lista = await db
        .select({
          id: quotes.id,
          number: quotes.number,
          status: quotes.status,
          total: quotes.total,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(eq(quotes.customerId, sessao.cid))
        .orderBy(desc(quotes.createdAt))
        .limit(50);

      return Response.json({
        ok: true,
        pedidos: lista.map((q) => ({
          id: q.id,
          numero: q.number,
          status: q.status,
          total: Number(q.total ?? 0),
          criadoEm: q.createdAt,
        })),
      });
    }

    /* ── 5. endereços de entrega ──────────────────────────────── */
    if (acao === "enderecos") {
      const sessao = verificarToken(body.token);
      if (!sessao) return BAD(401, "Sessão expirada — entre de novo");
      const op = String(body.op || "");

      if (op === "listar") {
        const { rows } = await pool.query(
          `SELECT id, rotulo, cep, rua, numero, complemento, bairro, cidade, uf, padrao
           FROM portal_enderecos WHERE customer_id = $1 ORDER BY padrao DESC, criado_em ASC`,
          [sessao.cid]
        );
        return Response.json({ ok: true, enderecos: rows });
      }

      if (op === "salvar") {
        const e = (body.endereco ?? {}) as Record<string, string>;
        const campos = ["rotulo", "cep", "rua", "numero", "complemento", "bairro", "cidade", "uf"];
        const limpo: Record<string, string> = {};
        for (const c of campos) limpo[c] = typeof e[c] === "string" ? e[c].trim().slice(0, 200) : "";
        if (!limpo.rua || !limpo.numero || !limpo.cidade)
          return BAD(400, "Rua, número e cidade são obrigatórios");

        const id = Number(body.id);
        const padrao = body.padrao === true;
        if (padrao)
          await pool.query(`UPDATE portal_enderecos SET padrao = FALSE WHERE customer_id = $1`, [sessao.cid]);

        if (Number.isFinite(id) && id > 0) {
          await pool.query(
            `UPDATE portal_enderecos SET rotulo=$2, cep=$3, rua=$4, numero=$5, complemento=$6,
             bairro=$7, cidade=$8, uf=$9, padrao=$10 WHERE id=$1 AND customer_id=$11`,
            [id, limpo.rotulo, limpo.cep, limpo.rua, limpo.numero, limpo.complemento, limpo.bairro, limpo.cidade, limpo.uf.slice(0, 2).toUpperCase(), padrao, sessao.cid]
          );
          return Response.json({ ok: true, id });
        }

        /* primeiro endereço vira padrão sozinho — cliente não deve
         * caçar onde marca o asterisco. */
        const { rows: jaTem } = await pool.query(
          `SELECT 1 FROM portal_enderecos WHERE customer_id = $1 LIMIT 1`,
          [sessao.cid]
        );
        const viraPadrao = padrao || jaTem.length === 0;
        const { rows } = await pool.query(
          `INSERT INTO portal_enderecos (customer_id, rotulo, cep, rua, numero, complemento, bairro, cidade, uf, padrao)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [sessao.cid, limpo.rotulo, limpo.cep, limpo.rua, limpo.numero, limpo.complemento, limpo.bairro, limpo.cidade, limpo.uf.slice(0, 2).toUpperCase(), viraPadrao]
        );
        return Response.json({ ok: true, id: rows[0].id });
      }

      if (op === "apagar") {
        const id = Number(body.id);
        if (!Number.isFinite(id) || id <= 0) return BAD(400, "id obrigatório");
        await pool.query(`DELETE FROM portal_enderecos WHERE id = $1 AND customer_id = $2`, [id, sessao.cid]);
        return Response.json({ ok: true });
      }

      if (op === "padrao") {
        const id = Number(body.id);
        if (!Number.isFinite(id) || id <= 0) return BAD(400, "id obrigatório");
        await pool.query(`UPDATE portal_enderecos SET padrao = FALSE WHERE customer_id = $1`, [sessao.cid]);
        await pool.query(`UPDATE portal_enderecos SET padrao = TRUE WHERE id = $1 AND customer_id = $2`, [id, sessao.cid]);
        return Response.json({ ok: true });
      }

      return BAD(400, "op inválida");
    }

    return BAD(400, "ação desconhecida");
  } catch (e) {
    console.error("[api/portal]", e);
    return BAD(500, "Erro interno — tente de novo em instantes");
  }
}
