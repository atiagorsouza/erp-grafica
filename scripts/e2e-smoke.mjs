// PrintFlow ERP · smoke test ponta a ponta
// Requer servidor rodando. Uso: BASE_URL=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();

// CPF sintetico valido e unico por execucao: o cadastro completo passou a
// exigir documento valido (v3.21.0), entao o fixture precisa gerar um.
function makeCpf(seed) {
  const base = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  const dv = (arr, start) => {
    const sum = arr.reduce((acc, n, i) => acc + n * (start - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  return [...base, d1, d2].join("");
}

async function req(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  console.log(`✅ ${msg}`);
}
async function sql(q, p=[]) {
  const r = await pool.query(q, p);
  return r.rows;
}

async function main() {
  console.log(`🚦 PrintFlow E2E smoke — ${BASE_URL}`);
  const health = await req("/api/health");
  assert(health.ok, "healthcheck ok");

  // 1) Cliente/CRM
  const customer = await req("/api/crud/customers", { op: "create", data: {
    type: "pf", name: `E2E Cliente ${stamp}`, document: makeCpf(stamp), email: `e2e-${stamp}@example.com`, phone: "21988887777", status: "lead"
  }});
  const customerId = customer.row.id;
  assert(customerId, "cliente criado");

  const lead = await req("/api/crud/crm-leads", { op: "create", data: {
    customerId, title: `E2E Oportunidade ${stamp}`, source: "balcao", expectedValue: 250, probability: 40
  }});
  await req("/api/crud/crm-activities", { op: "create", data: { customerId, leadId: lead.row.id, type: "ligacao", title: "Contato inicial E2E" }});
  assert(lead.row.id, "lead e atividade CRM criados");

  // 2) Estoque/Compras
  const material = await req("/api/crud/materials", { op: "create", data: {
    name: `E2E Papel ${stamp}`, unit: "folha", unitCost: 0.25, stock: 20, minStock: 5
  }});
  const materialId = material.row.id;
  const supplier = await req("/api/crud/suppliers", { op: "create", data: { name: `E2E Fornecedor ${stamp}`, active: true }});
  const purchase = await req("/api/purchases", { op: "create", data: {
    supplierId: supplier.row.id, items: [{ materialId, quantity: 10, unitCost: 0.3, label: material.row.name }], freight: 1, discount: 0
  }});
  await req("/api/purchases", { op: "receive", purchaseId: purchase.row.id });
  const [matAfterPurchase] = await sql("select stock, unit_cost from materials where id=$1", [materialId]);
  assert(Number(matAfterPurchase.stock) === 30, "compra recebida soma estoque exatamente uma vez");

  // 3) Produto calculado no servidor
  const product = await req("/api/crud/products", { op: "create", data: {
    name: `E2E Produto ${stamp}`, calculationMode: "unit", baseMaterialId: materialId, baseMaterialQty: 2,
    margin: 0.4, trackStock: true, stock: 10, minStock: 2, active: true
  }});
  const productId = product.row.id;
  assert(Number(product.row.finalPrice) > 0, "produto criado com preço final calculado no servidor");

  // 4) Orçamento -> Pedido/OS -> Kanban
  const quote = await req("/api/crud/quotes", { op: "create", data: {
    customerId, status: "rascunho", channel: "Balcão", sellerName: "E2E", items: [
      { productId, description: product.row.name, quantity: 2, unitPrice: Number(product.row.finalPrice) }
    ], discount: 0, shippingFee: 0
  }});
  const quoteId = quote.row.id;
  const beforeTotal = quote.row.total;
  const sent = await req("/api/crud/quotes", { op: "update", id: quoteId, data: { status: "enviado" }});
  assert(sent.row.total === beforeTotal, "update parcial de orçamento preserva total");
  await req("/api/crud/quotes", { op: "update", id: quoteId, data: { status: "aprovado" }});
  const order = await req("/api/orders/convert", { quoteId });
  const orderId = order.order.id;
  assert(orderId, "orçamento aprovado convertido em pedido");
  const [kanban] = await sql("select id, order_id, quote_id, \"column\" from kanban_cards where quote_id=$1", [quoteId]);
  assert(kanban?.order_id === orderId, "kanban vinculado ao pedido convertido");

  await req("/api/crud/kanban", { op: "update", id: kanban.id, data: { column: "entregue" }});
  const [orderDelivered] = await sql("select status, production_status, delivery_status from orders where id=$1", [orderId]);
  assert(orderDelivered.delivery_status === "entregue", "mover kanban para entregue sincroniza pedido/entrega");

  // 5) PDV -> estoque/financeiro
  let cash = await req("/api/pdv/cash-session");
  if (!cash.session) {
    await req("/api/pdv/cash-session", { op: "open", openingAmount: 100, operator: "E2E" });
  }
  const sale = await req("/api/crud/sales", {
    clientRef: `e2e-${stamp}`,
    customerId,
    items: [{ productId, description: product.row.name, quantity: 1, unitPrice: 9999 }],
    paymentMethod: "PIX",
    allowNegativeStock: false,
    sellerName: "E2E",
  });
  assert(sale.row.number, "PDV registrou venda usando preço do banco");
  assert(Number(sale.row.total) < 9999, "PDV ignorou preço forjado do cliente");
  const [prodAfterSale] = await sql("select stock from products where id=$1", [productId]);
  assert(Number(prodAfterSale.stock) === 9, "PDV baixou estoque do produto acabado");
  const tx = await sql("select id from transactions where description ilike $1 limit 1", [`Venda ${sale.row.number}%`]);
  assert(tx.length === 1, "PDV criou lançamento financeiro");

  // 6) FINANCEIRO — regressões corrigidas na v3.11.0
  const brl = await req("/api/crud/transactions", {
    op: "create",
    data: { type: "receita", category: "Vendas", description: `E2E valor BR ${stamp}`, amount: "1.234,56" },
  });
  assert(Number(brl.row.amount) === 1234.56, "Financeiro aceita valor no padrão brasileiro");
  assert(brl.row.category === "venda", "Financeiro normaliza a categoria para o slug canônico");

  const negative = await fetch(`${BASE_URL}/api/crud/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", data: { type: "despesa", description: "E2E negativo", amount: "-10" } }),
  });
  assert(negative.status === 400, "Financeiro rejeita valor negativo");

  const garbage = await fetch(`${BASE_URL}/api/crud/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", data: { type: "receita", description: "E2E lixo", amount: "abc" } }),
  });
  const garbageBody = await garbage.json();
  assert(garbage.status === 400, "Financeiro rejeita valor não numérico");
  assert(!String(garbageBody.error || "").toLowerCase().includes("insert into"), "Financeiro não vaza SQL na mensagem de erro");

  const [autoTx] = await sql("select id from transactions where sale_id=$1 and category='venda' limit 1", [sale.row.id]);
  assert(autoTx?.id, "lançamento do PDV fica vinculado à venda por FK");
  const lockedDelete = await fetch(`${BASE_URL}/api/crud/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete", id: autoTx.id }),
  });
  assert(lockedDelete.status === 409, "lançamento automático não pode ser excluído");

  await req("/api/crud/transactions", { op: "delete", id: brl.row.id });
  const [archived] = await sql("select archived_at from transactions where id=$1", [brl.row.id]);
  assert(archived.archived_at !== null, "exclusão manual vira arquivamento (não destrói)");

  // 7) COMPRA -> DESPESA
  const expensePurchase = await req("/api/purchases", {
    op: "create",
    data: { items: [{ materialId, quantity: 2, unitCost: 30, label: "E2E insumo" }], freight: 0, discount: 0 },
  });
  await req("/api/purchases", { op: "receive", purchaseId: expensePurchase.row.id });
  const purchaseTx = await sql("select id, amount from transactions where purchase_id=$1 and category='compra'", [expensePurchase.row.id]);
  assert(purchaseTx.length === 1, "compra recebida gera despesa no Financeiro");
  await req("/api/purchases", { op: "receive", purchaseId: expensePurchase.row.id });
  const purchaseTxAgain = await sql("select id from transactions where purchase_id=$1 and category='compra'", [expensePurchase.row.id]);
  assert(purchaseTxAgain.length === 1, "receber a mesma compra duas vezes não duplica a despesa");

  // 8) CANCELAMENTO fora dos relatórios
  const doomed = await req("/api/crud/sales", {
    clientRef: `e2e-cancel-${stamp}`,
    items: [{ productId, description: "cancelar", quantity: 1, unitPrice: 1 }],
    paymentMethod: "PIX",
    allowNegativeStock: true,
  });
  await req("/api/crud/sales", { op: "cancel", id: doomed.row.id, reason: "E2E cancelamento" });
  const [canceled] = await sql("select status from sales where id=$1", [doomed.row.id]);
  assert(canceled.status === "cancelada", "venda cancelada muda de status");

  /* pedido cancelado usado nos testes de cobrança */
  const doomedOrder = await req("/api/crud/orders", {
    op: "create",
    data: { customerId, items: [{ description: "cancelar", quantity: 1, unitPrice: 10 }] },
  });
  const canceledOrderId = doomedOrder.row.id;
  await req("/api/crud/orders", { op: "cancel", id: canceledOrderId, reason: "E2E cobrança" });
  const [revenueRow] = await sql(
    "select coalesce(sum(total),0) as total from sales where status='concluida'"
  );
  const [allRow] = await sql("select coalesce(sum(total),0) as total from sales");
  assert(
    Number(revenueRow.total) < Number(allRow.total),
    "faturamento válido exclui vendas canceladas"
  );

  // 9) SUPERFRETE — cotação e regras de envio (v3.12.0)
  const shipStatus = await (await fetch(`${BASE_URL}/api/shipping`)).json();
  assert(shipStatus.ok, "módulo de envios responde");

  if (shipStatus.status?.configured) {
    const quote = await req("/api/shipping", {
      op: "quote",
      cepDestination: "01310100",
      items: [{ productId, quantity: 1 }],
    });
    assert(Array.isArray(quote.options) && quote.options.length > 0, "SuperFrete devolve opções de frete");
    assert(quote.package.weight > 0, "pacote calculado a partir dos itens");
    assert(quote.cheapest && quote.cheapest.price > 0, "opção mais barata identificada");

    const badCep = await fetch(`${BASE_URL}/api/shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "quote", cepDestination: "123" }),
    });
    assert(badCep.status === 400, "CEP inválido é rejeitado na cotação");
  } else {
    console.log("⏭️  SuperFrete sem token — cotação não verificada");
  }

  /* o frete precisa entrar no total pelo SERVIDOR */
  const shipSale = await req("/api/crud/sales", {
    clientRef: `e2e-frete-${stamp}`,
    items: [{ productId, description: "com frete", quantity: 1, unitPrice: 1 }],
    paymentMethod: "PIX",
    shippingFee: 25.5,
    shippingService: "PAC · Correios",
    shippingServiceId: 1,
    allowNegativeStock: true,
  });
  assert(Number(shipSale.row.shippingFee) === 25.5, "PDV grava o frete cotado");
  assert(
    Math.abs(Number(shipSale.row.total) - (Number(shipSale.row.subtotal) + 25.5)) < 0.01,
    "frete soma no total da venda"
  );

  const negFreight = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientRef: `e2e-frete-neg-${stamp}`,
      items: [{ productId, description: "x", quantity: 1, unitPrice: 1 }],
      paymentMethod: "PIX",
      shippingFee: -50,
    }),
  });
  assert(negFreight.status === 400, "frete negativo é rejeitado");

  // 10) INFINITEPAY — cobranças (v3.13.0)
  const payStatus = await (await fetch(`${BASE_URL}/api/payments`)).json();
  assert(payStatus.ok, "módulo de cobranças responde");

  /* webhook forjado NUNCA pode quitar nada: a InfinitePay não assina o
     aviso, então tudo é reconferido em payment_check antes da baixa */
  const forged = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_nsu: `PF-INEXISTENTE-${stamp}`,
      paid_amount: 999900,
      capture_method: "pix",
      transaction_nsu: "forjado",
    }),
  });
  const forgedBody = await forged.json();
  assert(forgedBody.ignored === true, "webhook com order_nsu desconhecido é ignorado");

  const [forgedTx] = await sql(
    "select count(*)::int as n from transactions where description ilike $1",
    [`%INEXISTENTE-${stamp}%`]
  );
  assert(Number(forgedTx.n) === 0, "webhook forjado não lança receita");

  /* validações de negócio da cobrança */
  const noOrigin = await fetch(`${BASE_URL}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create" }),
  });
  assert(noOrigin.status === 400, "cobrança sem origem é rejeitada");

  const canceledCharge = await fetch(`${BASE_URL}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", orderId: canceledOrderId }),
  });
  assert(canceledCharge.status === 409, "pedido cancelado não pode ser cobrado");

  // 11) PDV — regressões corrigidas na v3.14.0
  await sql("update products set stock=10, track_stock=true where id=$1", [productId]);

  /* corrida de estoque: 5 vendas paralelas de 3un com saldo 10.
     Antes todas passavam (check fora da transação) e o saldo ia a -5. */
  const raceResults = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      fetch(`${BASE_URL}/api/crud/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRef: `e2e-race-${n}-${stamp}`,
          items: [{ productId, description: "corrida", quantity: 3, unitPrice: 1 }],
          paymentMethod: "PIX",
        }),
      }).then((r) => r.status)
    )
  );
  const approved = raceResults.filter((s) => s === 200).length;
  assert(approved === 3, `corrida de estoque aprova só o que cabe (aprovadas: ${approved})`);

  const [stockAfterRace] = await sql("select stock from products where id=$1", [productId]);
  assert(Number(stockAfterRace.stock) >= 0, "estoque nunca fica negativo em venda concorrente");

  /* venda de valor zero não pode existir */
  const zeroSale = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientRef: `e2e-zero-${stamp}`,
      items: [{ productId, description: "zero", quantity: 1, unitPrice: 1 }],
      discount: 99999,
      paymentMethod: "PIX",
      allowNegativeStock: true,
    }),
  });
  assert(zeroSale.status === 422, "desconto não pode zerar a venda");

  /* só um caixa aberto por vez */
  await sql("update cash_sessions set status='fechado', closed_at=now() where status='aberto'");
  const opens = await Promise.all(
    [1, 2, 3].map(() =>
      fetch(`${BASE_URL}/api/pdv/cash-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "open", openingAmount: 100, operator: "E2E" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
  );
  const openedOk = opens.filter((o) => o.status === 200).length;
  assert(openedOk === 1, `abertura concorrente cria um único caixa (abriu: ${openedOk})`);
  assert(
    opens.every((o) => !String(o.body.error || "").includes("insert into")),
    "erro de caixa não vaza SQL"
  );

  const [openCount] = await sql(
    "select count(*)::int as n from cash_sessions where status='aberto'"
  );
  assert(Number(openCount.n) === 1, "existe exatamente uma sessão de caixa aberta");

  // 11b) PDV — recursos novos da v3.15.0
  await sql("update products set stock=50, track_stock=true where id=$1", [productId]);
  const [prodPrice] = await sql("select final_price from products where id=$1", [productId]);
  const unit = Number(prodPrice.final_price);

  /* pagamento dividido: o servidor cobra a taxa por parcela e só
     aceita quando a soma bate com o líquido. */
  const splitRes = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientRef: `e2e-split-${stamp}`,
      items: [{ productId, description: "split", quantity: 2, unitPrice: unit }],
      payments: [
        { method: "Dinheiro", amount: Number((unit * 2 - unit).toFixed(2)) },
        { method: "PIX", amount: Number(unit.toFixed(2)) },
      ],
      receivedAmount: 999,
    }),
  });
  const splitBody = await splitRes.json();
  assert(splitRes.status === 200, "venda com pagamento dividido é aceita");
  assert(
    String(splitBody.row?.paymentMethod || "").includes("+"),
    "venda dividida registra as duas formas"
  );
  assert(
    Array.isArray(splitBody.row?.payments) && splitBody.row.payments.length === 2,
    "parcelas do pagamento dividido são persistidas"
  );

  /* divisão que não fecha precisa ser recusada */
  const splitBad = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientRef: `e2e-split-bad-${stamp}`,
      items: [{ productId, description: "split ruim", quantity: 2, unitPrice: unit }],
      payments: [{ method: "PIX", amount: 0.01 }],
    }),
  });
  assert(splitBad.status === 422, "divisão que não soma o total é recusada");

  /* últimas vendas alimentam a reimpressão de cupom */
  const recentRes = await fetch(`${BASE_URL}/api/pdv/recent-sales?limit=5`);
  const recentBody = await recentRes.json();
  assert(recentRes.ok && recentBody.ok, "endpoint de últimas vendas responde");
  assert(Array.isArray(recentBody.sales), "últimas vendas devolvem lista");
  assert(
    recentBody.sales.length === 0 || Array.isArray(recentBody.sales[0].items),
    "últimas vendas trazem os itens para reimprimir o cupom"
  );

  /* cancelamento pelo PDV estorna estoque e financeiro */
  const saleToCancel = splitBody.row?.id;
  const [stockBeforeCancel] = await sql("select stock from products where id=$1", [productId]);
  const cancelRes = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "cancel", id: saleToCancel, reason: "e2e smoke" }),
  });
  assert(cancelRes.ok, "cancelamento de venda pelo PDV responde ok");

  const [stockAfterCancel] = await sql("select stock from products where id=$1", [productId]);
  assert(
    Number(stockAfterCancel.stock) > Number(stockBeforeCancel.stock),
    "cancelamento devolve o estoque"
  );

  const [reversal] = await sql(
    "select count(*)::int as n from transactions where sale_id=$1 and category='estorno'",
    [saleToCancel]
  );
  assert(Number(reversal.n) > 0, "cancelamento estorna a receita no financeiro");

  const cancelShort = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "cancel", id: saleToCancel, reason: "x" }),
  });
  assert(cancelShort.status === 400, "cancelamento exige motivo com 3+ caracteres");

  const cancelTwice = await fetch(`${BASE_URL}/api/crud/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "cancel", id: saleToCancel, reason: "de novo" }),
  });
  assert(cancelTwice.status === 409, "venda já cancelada não cancela de novo");

  // 11c) Orçamentos — regressões corrigidas na v3.16.0
  const quoteBase = {
    items: [{ description: "Item smoke", quantity: 1, unitPrice: 100 }],
  };
  const postQuote = (data) =>
    fetch(`${BASE_URL}/api/crud/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", data }),
    });

  /* desconto maior que o subtotal zerava a proposta */
  const zeroQuote = await postQuote({ ...quoteBase, discount: 99999 });
  assert(zeroQuote.status === 422, "orçamento não pode ser zerado por desconto");

  /* percentual acima de 100% */
  const overQuote = await postQuote({ ...quoteBase, discount: 500, discountMode: "percent" });
  assert(overQuote.status === 422, "desconto percentual acima de 100% é recusado");

  /* validade no passado */
  const pastQuote = await postQuote({ ...quoteBase, validUntil: "2020-01-01" });
  assert(pastQuote.status === 422, "validade no passado é recusada");

  /* preço fora da tabela avisa mas não bloqueia */
  const offTable = await postQuote({
    items: [{ productId, description: "fora da tabela", quantity: 10, unitPrice: 0.01 }],
  });
  const offTableBody = await offTable.json();
  assert(offTable.status === 200, "preço negociado abaixo da tabela é aceito");
  assert(
    Array.isArray(offTableBody.warnings) && offTableBody.warnings.length > 0,
    "preço fora da tabela gera aviso ao vendedor"
  );

  /* orçamento aprovado é acordo fechado */
  const approvedQuote = await postQuote({
    status: "aprovado",
    items: [{ description: "acordo", quantity: 1, unitPrice: 5000 }],
  });
  const approvedBody = await approvedQuote.json();
  const approvedId = approvedBody.row.id;

  const sneaky = await fetch(`${BASE_URL}/api/crud/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "update",
      id: approvedId,
      data: { items: [{ description: "alterado", quantity: 1, unitPrice: 10 }] },
    }),
  });
  assert(sneaky.status === 409, "orçamento aprovado não muda de valor sem reabrir");

  const reopened = await fetch(`${BASE_URL}/api/crud/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "update",
      id: approvedId,
      data: { reopen: true, items: [{ description: "renegociado", quantity: 1, unitPrice: 4500 }] },
    }),
  });
  const reopenedBody = await reopened.json();
  assert(reopened.status === 200, "reabertura explícita permite renegociar");
  assert(reopenedBody.row.status === "rascunho", "orçamento reaberto volta para rascunho");
  assert(
    String(reopenedBody.row.notes || "").includes("REABERTO"),
    "reabertura registra o valor anterior na proposta"
  );

  /* conversão concorrente: um orçamento gera no máximo um pedido */
  const toConvert = await postQuote({
    status: "aprovado",
    items: [{ description: "para converter", quantity: 1, unitPrice: 250 }],
  });
  const toConvertId = (await toConvert.json()).row.id;

  const conversions = await Promise.all(
    [1, 2, 3, 4, 5].map(() =>
      fetch(`${BASE_URL}/api/orders/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: toConvertId }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
  );
  const [convCount] = await sql("select count(*)::int as n from orders where quote_id=$1", [
    toConvertId,
  ]);
  assert(Number(convCount.n) === 1, `conversão concorrente gera um único pedido (${convCount.n})`);
  assert(
    conversions.every((c) => c.status === 200),
    "conversões perdedoras devolvem o pedido vencedor, sem erro"
  );
  assert(
    conversions.every((c) => !String(c.body.error || "").includes("insert into")),
    "erro de conversão não vaza SQL"
  );

  /* expiração acontece ao abrir a página, não só no deploy */
  const staleQuote = await postQuote({
    status: "enviado",
    items: [{ description: "vencido", quantity: 1, unitPrice: 30 }],
  });
  const staleId = (await staleQuote.json()).row.id;
  await sql("update quotes set valid_until='2020-01-01' where id=$1", [staleId]);
  await fetch(`${BASE_URL}/orcamentos`);
  const [staleAfter] = await sql("select status from quotes where id=$1", [staleId]);
  assert(staleAfter.status === "expirado", "orçamento vencido expira ao abrir a página");

  // 11d) Clientes & CRM — v3.18.0
  const cnpjSmoke = "11444777000161";
  await sql("delete from customers where name like 'SMOKE CRM%'");

  /* CNPJ enviado sem marcar PJ deve ser reconhecido pelos 14 dígitos */
  const autoType = await fetch(`${BASE_URL}/api/crud/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", data: { name: "SMOKE CRM Auto", document: cnpjSmoke } }),
  });
  const autoBody = await autoType.json();
  assert(autoType.status === 200, "CNPJ sem marcar PJ é aceito");
  assert(autoBody.row?.type === "pj", "tipo do cliente é inferido pelos dígitos do documento");

  /* documento duplicado é barrado pelo índice, sem vazar SQL */
  const dupRuns = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      fetch(`${BASE_URL}/api/crud/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create",
          data: { name: `SMOKE CRM Corrida ${n}`, document: cnpjSmoke },
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
  );
  const [dupCount] = await sql(
    "select count(*)::int as n from customers where regexp_replace(coalesce(document,''),'\\D','','g') = $1",
    [cnpjSmoke]
  );
  assert(Number(dupCount.n) === 1, `documento duplicado não cria segundo cliente (${dupCount.n})`);
  assert(
    dupRuns.every((r) => !String(r.body.error || "").includes("insert into")),
    "erro de documento duplicado não vaza SQL"
  );

  await sql("delete from customers where name like 'SMOKE CRM%'");

  /* 11e) Cadastro estruturado PF/PJ — v3.21.0 */
  const post = (data) =>
    fetch(`${BASE_URL}/api/crud/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", data }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  /* documento é obrigatório no cadastro completo, mas o balcão (F8) segue livre */
  const semDoc = await post({ name: "SMOKE CRM Sem Documento" });
  assert(semDoc.status === 422, "cadastro completo exige CPF/CNPJ");

  const rapido = await post({ name: "SMOKE CRM Balcao", quickEntry: true });
  assert(rapido.status === 200, "cadastro rápido do PDV dispensa documento");

  const docRuim = await post({ name: "SMOKE CRM Doc Ruim", document: "111.111.111-11" });
  assert(docRuim.status === 422, "CPF com dígito verificador inválido é recusado");

  /* datas não podem ser futuras e campos novos precisam persistir */
  const futuro = await post({ name: "SMOKE CRM Futuro", document: makeCpf(stamp + 7), birthDate: "2099-01-01" });
  assert(futuro.status === 422, "data de nascimento futura é recusada");

  const pj = await post({
    type: "pj", name: "SMOKE CRM Empresa", tradeName: "Smoke", document: "11222333000181",
    stateRegistration: "ISENTO", municipalRegistration: "9988", companySize: "ME",
    foundedAt: "2015-03-10", origin: "indicacao", contactName: "Maria Souza",
    phone: "2130000000", whatsappOptOut: true,
  });
  assert(pj.status === 200, "PJ com campos estruturados é aceito");
  assert(pj.body.row?.companySize === "ME" && pj.body.row?.foundedAt === "2015-03-10", "porte e fundação são persistidos");
  assert(pj.body.row?.origin === "indicacao" && pj.body.row?.contactName === "Maria Souza", "origem e contato PJ são persistidos");
  assert(pj.body.row?.whatsappOptOut === true, "opt-out de WhatsApp é persistido");
  assert(pj.body.row?.phone === "(21) 3000-0000", "telefone é normalizado com máscara");

  const pf = await post({
    type: "pf", name: "SMOKE CRM Pessoa", document: makeCpf(stamp + 21),
    rg: "123456789", rgIssuer: "DETRAN-RJ", birthDate: "1985-06-15", maritalStatus: "casado",
  });
  assert(pf.status === 200, "PF com documentos pessoais é aceito");
  assert(pf.body.row?.rgIssuer === "DETRAN-RJ" && pf.body.row?.maritalStatus === "casado", "órgão emissor e estado civil são persistidos");

  await sql("delete from customers where name like 'SMOKE CRM%'");

  /* importador de PDF: rejeita arquivo que não é ficha do legado */
  const bogus = new FormData();
  bogus.append("file", new Blob(["nao sou um pdf"], { type: "application/pdf" }), "x.pdf");
  const bogusRes = await fetch(`${BASE_URL}/api/crm/import`, { method: "POST", body: bogus });
  assert(bogusRes.status === 422, "importador recusa arquivo que não é PDF válido");

  const noFile = await fetch(`${BASE_URL}/api/crm/import`, { method: "POST" });
  assert(noFile.status === 400, "importador exige o arquivo");

  // 11e) Pedidos & OS — v3.19.0
  const postOrder = (data) =>
    fetch(`${BASE_URL}/api/crud/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", data }),
    });
  const orderItems = [{ description: "Item pedido smoke", quantity: 1, unitPrice: 100 }];

  /* total zerado virava receita de R$ 0,00 no Financeiro */
  const zeroOrder = await postOrder({ items: orderItems, discount: 99999 });
  assert(zeroOrder.status === 422, "pedido não pode ser zerado por desconto");

  const overOrder = await postOrder({ items: orderItems, discount: 500, discountMode: "percent" });
  assert(overOrder.status === 422, "desconto de pedido acima de 100% é recusado");

  const tinyOrder = await postOrder({
    items: [{ description: "micro", quantity: 0.0001, unitPrice: 0.01 }],
  });
  assert(tinyOrder.status === 400, "quantidade irrisória no pedido é recusada");

  /* status fora da lista sumia das abas da tela */
  const badStatus = await postOrder({ items: orderItems, status: "banana" });
  const badStatusBody = await badStatus.json();
  assert(badStatus.status === 400, "status de pedido inválido é recusado");
  assert(
    String(badStatusBody.error || "").includes("Valores aceitos"),
    "erro de status lista os valores aceitos"
  );

  const badProd = await postOrder({ items: orderItems, productionStatus: "voando" });
  assert(badProd.status === 400, "status de produção inválido é recusado");

  const pastDue = await postOrder({ items: orderItems, dueDate: "2020-01-01" });
  assert(pastDue.status === 422, "prazo de entrega no passado é recusado");

  /* fluxo legítimo continua passando ponta a ponta */
  const okOrder = await postOrder({
    items: [{ description: "Banner smoke", quantity: 2, unitPrice: 250 }],
    discount: 10,
    discountMode: "percent",
    financialStatus: "pago",
  });
  const okBody = await okOrder.json();
  assert(okOrder.status === 200, "pedido válido é aceito");
  assert(Number(okBody.row.total) === 450, `desconto percentual aplicado (${okBody.row.total})`);

  const okId = okBody.row.id;
  const [orderTx] = await sql(
    "select count(*)::int as n from transactions where order_id=$1",
    [okId]
  );
  assert(Number(orderTx.n) > 0, "pedido gera lançamento no Financeiro");

  /* cancelamento é idempotente e não duplica estorno */
  const cancels = await Promise.all(
    [1, 2, 3].map(() =>
      fetch(`${BASE_URL}/api/crud/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "cancel", id: okId, reason: "smoke concorrente" }),
      }).then((r) => r.status)
    )
  );
  assert(cancels.filter((s) => s === 200).length >= 1, "cancelamento concorrente responde");
  const [reversals] = await sql(
    "select count(*)::int as n from transactions where order_id=$1 and category='estorno_pedido'",
    [okId]
  );
  assert(Number(reversals.n) === 1, `cancelamento gera um único estorno (${reversals.n})`);

  await sql("delete from transactions where order_id=$1", [okId]);
  await sql("delete from kanban_cards where order_id=$1", [okId]);
  await sql("delete from deliveries where order_id=$1", [okId]);
  await sql("delete from orders where id=$1", [okId]);

  // 11f) Kanban — v3.20.0
  const kb = (body) =>
    fetch(`${BASE_URL}/api/crud/kanban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  await sql("delete from kanban_cards where title like 'SMOKE KB%'");

  /* prazo no passado */
  const kbPast = await kb({
    op: "create",
    data: { title: "SMOKE KB prazo", dueDate: "2020-01-01" },
  });
  assert(kbPast.status === 422, "card do Kanban recusa prazo no passado");

  /* três cards para exercitar a ordenação */
  const kbIds = [];
  for (const n of [1, 2, 3]) {
    const r = await kb({ op: "create", data: { title: `SMOKE KB ${n}`, column: "backlog" } });
    kbIds.push((await r.json()).row.id);
  }

  const inverted = [...kbIds].reverse();
  const kbReorder = await kb({ op: "reorder", column: "backlog", ids: inverted });
  const kbReorderBody = await kbReorder.json();
  assert(kbReorder.status === 200, "reordenar dentro da coluna é aceito");
  assert(kbReorderBody.moved === 0, "reordenar na mesma coluna não move card");

  const ordered = await sql(
    "select id from kanban_cards where id = any($1::int[]) order by \"order\"",
    [kbIds]
  );
  assert(
    ordered.map((r) => Number(r.id)).join(",") === inverted.join(","),
    "ordem escolhida pelo operador é persistida"
  );

  /* card de outra coluna não entra por reorder sem allowMove */
  await sql("update kanban_cards set \"column\"='pronto' where id=$1", [kbIds[0]]);
  const kbForeign = await kb({ op: "reorder", column: "backlog", ids: [kbIds[0]] });
  assert(kbForeign.status === 422, "reorder recusa card de outra coluna sem allowMove");

  /* ids repetidos */
  const kbDup = await kb({ op: "reorder", column: "backlog", ids: [kbIds[1], kbIds[1]] });
  assert(kbDup.status === 422, "reorder recusa ids repetidos");

  /* reorder com allowMove sincroniza o pedido vinculado */
  const kbOrder = await postOrder({
    items: [{ description: "Pedido para kanban", quantity: 1, unitPrice: 120 }],
  });
  const kbOrderId = (await kbOrder.json()).row.id;
  const [kbCard] = await sql("select id from kanban_cards where order_id=$1 limit 1", [kbOrderId]);
  if (kbCard) {
    await kb({ op: "reorder", column: "pronto", ids: [Number(kbCard.id)], allowMove: true });
    const [syncedOrder] = await sql("select production_status from orders where id=$1", [kbOrderId]);
    assert(
      syncedOrder.production_status === "concluido",
      `reorder sincroniza o pedido vinculado (${syncedOrder.production_status})`
    );

    /* a trava de cancelamento vale também no reorder */
    const kbCancel = await kb({
      op: "reorder",
      column: "cancelado",
      ids: [Number(kbCard.id)],
      allowMove: true,
    });
    assert(kbCancel.status === 409, "reorder respeita a trava de cancelamento de pedido");
  }

  await sql("delete from transactions where order_id=$1", [kbOrderId]);
  await sql("delete from kanban_cards where order_id=$1 or title like 'SMOKE KB%'", [kbOrderId]);
  await sql("delete from deliveries where order_id=$1", [kbOrderId]);
  await sql("delete from orders where id=$1", [kbOrderId]);

  // 12) Páginas principais respondem
  for (const path of ["/clientes", "/orcamentos", "/pedidos", "/kanban", "/estoque", "/relatorios", "/financeiro", "/envios", "/cobrancas"]) {
    const res = await fetch(`${BASE_URL}${path}`);
    assert(res.ok, `página ${path} responde`);
  }

  // 13) Período nos relatórios
  const emptyPeriod = await fetch(`${BASE_URL}/relatorios?from=2019-01-01&to=2019-01-31`);
  assert(emptyPeriod.ok, "relatórios respondem com período personalizado");

  console.log("🎉 E2E smoke concluído com sucesso");
}

main()
  .catch((e) => {
    console.error("❌ E2E smoke falhou:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
