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

console.log("\n  A CRIAR: 4 de cada — clientes, orçamentos, pedidos, vendas no PDV,\n           lançamentos, movimentos de estoque, compras, leads,\n           cartões do kanban, entregas, artes e agendamentos.\n");

if (!APLICAR) {
  console.log("→ Nada foi alterado.");
  console.log("→ Para aplicar: node scripts/zerar-e-semear.mjs --aplicar\n");
  await db.end();
  process.exit(0);
}

await q("begin");
try {
  for (const t of ALVOS) await q(`delete from ${t}`);

  /* `settings` NÃO é limpa aqui, mas o carimbo de versão precisa
     acompanhar o código: se o bump aconteceu antes desta rodada, o
     banco fica com a versão antiga e o smoke acusa divergência. */
  const { readFileSync } = await import("node:fs");
  const versao = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
  await q(
    `insert into settings (key, value, category) values ('app_version', $1, 'sistema')
     on conflict (key) do update set value = excluded.value`,
    [versao]
  );

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

  /* ── VENDAS NO PDV ── */
  /* Duas de hoje: o painel do PDV mostra "últimas vendas (24h)" e
     ficaria vazio se todas fossem antigas. As outras duas ficam para
     trás, para o relatório de período ter o que comparar. */
  const PDV = [
    { cli: 0, prod: 0, mult: 1, pg: "pix", dias: 0 },
    { cli: null, prod: 1, mult: 1, pg: "dinheiro", dias: 0 },
    { cli: 3, prod: 2, mult: 2, pg: "credito", dias: 11 },
    { cli: null, prod: 3, mult: 1, pg: "debito", dias: 18 },
  ];
  let seqV = 0;
  const saleIds = [];
  for (const v of PDV) {
    const p = prods[v.prod];
    const qtd = p.pcs * v.mult;
    const unit = await precoDaFaixa(p.id, qtd);
    const total = Math.round(qtd * unit * 100) / 100;
    seqV++;
    const numero = `PDV-2026-${String(seqV).padStart(4, "0")}`;
    const itens = JSON.stringify([
      { total, quantity: qtd, productId: p.id, unitPrice: unit, description: p.name },
    ]);
    const [row] = await q(
      `insert into sales (number, customer_id, type, items, subtotal, total,
                          payment_method, status, received_amount, created_at)
       values ($1,$2,'produto',$3::jsonb,$4,$4,$5,'concluida',$4,
               coalesce($6::timestamp, now() - interval '3 hours')) returning id`,
      /* Hora fixa ("11:30") pode cair no FUTURO se o script rodar de
         madrugada — e aí a venda some do painel de 24h. Ancorar em
         now() menos algumas horas resolve em qualquer horário. */
      [numero, v.cli === null ? null : ids[v.cli], itens, total, v.pg,
       v.dias === 0 ? null : dia(v.dias) + " 11:30:00"]
    );
    saleIds.push(row.id);
    console.log(`  + ${numero}  ${v.pg.padEnd(9)} R$ ${total.toFixed(2)}`);
  }

  /* ── FINANCEIRO ── duas receitas e duas despesas, uma de cada em aberto */
  const FIN = [
    { t: "receita", cat: "Vendas", desc: "Venda no balcão PDV-2026-0001", val: 12.9, st: "pago", dias: 2, m: "pix" },
    { t: "receita", cat: "Pedidos", desc: "Entrada 50% — PED-2026-0002", val: 11.75, st: "pago", dias: 4, m: "pix" },
    { t: "despesa", cat: "Material", desc: "Compra de vinil Adespan A4", val: 187.56, st: "pago", dias: 12, m: "boleto" },
    { t: "despesa", cat: "Operação", desc: "Energia elétrica — agosto", val: 340.0, st: "pendente", dias: -5, m: "boleto" },
  ];
  for (const f of FIN) {
    await q(
      `insert into transactions (type, category, description, amount, due_date, paid_date,
                                 status, method, automatic, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)`,
      [f.t, f.cat, f.desc, f.val, dia(f.dias),
       f.st === "pago" ? dia(f.dias) : null, f.st, f.m, dia(Math.max(f.dias, 0)) + " 09:00:00"]
    );
    console.log(`  + ${f.t.padEnd(8)} ${f.st.padEnd(8)} R$ ${f.val.toFixed(2)}  ${f.desc.slice(0, 34)}`);
  }

  /* ── MOVIMENTOS DE ESTOQUE ── entrada, saídas e um ajuste de contagem */
  const mats = await q(
    `select id, name, unit_cost::numeric custo from materials
      where notes like 'Contagem do dono%' order by id limit 4`
  );
  const MOV = [
    { i: 0, kind: "entrada", qtd: 100, motivo: "compra", ref: "NF 12345", dias: 12 },
    { i: 0, kind: "saida", qtd: 8, motivo: "producao", ref: "PED-2026-0002", dias: 4 },
    { i: 1, kind: "saida", qtd: 12, motivo: "producao", ref: "PED-2026-0003", dias: 9 },
    { i: 2, kind: "ajuste", qtd: 40, motivo: "contagem", ref: "Conferência de agosto", dias: 1 },
  ];
  for (const m of MOV) {
    const mat = mats[m.i];
    await q(
      `insert into stock_movements (kind, target_type, material_id, quantity, unit_cost,
                                    reason, reference, automatic, created_at)
       values ($1,'material',$2,$3,$4,$5,$6,false,$7)`,
      [m.kind, mat.id, m.qtd, mat.custo, m.motivo, m.ref, dia(m.dias) + " 08:20:00"]
    );
    console.log(`  + estoque ${m.kind.padEnd(8)} ${String(m.qtd).padStart(4)} ${mat.name.slice(0, 34)}`);
  }

  /* ── COMPRAS ── */
  const [forn] = await q(`select id, name from suppliers order by id limit 1`);
  if (forn) {
    const COMPRAS = [
      { st: "recebida", tot: 187.56, dias: 12, it: "Vinil Adespan branco A4 — 1 caixa (100 fls)" },
      { st: "recebida", tot: 278.99, dias: 20, it: "Papel Chamex A4 75g — 1 caixa (10 resmas)" },
      { st: "pedida", tot: 344.0, dias: 3, it: "Vinil Adespan Super A3 — 1 caixa (100 fls)" },
      { st: "rascunho", tot: 123.5, dias: 0, it: "Caneca cerâmica sublimação — 1 caixa (12 un)" },
    ];
    let seqC = 0;
    for (const c of COMPRAS) {
      seqC++;
      const numero = `CMP-2026-${String(seqC).padStart(4, "0")}`;
      const itens = JSON.stringify([{ description: c.it, quantity: 1, unitCost: c.tot, total: c.tot }]);
      await q(
        `insert into purchases (number, supplier_id, status, items, subtotal, total,
                                expected_date, received_at, notes, created_at)
         values ($1,$2,$3,$4::jsonb,$5,$5,$6,$7,$8,$9)`,
        [numero, forn.id, c.st, itens, c.tot, dia(c.dias - 7),
         c.st === "recebida" ? dia(c.dias) + " 15:00:00" : null,
         "Compra de exemplo.", dia(c.dias) + " 09:40:00"]
      );
      console.log(`  + ${numero}  ${c.st.padEnd(9)} R$ ${c.tot.toFixed(2)}`);
    }
  }

  /* ── FUNIL COMERCIAL ── um lead em cada etapa */
  const LEADS = [
    { cli: 0, t: "Cartela de adesivos para confeitaria", col: "novo", val: 120, pr: 20, dias: 1 },
    { cli: 1, t: "Adesivos redondos para lembrancinha", col: "contato", val: 260, pr: 40, dias: 3 },
    { cli: 2, t: "Rótulos para linha de pães", col: "proposta", val: 890, pr: 65, dias: 6 },
    { cli: 3, t: "Adesivos de identificação do studio", col: "ganho", val: 430, pr: 100, dias: 14 },
  ];
  for (const l of LEADS) {
    const [row] = await q(
      `insert into crm_leads (customer_id, title, "column", source, expected_value,
                              probability, next_action_at, last_contact_at, created_at, updated_at)
       values ($1,$2,$3,'whatsapp',$4,$5,$6,$7,$8,$8) returning id`,
      [ids[l.cli], l.t, l.col, l.val, l.pr, dia(-3) + " 10:00:00",
       dia(l.dias) + " 16:00:00", dia(l.dias) + " 10:00:00"]
    );
    await q(
      `insert into crm_activities (customer_id, lead_id, type, title, description, created_at)
       values ($1,$2,'nota',$3,$4,$5)`,
      [ids[l.cli], row.id, "Primeiro contato",
       "Cliente pediu orçamento pelo WhatsApp.", dia(l.dias) + " 10:05:00"]
    );
    console.log(`  + lead ${l.col.padEnd(9)} R$ ${String(l.val).padStart(4)}  ${l.t.slice(0, 36)}`);
  }

  /* ── KANBAN DE PRODUÇÃO ── espelha os 4 pedidos */
  const peds = await q(`select id, number, customer_id, total::numeric tot from orders order by id`);
  const COLS = ["backlog", "producao", "acabamento", "concluido"];
  let ordem = 0;
  for (const [i, pd] of peds.entries()) {
    const cli = CLIENTES[ids.indexOf(pd.customer_id)];
    await q(
      `insert into kanban_cards (title, description, "column", customer_name, customer_id,
                                 order_id, "order", priority, due_date, estimated_value)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [`${pd.number} — adesivos`, "Cartão de exemplo, criado junto com o pedido.",
       COLS[i], cli ? cli.name : null, pd.customer_id, pd.id, ordem++,
       i === 1 ? "alta" : "normal", dia(-4), pd.tot]
    );
    console.log(`  + kanban ${COLS[i].padEnd(11)} ${pd.number}`);
  }

  /* ── ENTREGA, ARTE E AGENDA ── amarrados aos pedidos existentes */
  const ENTREGAS = [
    { i: 0, m: "retirada", st: "aguardando", fee: 0 },
    { i: 1, m: "entrega", st: "aguardando", fee: 15 },
    { i: 2, m: "retirada", st: "pronto", fee: 0 },
    { i: 3, m: "correios", st: "entregue", fee: 28.9 },
  ];
  for (const e of ENTREGAS) {
    const pd = peds[e.i];
    const cli = CLIENTES[ids.indexOf(pd.customer_id)];
    await q(
      `insert into deliveries (order_id, customer_id, method, status, delivery_fee,
                               recipient_name, address_snapshot, delivered_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [pd.id, pd.customer_id, e.m, e.st, e.fee, cli ? cli.name : null,
       cli ? `${cli.street}, ${cli.number} — ${cli.district}, ${cli.city}/${cli.state}` : null,
       e.st === "entregue" ? dia(2) + " 14:00:00" : null]
    );
    await q(
      `insert into art_approvals (order_id, file_name, version, status, client_comment, created_at)
       values ($1,$2,1,$3,$4,$5)`,
      [pd.id, `arte-${pd.number.toLowerCase()}.pdf`,
       ["pendente", "pendente", "aprovada", "aprovada"][e.i],
       e.i === 2 ? "Aprovado, pode imprimir." : null, dia(3) + " 17:00:00"]
    );
    console.log(`  + entrega ${e.m.padEnd(9)} ${pd.number}`);
  }

  const [imp] = await q(`select id from printers order by id limit 1`);
  for (const [i, pd] of peds.entries()) {
    await q(
      `insert into production_schedules (order_id, printer_id, title, scheduled_date,
                                         start_time, estimated_minutes, status)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [pd.id, imp?.id ?? null, `${pd.number} — impressão`, dia(-(i + 1)),
       ["08:00", "10:00", "13:30", "15:00"][i], 45,
       i < 2 ? "planejado" : "concluido"]
    );
  }
  console.log("  + 4 agendamentos de produção");

  await q("commit");
  console.log("\n  ✔ Base zerada e semeada.\n");
} catch (e) {
  await q("rollback");
  console.error("\n  ✖ Nada foi alterado:", e.message, "\n");
  process.exitCode = 1;
}
await db.end();
