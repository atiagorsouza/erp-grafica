#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   DADOS DE DEMONSTRAÇÃO

     node scripts/seed-demo.mjs            (mostra o que faria)
     node scripts/seed-demo.mjs --aplicar
     node scripts/seed-demo.mjs --limpar   (remove só o que criou)

   Para quê: sistema vazio não mostra nada. Este script enche o ERP
   com um mês de operação plausível da VTDIGITAL — clientes, produtos
   com os prazos reais, orçamentos, pedidos em vários estágios, vendas
   no PDV e lançamentos no financeiro.

   NÃO é para produção. Tudo que ele cria leva a marca `DEMO` em algum
   campo rastreável, e `--limpar` remove exatamente isso, sem tocar em
   dado real. Por isso não uso TRUNCATE em lugar nenhum.

   Os números vieram das conversas com o dono:
     · adesivo/vinil com arte do cliente ... 1 dia
     · cartão de visita 100-200un ......... 1 dia
     · peça 3D ............................ 2 dias
     · papelaria personalizada ............ 3 dias
     · banner/lona terceirizado ........... 3 dias
     · 3D com modelagem ................... 4 dias
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const LIMPAR = process.argv.includes("--limpar");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const q = (sql, p = []) => client.query(sql, p);
const um = async (sql, p = []) => (await q(sql, p)).rows[0];

/* Marca de rastreio. Fica em `notes`/`description`, campos que o
   usuário vê — se alguém esquecer de limpar, é evidente. */
const TAG = "[DEMO]";

