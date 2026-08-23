#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   ZERA O MOVIMENTO E DEIXA UMA BASE DE EXEMPLO ENXUTA

     node scripts/zerar-e-semear.mjs             mostra o que faria
     node scripts/zerar-e-semear.mjs --aplicar   executa

   Pedido do dono: apagar tudo o que é demonstração e deixar apenas
   4 clientes, 4 orçamentos e 4 pedidos de exemplo — o suficiente para
   conferir o sistema funcionando, sem lixo para limpar depois.

   MANTÉM: configurações, categorias, parque gráfico, serviços, os 28
   materiais da contagem real e os 9 produtos com suas faixas.

   APAGA: clientes, orçamentos, pedidos, vendas, financeiro, estoque
   (movimentos), compras, kanban, leads, entregas, aprovações de arte,
   links de cadastro — e os 17 materiais de demonstração.

   CLIENTES DE EXEMPLO: 2 pessoa física com CPF e 2 empresa com CNPJ,
   todos com CEP e endereço reais do Rio. Documentos com dígito
   verificador válido, senão o próprio sistema os recusa.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);

/* Tabelas mudam entre versões: `purchase_items` não existe aqui. Sem
   esta checagem o script morre no meio da limpeza. */
async function existe(t) {
  const [{ r }] = await q(`select to_regclass($1) as r`, [`public.${t}`]);
  return !!r;
}

/* Da folha para a raiz: filho antes do pai, senão a FK barra. */
const LIMPAR = [
  "quote_items", "quotes",
  "deliveries", "art_approvals", "production_schedules", "kanban_cards", "orders",
  "sales",
  "transactions",
  "stock_movements", "purchase_items", "purchases",
  "crm_activities", "crm_leads",
  "registration_links",
  "customers",
];

const CLIENTES = [
  {
    type: "pf", name: "Camila Duarte Ribeiro", document: "529.982.247-25",
    email: "camila.ribeiro@gmail.com", phone: "(21) 98842-3317", whatsapp: "(21) 98842-3317",
    cep: "21810-000", street: "Rua Araquém", number: "412", complement: "apto 302",
    district: "Bangu", city: "Rio de Janeiro", state: "RJ",
    origin: "whatsapp", birthDate: "1991-04-18",
    notes: "Cliente de exemplo — pessoa física com CPF.",
  },
  {
    type: "pf", name: "Rogério Pinto Machado", document: "168.995.350-09",
    email: "rogerio.machado@outlook.com", phone: "(21) 99615-7724", whatsapp: "(21) 99615-7724",
    cep: "21710-260", street: "Rua Professor Clemente Ferreira", number: "88",
    district: "Realengo", city: "Rio de Janeiro", state: "RJ",
    origin: "indicacao", birthDate: "1984-11-06",
    notes: "Cliente de exemplo — pessoa física com CPF.",
  },
  {
    type: "pj", name: "Padaria Trigo de Ouro LTDA", tradeName: "Trigo de Ouro",
    /* NÃO usar 11.222.333/0001-81: é o CNPJ que o e2e-smoke cadastra,
       e o índice único de documento faria o teste falhar. */
    document: "45.997.418/0001-53", stateRegistration: "77.918.244",
    email: "contato@trigodeouro.com.br", phone: "(21) 2401-8890", whatsapp: "(21) 98120-4455",
    contactName: "Sandra", contactRole: "Gerente",
    cep: "21832-000", street: "Estrada do Engenho", number: "1520",
    district: "Bangu", city: "Rio de Janeiro", state: "RJ",
    origin: "balcao", companySize: "ME",
    notes: "Cliente de exemplo — empresa com CNPJ.",
  },
  {
    type: "pj", name: "Studio Bella Estética ME", tradeName: "Studio Bella",
    document: "30.189.224/0001-54", stateRegistration: "11.402.877",
    email: "financeiro@studiobella.com.br", phone: "(21) 3391-2077", whatsapp: "(21) 99708-3162",
    contactName: "Beatriz", contactRole: "Proprietária",
    cep: "21715-000", street: "Rua General Bernardino de Melo", number: "245", complement: "sala 4",
    district: "Realengo", city: "Rio de Janeiro", state: "RJ",
    origin: "instagram", companySize: "ME",
    notes: "Cliente de exemplo — empresa com CNPJ.",
  },
];

console.log(`\n  ZERAR E SEMEAR — ${APLICAR ? "APLICANDO" : "simulação"}\n`);

const ALVOS = [];
for (const t of LIMPAR) if (await existe(t)) ALVOS.push(t);

console.log("  A APAGAR:");
for (const t of ALVOS) {
  const [{ n }] = await q(`select count(*)::int n from ${t}`);
  if (Number(n) > 0) console.log(`    ${String(n).padStart(5)}  ${t}`);
}
const [{ n: matDemo }] = await q(
  `select count(*)::int n from materials where notes is null or notes not like 'Contagem do dono%'`
);
console.log(`    ${String(matDemo).padStart(5)}  materiais de demonstração`);

console.log("\n  A MANTER:");
for (const t of ["settings", "item_categories", "printers", "printer_consumables",
                 "print_formats", "services", "products", "product_price_tiers"]) {
  const [{ n }] = await q(`select count(*)::int n from ${t}`);
  console.log(`    ${String(n).padStart(5)}  ${t}`);
}
const [{ n: matReal }] = await q(
  `select count(*)::int n from materials where notes like 'Contagem do dono%'`
);
console.log(`    ${String(matReal).padStart(5)}  materiais reais (contagem)`);

console.log("\n  A CRIAR: 4 clientes · 4 orçamentos · 4 pedidos\n");

if (!APLICAR) {
  console.log("→ Nada foi alterado.");
  console.log("→ Para aplicar: node scripts/zerar-e-semear.mjs --aplicar\n");
  await db.end();
  process.exit(0);
}