const hoje = new Date();
const diasAtras = (n) => {
  const d = new Date(hoje);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/* ── CPF/CNPJ sintéticos válidos ───────────────────────────────────
   O cadastro completo exige documento válido (v3.21.0). Gerar é
   melhor que inventar: número inválido seria recusado na hora. */
function cpf(seed) {
  const base = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  const dv = (arr, start) => {
    const s = arr.reduce((a, n, i) => a + n * (start - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  const n = [...base, d1, d2].join("");
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

function cnpj(seed) {
  const base = String(seed).padStart(12, "0").slice(-12).split("").map(Number);
  const calc = (arr) => {
    const pesos = arr.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = arr.reduce((a, n, i) => a + n * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base);
  const d2 = calc([...base, d1]);
  const n = [...base, d1, d2].join("");
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

/* ── O elenco ──────────────────────────────────────────────────────
   Nomes comuns, bairros do Rio, mistura de PF e PJ. Alguns vieram do
   WhatsApp (origin) e um está sem documento de propósito: é o lead
   que ainda não completou o cadastro, para a tela mostrar o caso. */
const CLIENTES = [
  { t: "pf", n: "Mariana Ribeiro Alves",  f: "21982340011", b: "Bangu",        c: "Rio de Janeiro", o: "whatsapp",  s: "ativo" },
  { t: "pj", n: "Padaria Pão Dourado LTDA", fant: "Pão Dourado", f: "21987650022", b: "Realengo", c: "Rio de Janeiro", o: "indicacao", s: "ativo" },
  { t: "pf", n: "Carlos Eduardo Pinto",   f: "21991230033", b: "Campo Grande", c: "Rio de Janeiro", o: "instagram", s: "ativo" },
  { t: "pj", n: "Studio Bella Estética ME", fant: "Studio Bella", f: "21993450044", b: "Barra da Tijuca", c: "Rio de Janeiro", o: "instagram", s: "ativo" },
  { t: "pf", n: "Juliana Costa Moreira",  f: "21996780055", b: "Bangu",        c: "Rio de Janeiro", o: "balcao",    s: "ativo" },
  { t: "pj", n: "Auto Peças Guaratiba EIRELI", fant: "Auto Peças Guaratiba", f: "21988900066", b: "Guaratiba", c: "Rio de Janeiro", o: "google", s: "ativo" },
  { t: "pf", n: "Roberto Nunes da Silva", f: "21994560077", b: "Deodoro",      c: "Rio de Janeiro", o: "indicacao", s: "ativo" },
  { t: "pf", n: "Patrícia Gomes Ferreira", f: "21992340088", b: "Padre Miguel", c: "Rio de Janeiro", o: "whatsapp", s: "ativo" },
  { t: "pj", n: "Escola Crescer LTDA",    fant: "Escola Crescer", f: "21987120099", b: "Bangu", c: "Rio de Janeiro", o: "indicacao", s: "ativo" },
  /* Lead cru do WhatsApp: só nome e telefone, como o bot deixa. */
  { t: "pf", n: "Anderson",               f: "21995670100", o: "whatsapp",  s: "lead", semDoc: true },
  { t: "pf", n: "Fernanda Lima Souza",    f: "21998760111", b: "Santíssimo", c: "Rio de Janeiro", o: "whatsapp", s: "lead", semDoc: true },
];

/* ── Catálogo ──────────────────────────────────────────────────────
   Prazos conforme o dono ditou. `pt` = tabela de preços de origem,
   quando o produto sai de uma (lona, adesivo, DTF). */
const PRODUTOS = [
  { sku: "ADE-VIN",  n: "Adesivo vinil recortado",        cat: "Comunicação Visual", preco: 85,   custo: 40,   c: 0, p: 1, a: 0, pt: 9,  un: "m2" },
  { sku: "ADE-SIM",  n: "Adesivo vinil impresso",         cat: "Comunicação Visual", preco: 65,   custo: 31,   c: 0, p: 1, a: 0, pt: 8,  un: "m2" },
  { sku: "BAN-LON",  n: "Banner em lona 440g",            cat: "Comunicação Visual", preco: 75,   custo: 35,   c: 0, p: 2, a: 1, pt: 7,  un: "m2" },
  { sku: "CAR-100",  n: "Cartão de visita 100un",         cat: "Impressão Digital",  preco: 89,   custo: 38,   c: 0, p: 1, a: 0, un: "cento" },
  { sku: "CAR-200",  n: "Cartão de visita 200un",         cat: "Impressão Digital",  preco: 149,  custo: 62,   c: 0, p: 1, a: 0, un: "cento" },
  { sku: "PAN-A5",   n: "Panfleto A5 colorido (100un)",   cat: "Impressão Digital",  preco: 79,   custo: 33,   c: 0, p: 1, a: 0, un: "cento" },
  { sku: "DTF-CAM",  n: "Camiseta personalizada DTF",     cat: "Têxtil",             preco: 55,   custo: 24,   c: 0, p: 2, a: 1, pt: 1,  un: "unidade" },
  { sku: "3D-PEC",   n: "Peça 3D em PLA",                 cat: "Impressão 3D",       preco: 45,   custo: 18,   c: 0, p: 2, a: 0, un: "unidade" },
  { sku: "3D-MOD",   n: "Peça 3D com modelagem",          cat: "Impressão 3D",       preco: 180,  custo: 62,   c: 2, p: 2, a: 0, un: "unidade" },
  { sku: "PAP-KIT",  n: "Kit papelaria personalizada",    cat: "Papelaria",          preco: 220,  custo: 88,   c: 1, p: 2, a: 0, un: "kit" },
  { sku: "AGE-PER",  n: "Agenda personalizada",           cat: "Papelaria",          preco: 95,   custo: 38,   c: 0, p: 2, a: 0, un: "unidade", serie: true },
  { sku: "COP-ECO",  n: "Eco copo personalizado",         cat: "Brindes",            preco: 6.19, custo: 2.96, c: 0, p: 1, a: 1, un: "unidade" },
  { sku: "TAC-GIN",  n: "Taça de gin personalizada",      cat: "Brindes",            preco: 8.68, custo: 4.15, c: 0, p: 1, a: 1, un: "unidade" },
  { sku: "CAN-LON",  n: "Caneca long drink personalizada", cat: "Brindes",           preco: 3.48, custo: 1.66, c: 0, p: 1, a: 1, un: "unidade" },
  { sku: "IMP-A4C",  n: "Impressão A4 colorida",          cat: "Impressão Digital",  preco: 0.99, custo: 0.35, c: 0, p: 1, a: 0, un: "folha" },
  { sku: "IMP-A3C",  n: "Impressão A3 colorida",          cat: "Impressão Digital",  preco: 2.99, custo: 0.95, c: 0, p: 1, a: 0, un: "folha" },
];

const CATEGORIAS = [
  { m: "product", n: "Impressão Digital",  i: "🖨️", c: "#0891b2" },
  { m: "product", n: "Comunicação Visual", i: "🎨", c: "#d6246e" },
  { m: "product", n: "Têxtil",             i: "👕", c: "#7c3aed" },
  { m: "product", n: "Impressão 3D",       i: "🧊", c: "#059669" },
  { m: "product", n: "Papelaria",          i: "📓", c: "#ea580c" },
  { m: "product", n: "Brindes",            i: "🎁", c: "#eab308" },
  /* Sem categoria com module='finishing' o acabamento de frete fica
     órfão (visto na v3.49.1). Criamos a que faltava. */
  { m: "finishing", n: "Terceirizados",    i: "🚚", c: "#46587a" },
  { m: "finishing", n: "Acabamento",       i: "✂️", c: "#0e7490" },
];

const ACABAMENTOS = [
  { n: "Frete do fornecedor (DTF/banner)", cat: "Terceirizados", unit: "pedido", custo: 10.5,
    d: "Cobrado UMA vez por pedido (fixed_lot). Por peça mataria a venda." },
  { n: "Laminação BOPP fosco",  cat: "Acabamento", unit: "m2",      custo: 8 },
  { n: "Corte especial / faca", cat: "Acabamento", unit: "unidade", custo: 0.35 },
  { n: "Ilhós para banner",     cat: "Acabamento", unit: "unidade", custo: 1.2 },
];

async function limpar() {
  /* Ordem importa: filhos antes dos pais. Tudo filtrado pela TAG ou
     por vínculo com o que a TAG marcou — nunca por TRUNCATE. */
  const passos = [
    ["transactions",     `DELETE FROM transactions WHERE notes LIKE '%${TAG}%' OR description LIKE '%${TAG}%'`],
    ["kanban_cards",     `DELETE FROM kanban_cards WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '%${TAG}%')`],
    ["deliveries",       `DELETE FROM deliveries WHERE order_id IN (SELECT id FROM orders WHERE notes LIKE '%${TAG}%')`],
    ["orders",           `DELETE FROM orders WHERE notes LIKE '%${TAG}%'`],
    ["quote_items",      `DELETE FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE notes LIKE '%${TAG}%')`],
    ["quotes",           `DELETE FROM quotes WHERE notes LIKE '%${TAG}%'`],
    ["sales",            `DELETE FROM sales WHERE notes LIKE '%${TAG}%'`],
    ["cash_movements",   `DELETE FROM cash_movements WHERE notes LIKE '%${TAG}%'`],
    ["cash_sessions",    `DELETE FROM cash_sessions WHERE notes LIKE '%${TAG}%'`],
    ["crm_activities",   `DELETE FROM crm_activities WHERE description LIKE '%${TAG}%'`],
    ["crm_leads",        `DELETE FROM crm_leads WHERE notes LIKE '%${TAG}%'`],
    ["registration_links", `DELETE FROM registration_links WHERE customer_id IN (SELECT id FROM customers WHERE notes LIKE '%${TAG}%')`],
    ["product_finishings", `DELETE FROM product_finishings WHERE product_id IN (SELECT id FROM products WHERE description LIKE '%${TAG}%')`],
    ["stock_movements",  `DELETE FROM stock_movements WHERE notes LIKE '%${TAG}%'`],
    ["products",         `DELETE FROM products WHERE description LIKE '%${TAG}%'`],
    ["finishing_items",  `DELETE FROM finishing_items WHERE description LIKE '%${TAG}%'`],
    ["customers",        `DELETE FROM customers WHERE notes LIKE '%${TAG}%'`],
  ];
  let total = 0;
  for (const [nome, sql] of passos) {
    try {
      const r = await q(sql);
      if (r.rowCount) console.log(`  − ${String(r.rowCount).padStart(4)} ${nome}`);
      total += r.rowCount;
    } catch (e) {
      /* Tabela que não existe nesta instalação não é erro fatal. */
      if (!/does not exist/.test(e.message)) throw e;
    }
  }
  console.log(`\n✅ ${total} registro(s) de demonstração removidos.`);
}

async function aplicar() {
  const criados = { categorias: 0, acabamentos: 0, clientes: 0, produtos: 0, orcamentos: 0, pedidos: 0, vendas: 0, lancamentos: 0, leads: 0 };

  /* ── Categorias ── */
  const catId = new Map();
  for (const c of CATEGORIAS) {
    const existente = await um(
      `SELECT id FROM item_categories WHERE module=$1 AND name=$2 LIMIT 1`, [c.m, c.n]
    );
    if (existente) { catId.set(`${c.m}:${c.n}`, existente.id); continue; }
    const r = await um(
      `INSERT INTO item_categories (module,name,icon,color) VALUES ($1,$2,$3,$4) RETURNING id`,
      [c.m, c.n, c.i, c.c]
    );
    catId.set(`${c.m}:${c.n}`, r.id);
    criados.categorias++;
  }

  /* ── Acabamentos ── */
  const acabId = new Map();
  for (const a of ACABAMENTOS) {
    const r = await um(
      `INSERT INTO finishing_items (name,category_id,unit,unit_cost,description)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [a.n, catId.get(`finishing:${a.cat}`) ?? null, a.unit, a.custo, `${TAG} ${a.d || ""}`.trim()]
    );
    acabId.set(a.n, r.id);
    criados.acabamentos++;
  }

  /* ── Clientes ── */
  const cliId = [];
  for (let i = 0; i < CLIENTES.length; i++) {
    const c = CLIENTES[i];
    const doc = c.semDoc ? null : c.t === "pj" ? cnpj(41000000000 + i * 7919) : cpf(300000000 + i * 7919);
    const fone = `(${c.f.slice(0, 2)}) ${c.f.slice(2, 7)}-${c.f.slice(7)}`;
    const email = c.semDoc
      ? null
      : `${c.n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(" ")[0]}${i}@exemplo.com.br`;

    const r = await um(
      `INSERT INTO customers
         (type,name,trade_name,document,email,phone,whatsapp,phone_e164,
          cep,street,number,district,city,state,origin,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,'RJ',$13,$14,$15)
       RETURNING id`,
      [
        c.t, c.n, c.fant ?? null, doc, email, fone, `55${c.f}`,
        c.b ? "21800-000" : null,
        c.b ? "Rua das Palmeiras" : null,
        c.b ? String(100 + i * 13) : null,
        c.b ?? null, c.c ?? null,
        c.o, c.s, TAG,
      ]
    );
    cliId.push({ id: r.id, ...c });
    criados.clientes++;
  }

  /* ── Produtos ── */
  /* Os produtos referenciam tabela de preço por ID. Os IDs eram
     FIXOS (1, 7, 8, 9...), o que só funciona na primeiríssima carga:
     se as tabelas forem recriadas, a sequência avança e o seed quebra
     com "violates foreign key constraint".

     Aconteceu aqui em 20/08/2026. Agora resolve por LABEL, que é
     estável, e ignora o vínculo se a tabela não existir. */
  const tabelasPorPosicao = (await q(`SELECT id, label FROM pricing_tables ORDER BY id`)).rows;
  const idDaTabela = (pos) => {
    if (!pos) return null;
    const t = tabelasPorPosicao[Number(pos) - 1];
    return t ? t.id : null;
  };

  const prodId = new Map();
  for (const p of PRODUTOS) {
    const r = await um(
      `INSERT INTO products
         (name,sku,description,product_category_id,base_pricing_table_id,
          calculation_mode,default_quantity,margin,
          cost_snapshot,sell_price,final_price,active,track_stock,
          lead_time_creation,lead_time_production,lead_time_finishing,lead_time_serial)
       VALUES ($1,$2,$3,$4,$5,'unit',1,0.4,$6,$7,$7,true,false,$8,$9,$10,$11)
       RETURNING id`,
      [p.n, p.sku, `${TAG} ${p.un}`, catId.get(`product:${p.cat}`) ?? null,
       idDaTabela(p.pt), p.custo, p.preco, p.c, p.p, p.a, !!p.serie]
    );
    prodId.set(p.sku, { id: r.id, ...p });
    criados.produtos++;
  }

  /* Frete do fornecedor nos produtos terceirizados, em `fixed_lot`:
     entra UMA vez no pedido, não por peça. */
  const frete = acabId.get("Frete do fornecedor (DTF/banner)");
  for (const sku of ["BAN-LON", "DTF-CAM"]) {
    const p = prodId.get(sku);
    if (p && frete) {
      await q(
        `INSERT INTO product_finishings (product_id,finishing_id,quantity,charge_mode)
         VALUES ($1,$2,1,'fixed_lot')`,
        [p.id, frete]
      );
    }
  }

  /* ── Numeração de documentos ──────────────────────────────────────
     Os contadores são atômicos em produção; aqui reservamos a faixa
     de uma vez para não brigar com eles. */
  const ano = hoje.getFullYear();
  async function proximo(tipo, quantos) {
    const r = await um(
      `INSERT INTO document_counters (document_type,year,current)
       VALUES ($1,$2,$3)
       ON CONFLICT (document_type,year)
       DO UPDATE SET current = document_counters.current + $3
       RETURNING current`,
      [tipo, ano, quantos]
    );
    return r.current - quantos + 1;
  }

  /* ── Orçamentos ── */
  const ORCAMENTOS = [
    { cli: 1, dias: 2,  st: "enviado",   itens: [["CAR-200", 1], ["PAN-A5", 2]] },
    { cli: 3, dias: 5,  st: "aprovado",  itens: [["BAN-LON", 2]] },
    { cli: 0, dias: 1,  st: "rascunho",  itens: [["3D-MOD", 1]] },
    { cli: 8, dias: 8,  st: "aprovado",  itens: [["AGE-PER", 30]] },
    { cli: 5, dias: 12, st: "recusado",  itens: [["ADE-VIN", 6]] },
    { cli: 4, dias: 3,  st: "enviado",   itens: [["COP-ECO", 100], ["TAC-GIN", 50]] },
  ];
  let nQuote = await proximo("quote", ORCAMENTOS.length);
  for (const o of ORCAMENTOS) {
    const cli = cliId[o.cli];
    const linhas = o.itens.map(([sku, qtd]) => {
      const p = prodId.get(sku);
      return { p, qtd, total: Number((p.preco * qtd).toFixed(2)) };
    });
    const total = linhas.reduce((s, l) => s + l.total, 0);
    const numero = `ORC-${ano}-${String(nQuote++).padStart(4, "0")}`;

    const qr = await um(
      `INSERT INTO quotes (number,customer_id,status,channel,seller_name,
                           subtotal,discount,total,valid_until,notes,created_at)
       VALUES ($1,$2,$3,'WhatsApp','Tiago',$4,0,$4,$5,$6,$7) RETURNING id`,
      [numero, cli.id, o.st, total, diasAtras(o.dias - 3), `${TAG} orçamento de demonstração`,
       new Date(Date.now() - o.dias * 864e5)]
    );
    for (const l of linhas) {
      await q(
        `INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [qr.id, l.p.id, l.p.n, l.qtd, l.p.preco, l.total]
      );
    }
    criados.orcamentos++;
  }

  /* ── Pedidos ──────────────────────────────────────────────────────
     Espalhados pelos estágios de produção para o Kanban ter conteúdo
     em todas as colunas. A regra 50/50 é respeitada: quem está em
     produção tem entrada paga. */
  const PEDIDOS = [
    { cli: 1, dias: 9, prod: "concluido",  pg: "pago",     itens: [["CAR-100", 2], ["IMP-A4C", 50]] },
    { cli: 2, dias: 7, prod: "em_producao", pg: "parcial", itens: [["DTF-CAM", 12]] },
    { cli: 3, dias: 6, prod: "em_producao", pg: "parcial", itens: [["BAN-LON", 3], ["ADE-VIN", 2]] },
    { cli: 5, dias: 4, prod: "aguardando", pg: "pendente", itens: [["PAP-KIT", 1]] },
    { cli: 6, dias: 3, prod: "aguardando", pg: "parcial",  itens: [["3D-PEC", 4]] },
    { cli: 8, dias: 2, prod: "em_producao", pg: "parcial", itens: [["AGE-PER", 25]] },
    { cli: 4, dias: 1, prod: "aguardando", pg: "pendente", itens: [["COP-ECO", 150]] },
    { cli: 7, dias: 14, prod: "concluido", pg: "pago",     itens: [["CAR-200", 1]] },
    { cli: 0, dias: 20, prod: "concluido", pg: "pago",     itens: [["PAN-A5", 5]] },
  ];
  let nOrder = await proximo("order", PEDIDOS.length);
  for (const o of PEDIDOS) {
    const cli = cliId[o.cli];
    const linhas = o.itens.map(([sku, qtd]) => {
      const p = prodId.get(sku);
      return { p, qtd, total: Number((p.preco * qtd).toFixed(2)) };
    });
    const total = Number(linhas.reduce((s, l) => s + l.total, 0).toFixed(2));
    /* 50% no ato, 50% na entrega — regra da casa desde a fundação. */
    const entrada = o.pg === "pago" ? total : o.pg === "parcial" ? Number((total / 2).toFixed(2)) : 0;
    const numero = `PED-${ano}-${String(nOrder++).padStart(4, "0")}`;
    const criadoEm = new Date(Date.now() - o.dias * 864e5);

    const maiorPrazo = Math.max(...linhas.map((l) => l.p.c + l.p.p + l.p.a));
    const entrega = new Date(criadoEm);
    entrega.setDate(entrega.getDate() + maiorPrazo + 2);

    const itensJson = linhas.map((l) => ({
      productId: l.p.id,
      description: l.p.n,
      quantity: l.qtd,
      unitPrice: l.p.preco,
      total: l.total,
    }));

    const or = await um(
      `INSERT INTO orders (number,customer_id,status,production_status,art_status,
                           delivery_status,financial_status,priority,items,
                           subtotal,discount,total,
                           deposit_amount,balance_amount,due_date,
                           channel,seller_name,notes,created_at,updated_at)
       VALUES ($1,$2,$3,$4,'aprovado','a_definir',$5,'normal',$6::jsonb,
               $7,0,$7,$8,$9,$10,'WhatsApp','Tiago',$11,$12,$12)
       RETURNING id`,
      [numero, cli.id,
       o.prod === "concluido" ? "concluido" : "confirmado",
       o.prod, o.pg,
       JSON.stringify(itensJson),
       total, entrada, Number((total - entrada).toFixed(2)),
       entrega.toISOString().slice(0, 10),
       `${TAG} pedido de demonstração`, criadoEm]
    );

    /* Card no Kanban, na coluna que corresponde ao estágio. */
    const coluna = o.prod === "concluido" ? "entregue"
      : o.prod === "em_producao" ? "producao" : "backlog";
    await q(
      `INSERT INTO kanban_cards (order_id,title,"column",customer_id,customer_name,
                                 priority,due_date,estimated_value,"order")
       VALUES ($1,$2,$3,$4,$5,'normal',$6,$7,$8)`,
      [or.id, `${numero} · ${cli.n.split(" ")[0]}`, coluna, cli.id, cli.n,
       entrega.toISOString().slice(0, 10), total, criados.pedidos]
    );

    /* Receita no Financeiro. Entrada paga, saldo a receber. */
    if (entrada > 0) {
      await q(
        `INSERT INTO transactions (type,status,category,description,amount,due_date,paid_date,order_id,customer_id,notes)
         VALUES ('receita','pago','vendas',$1,$2,$3,$3,$4,$5,$6)`,
        [`Entrada ${numero}`, entrada, criadoEm.toISOString().slice(0, 10), or.id, cli.id, TAG]
      );
      criados.lancamentos++;
    }
    if (total - entrada > 0.01) {
      await q(
        `INSERT INTO transactions (type,status,category,description,amount,due_date,order_id,customer_id,notes)
         VALUES ('receita','pendente','vendas',$1,$2,$3,$4,$5,$6)`,
        [`Saldo ${numero}`, Number((total - entrada).toFixed(2)),
         entrega.toISOString().slice(0, 10), or.id, cli.id, TAG]
      );
      criados.lancamentos++;
    }
    criados.pedidos++;
  }

  /* ── Vendas no PDV ── */
  const VENDAS = [
    { cli: 4, dias: 1, m: "PIX",     itens: [["IMP-A4C", 30]] },
    { cli: null, dias: 1, m: "Dinheiro", itens: [["IMP-A3C", 12]] },
    { cli: 6, dias: 2, m: "Débito",  itens: [["CAR-100", 1]] },
    { cli: null, dias: 3, m: "PIX",  itens: [["IMP-A4C", 100]] },
    { cli: 7, dias: 4, m: "Crédito", itens: [["CAN-LON", 40]] },
  ];
  let nSale = await proximo("sale", VENDAS.length);
  for (const v of VENDAS) {
    const cli = v.cli === null ? null : cliId[v.cli];
    const linhas = v.itens.map(([sku, qtd]) => {
      const p = prodId.get(sku);
      return { p, qtd, total: Number((p.preco * qtd).toFixed(2)) };
    });
    const total = Number(linhas.reduce((s, l) => s + l.total, 0).toFixed(2));
    const numero = `VND-${ano}-${String(nSale++).padStart(4, "0")}`;
    const quando = new Date(Date.now() - v.dias * 864e5);

    const itensVenda = linhas.map((l) => ({
      productId: l.p.id,
      description: l.p.n,
      quantity: l.qtd,
      unitPrice: l.p.preco,
      total: l.total,
    }));

    const sr = await um(
      `INSERT INTO sales (number,customer_id,type,items,subtotal,discount,total,
                          payment_method,payments,status,seller_name,notes,created_at)
       VALUES ($1,$2,'produto',$3::jsonb,$4,0,$4,$5,$6::jsonb,'concluida','Tiago',$7,$8)
       RETURNING id`,
      [numero, cli?.id ?? null, JSON.stringify(itensVenda), total, v.m,
       JSON.stringify([{ method: v.m, amount: total }]),
       `${TAG} venda de balcão`, quando]
    );

    await q(
      `INSERT INTO transactions (type,status,category,description,amount,due_date,paid_date,sale_id,customer_id,notes)
       VALUES ('receita','pago','vendas',$1,$2,$3,$3,$4,$5,$6)`,
      [`Venda ${numero} (${v.m})`, total, quando.toISOString().slice(0, 10), sr.id, cli?.id ?? null, TAG]
    );
    criados.vendas++;
    criados.lancamentos++;
  }

  /* ── Despesas ──────────────────────────────────────────────────────
     Sem elas o Financeiro mostra só receita e o lucro fica irreal. */
  const DESPESAS = [
    ["Aluguel da loja",              1800, 5,  "pago"],
    ["Energia elétrica",              420, 8,  "pago"],
    ["Internet e telefone",           180, 8,  "pago"],
    ["Toner Konica (kit 4 cores)",    800, 12, "pago"],
    ["Papel A4 (10 resmas)",          280, 14, "pago"],
    ["Lona para banner (fornecedor)", 350, 6,  "pago"],
    ["Contador",                      450, 3,  "pendente"],
    ["Simples Nacional",              620, -5, "pendente"],
  ];
  for (const [desc, valor, dias, st] of DESPESAS) {
    const venc = diasAtras(dias);
    await q(
      `INSERT INTO transactions (type,status,category,description,amount,due_date,paid_date,notes)
       VALUES ('despesa',$1,'operacional',$2,$3,$4,$5,$6)`,
      [st, desc, valor, venc, st === "pago" ? venc : null, TAG]
    );
    criados.lancamentos++;
  }

  /* ── Pipeline do CRM ── */
  const LEADS = [
    { cli: 10, t: "Camisetas para formatura",        col: "qualificacao", v: 1400, p: 40 },
    { cli: 9,  t: "Cartão de visita + panfleto",     col: "novo",         v: 260,  p: 20 },
    { cli: 3,  t: "Fachada em ACM com adesivo",      col: "negociacao",   v: 2800, p: 70 },
    { cli: 8,  t: "Agendas 2027 personalizadas",     col: "orcamento",    v: 3200, p: 55 },
    { cli: 6,  t: "Kit brindes fim de ano",          col: "ganho",        v: 1900, p: 100 },
  ];
  for (const l of LEADS) {
    await q(
      `INSERT INTO crm_leads (customer_id,title,"column",source,owner,
                              expected_value,probability,notes)
       VALUES ($1,$2,$3,'whatsapp','Tiago',$4,$5,$6)`,
      [cliId[l.cli].id, l.t, l.col, l.v, l.p, `${TAG} oportunidade de demonstração`]
    );
    criados.leads++;
  }

  return criados;
}

try {
  if (LIMPAR) {
    console.log("\n═".repeat(1) + "═".repeat(61));
    console.log("  LIMPANDO DADOS DE DEMONSTRAÇÃO");
    console.log("═".repeat(62) + "\n");
    await limpar();
    process.exit(0);
  }

  if (!APLICAR) {
    console.log("\n" + "═".repeat(62));
    console.log("  DADOS DE DEMONSTRAÇÃO  (simulação)");
    console.log("═".repeat(62));
    console.log(`
  Vai criar, todos marcados com ${TAG}:

    ${CATEGORIAS.length} categorias (produto + acabamento)
    ${ACABAMENTOS.length} acabamentos, incluindo o frete de fornecedor
    ${CLIENTES.length} clientes (PF e PJ, 2 leads crus do WhatsApp)
    ${PRODUTOS.length} produtos com os prazos reais que você ditou
     6 orçamentos em vários estágios
     9 pedidos espalhados pelo Kanban, com 50/50 respeitado
     5 vendas de balcão (PIX, dinheiro, cartão)
     8 despesas (aluguel, energia, toner, impostos)
     5 oportunidades no pipeline

  Nada disso é real. Para remover depois:
      node scripts/seed-demo.mjs --limpar
`);
    console.log("→ Para aplicar: node scripts/seed-demo.mjs --aplicar\n");
    process.exit(0);
  }

  console.log("\n" + "═".repeat(62));
  console.log("  DADOS DE DEMONSTRAÇÃO  (aplicando)");
  console.log("═".repeat(62) + "\n");

  const c = await aplicar();
  for (const [k, v] of Object.entries(c)) {
    console.log(`  + ${String(v).padStart(4)} ${k}`);
  }
  console.log(`\n✅ Pronto. Tudo marcado com ${TAG}.`);
  console.log("   Para remover: node scripts/seed-demo.mjs --limpar\n");
} catch (e) {
  console.error("✖ Falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