await q("begin");
try {
  for (const t of ALVOS) await q(`delete from ${t}`);

  /* Material de demonstração sai junto: os produtos reais não o usam
     (todos apontam para o vinil Adespan da contagem). */
  await q(`delete from materials where notes is null or notes not like 'Contagem do dono%'`);

  /* Numeração recomeça do 1 — base nova, contador novo. */
  for (const t of ["customers", "quotes", "orders", "sales", "transactions",
                   "stock_movements", "crm_leads", "kanban_cards"]) {
    await q(`select setval(pg_get_serial_sequence('${t}','id'), 1, false)`);
  }

  const ids = [];
  for (const c of CLIENTES) {
    const cols = Object.keys(c);
    const vals = cols.map((_, i) => `$${i + 1}`).join(",");
    const nomes = cols.map((k) => `"${k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())}"`).join(",");
    const [row] = await q(
      `insert into customers (${nomes}) values (${vals}) returning id`,
      cols.map((k) => c[k])
    );
    ids.push(row.id);
    console.log(`  + cliente ${row.id}: ${c.name}`);
  }

  /* Produtos reais, para os documentos citarem coisa que existe. */
  const prods = await q(
    `select p.id, p.name, p.pieces_per_sheet::int pcs from products p order by p.id limit 4`
  );

  /* O preço tem de sair da FAIXA que a quantidade alcança, senão o
     exemplo mostra um desconto de volume que o sistema não deu — e
     quem abrir o orçamento vai achar que a tabela está quebrada. */
  async function precoDaFaixa(produtoId, qtd) {
    const [r] = await q(
      `select unit_price::numeric preco from product_price_tiers
        where product_id = $1 and min_quantity <= $2
        order by min_quantity desc limit 1`,
      [produtoId, qtd]
    );
    return Number(r.preco);
  }

  const hoje = new Date();
  const dia = (d) => new Date(hoje.getTime() - d * 86400000).toISOString().slice(0, 10);

  /* ORÇAMENTOS — um em cada estágio, para as telas terem o que mostrar. */
  const ORC = [
    { cli: 0, prod: 0, mult: 1, status: "rascunho", dias: 1 },
    { cli: 1, prod: 1, mult: 2, status: "enviado", dias: 3 },
    { cli: 2, prod: 2, mult: 5, status: "aprovado", dias: 8 },
    { cli: 3, prod: 3, mult: 2, status: "recusado", dias: 15 },
  ];
  const quoteIds = [];
  let seqQ = 0;
  for (const o of ORC) {
    const p = prods[o.prod];
    const qtd = p.pcs * o.mult;
    const unit = await precoDaFaixa(p.id, qtd);
    const total = Math.round(qtd * unit * 100) / 100;
    seqQ++;
    const numero = `ORC-2026-${String(seqQ).padStart(4, "0")}`;
    const [row] = await q(
      `insert into quotes (number, customer_id, status, subtotal, discount, total,
                           valid_until, notes, created_at)
       values ($1,$2,$3,$4,0,$4,$5,$6,$7) returning id`,
      [numero, ids[o.cli], o.status, total, dia(-15),
       `Orçamento de exemplo — ${p.name}.`, dia(o.dias) + " 10:00:00"]
    );
    quoteIds.push(row.id);
    await q(
      `insert into quote_items (quote_id, product_id, description, quantity, unit_price, total)
       values ($1,$2,$3,$4,$5,$6)`,
      [row.id, p.id, p.name, qtd, unit, total]
    );
    console.log(`  + ${numero}  ${o.status.padEnd(9)} ${String(qtd).padStart(5)} un  R$ ${total.toFixed(2)}`);
  }

  /* PEDIDOS — um em cada etapa da produção. */
  const PED = [
    { cli: 0, prod: 0, mult: 1, st: "confirmado", prod_st: "aguardando", fin: "pendente", dias: 1 },
    { cli: 1, prod: 1, mult: 2, st: "confirmado", prod_st: "em_producao", fin: "parcial", dias: 4 },
    { cli: 2, prod: 2, mult: 5, st: "confirmado", prod_st: "pronto", fin: "pago", dias: 9, quote: 2 },
    { cli: 3, prod: 0, mult: 3, st: "concluido", prod_st: "entregue", fin: "pago", dias: 20 },
  ];
  let seqP = 0;
  for (const o of PED) {
    const p = prods[o.prod];
    const qtd = p.pcs * o.mult;
    const unit = await precoDaFaixa(p.id, qtd);
    const total = Math.round(qtd * unit * 100) / 100;
    seqP++;
    const numero = `PED-2026-${String(seqP).padStart(4, "0")}`;
    const itens = JSON.stringify([
      { total, quantity: qtd, productId: p.id, unitPrice: unit, description: p.name },
    ]);
    const entrada = o.fin === "parcial" ? Math.round(total * 50) / 100 : 0;
    const [row] = await q(
      `insert into orders (number, quote_id, customer_id, status, production_status,
                           financial_status, items, subtotal, total, due_date,
                           deposit_amount, balance_amount, payment_method, notes, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [numero, o.quote != null ? quoteIds[o.quote] : null, ids[o.cli], o.st, o.prod_st,
       o.fin, itens, total, dia(-5), entrada, total - entrada, "pix",
       `Pedido de exemplo — ${p.name}.`, dia(o.dias) + " 14:00:00"]
    );
    console.log(`  + ${numero}  ${o.prod_st.padEnd(12)} ${String(qtd).padStart(5)} un  R$ ${total.toFixed(2)}`);
    void row;
  }

  await q("commit");
  console.log("\n  ✔ Base zerada e semeada.\n");
} catch (e) {
  await q("rollback");
  console.error("\n  ✖ Nada foi alterado:", e.message, "\n");
  process.exitCode = 1;
}
await db.end();
