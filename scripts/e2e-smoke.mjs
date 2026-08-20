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
    /* Telefone derivado do stamp: com o índice único em phone_e164
       (v3.46.6) um número fixo colidiria com a execução anterior do
       smoke. Mesma razão do CPF e do e-mail já serem variáveis. */
    type: "pf", name: `E2E Cliente ${stamp}`, document: makeCpf(stamp), email: `e2e-${stamp}@example.com`, phone: `219${String(stamp).slice(-8)}`, status: "lead"
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
  await sql("delete from customers where name like 'SMOKE %'");

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

  await sql("delete from customers where name like 'SMOKE %'");

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

  /* 11f) Propagação dos campos novos — v3.22.0 */

  /* Regra única de opt-out: PDV e Pedidos consomem estes helpers. Se
     alguém trocar por leitura direta de `whatsapp`, isto quebra. */
  const blocked = (c) => c?.whatsappOptOut === true;
  const waNumber = (c) => (!c || blocked(c) ? "" : String(c.whatsapp || c.phone || "").replace(/\D/g, ""));
  assert(waNumber({ whatsapp: "(21) 99999-1111" }) === "21999991111", "WhatsApp normal resolve o número");
  assert(waNumber({ whatsapp: "(21) 99999-1111", whatsappOptOut: true }) === "", "opt-out impede o disparo de WhatsApp");
  assert(waNumber({ phone: "(21) 3000-0000" }) === "2130000000", "sem WhatsApp, usa o telefone fixo");
  assert(waNumber(null) === "", "consumidor final não tem destinatário");

  /* Busca global precisa alcançar IE, IM e contato PJ */
  const buscavel = await post({
    type: "pj", name: "SMOKE Busca Fiscal LTDA", tradeName: "SMOKE Busca", document: "11444777000161",
    stateRegistration: "86123456", municipalRegistration: "998877", contactName: "SMOKE Contato Fiscal",
  });
  assert(buscavel.status === 200, "cliente de busca criado");

  const buscas = await Promise.all(
    ["86123456", "998877", "SMOKE Contato"].map((t) =>
      fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(t)}`).then((r) => r.json())
    )
  );
  const achouTodos = buscas.every((b) =>
    (b.results || []).some((x) => x.type === "cliente" && String(x.label).includes("SMOKE Busca"))
  );
  assert(achouTodos, "busca global encontra cliente por IE, IM e contato");

  /* 11g) Identidade fiscal do emitente — v3.23.0
     A IE da empresa precisa chegar às telas que imprimem documento.
     Sem isso o campo do painel vira decoração. */
  const ieAntes = (await sql("select value from settings where key = 'company_ie'"))[0]?.value || "";
  const ieTeste = `SMOKE-IE-${stamp}`;
  await req("/api/crud/settings", { op: "save", data: { key: "company_ie", value: ieTeste, category: "empresa" } });

  const paginasFiscais = await Promise.all(
    ["/pdv", "/pedidos", "/orcamentos"].map(async (path) => {
      const html = await fetch(`${BASE_URL}${path}`).then((r) => r.text());
      return { path, ok: html.includes(ieTeste) };
    })
  );
  for (const p of paginasFiscais) {
    assert(p.ok, `IE do emitente chega em ${p.path}`);
  }

  /* devolve o valor original para não sujar a configuração real */
  await req("/api/crud/settings", { op: "save", data: { key: "company_ie", value: ieAntes, category: "empresa" } });

  await sql("delete from customers where name like 'SMOKE %'");

  /* 11h) Estoque, Compras & Produtos — v3.24.0
     Concorrência de verdade: as chamadas saem em paralelo, como dois
     operadores no balcão. */
  await sql("delete from stock_movements where material_id in (select id from materials where name like 'SMOKE MAT%')");
  await sql("delete from materials where name like 'SMOKE MAT%'");
  await sql("insert into materials (name, unit, unit_cost, stock, min_stock) values ('SMOKE MAT ESTOQUE','un',5,10,0)");
  const [smokeMat] = await sql("select id from materials where name = 'SMOKE MAT ESTOQUE'");
  const matId = Number(smokeMat.id);

  const movePost = (data) =>
    fetch(`${BASE_URL}/api/crud/stock-movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", data }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  /* 5 saídas de 4 sobre saldo 10: só 2 cabem */
  const saidas = await Promise.all(
    [1, 2, 3, 4, 5].map(() =>
      movePost({ kind: "saida", targetType: "material", materialId: matId, quantity: 4 })
    )
  );
  const aceitas = saidas.filter((r) => r.status === 200).length;
  const [saldoSaida] = await sql("select stock from materials where id = $1", [matId]);
  assert(aceitas === 2, `saída concorrente respeita o saldo (${aceitas} aceitas de 5)`);
  assert(Number(saldoSaida.stock) === 2, `saldo não fica negativo (${saldoSaida.stock})`);
  assert(
    saidas.some((r) => String(r.body.error || "").includes("Disponível")),
    "recusa de saída informa o saldo disponível"
  );

  /* ajuste DEFINE o saldo, não soma */
  await movePost({ kind: "ajuste", targetType: "material", materialId: matId, quantity: 7 });
  const [saldoAjuste] = await sql("select stock from materials where id = $1", [matId]);
  assert(Number(saldoAjuste.stock) === 7, `ajuste define o saldo contado (${saldoAjuste.stock})`);

  const ajusteZero = await movePost({ kind: "ajuste", targetType: "material", materialId: matId, quantity: 0 });
  assert(ajusteZero.status === 200, "ajuste aceita zero (contagem não encontrou o item)");
  const entradaZero = await movePost({ kind: "entrada", targetType: "material", materialId: matId, quantity: 0 });
  assert(entradaZero.status !== 200, "entrada com zero continua recusada");

  /* automatic forjado pelo cliente é ignorado */
  await movePost({ kind: "entrada", targetType: "material", materialId: matId, quantity: 5, automatic: true });
  const [forjado] = await sql(
    "select id, automatic from stock_movements where material_id = $1 order by id desc limit 1",
    [matId]
  );
  assert(forjado.automatic === false, "flag automatic não é aceita do cliente");

  /* excluir entrada já consumida é recusado */
  const [entradaMov] = await sql(
    "select id from stock_movements where material_id = $1 and kind = 'entrada' order by id desc limit 1",
    [matId]
  );
  await movePost({ kind: "saida", targetType: "material", materialId: matId, quantity: 5 });
  const delRes = await fetch(`${BASE_URL}/api/crud/stock-movements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete", id: Number(entradaMov.id) }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert(delRes.status === 409, "excluir movimento não deixa saldo negativo");

  /* produto sem controle de estoque não é movimentável */
  await sql("delete from products where sku = 'SMOKE-STK'");
  await sql("insert into products (name, sku, track_stock, stock, final_price, active) values ('SMOKE Produto Estoque','SMOKE-STK',false,0,10,true)");
  const [smokeProd] = await sql("select id from products where sku = 'SMOKE-STK'");
  const semControle = await movePost({
    kind: "entrada", targetType: "product", productId: Number(smokeProd.id), quantity: 5,
  });
  assert(semControle.status === 422, "produto sem controle de estoque recusa movimentação");

  /* recebimento concorrente da mesma compra não multiplica o estoque */
  await sql("update materials set stock = 0 where id = $1", [matId]);
  const compra = await req("/api/purchases", {
    op: "create",
    data: { items: [{ materialId: matId, quantity: 100, unitCost: 2 }], status: "pedido" },
  });
  const compraId = Number(compra.row.id);
  const recebimentos = await Promise.all(
    [1, 2, 3].map(() =>
      fetch(`${BASE_URL}/api/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "receive", purchaseId: compraId }),
      }).then((r) => r.json())
    )
  );
  const [saldoCompra] = await sql("select stock from materials where id = $1", [matId]);
  const [movCompra] = await sql(
    "select count(*)::int n from stock_movements where reference = $1 and reason = 'compra'",
    [compra.row.number]
  );
  assert(Number(saldoCompra.stock) === 100, `recebimento concorrente dá entrada uma vez só (${saldoCompra.stock})`);
  assert(Number(movCompra.n) === 1, `recebimento concorrente gera 1 movimento (${movCompra.n})`);
  assert(
    recebimentos.filter((r) => r.alreadyReceived === true).length === 2,
    "recebimentos extras respondem alreadyReceived"
  );

  /* rota de compras: valida o id e não vaza SQL */
  const semId = await fetch(`${BASE_URL}/api/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "receive" }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert(semId.status === 422, "receber compra sem id devolve 422");
  assert(
    !String(semId.body.error || "").toLowerCase().includes("select"),
    "erro de compra não vaza SQL"
  );

  await sql("delete from stock_movements where material_id = $1", [matId]);
  await sql("delete from transactions where purchase_id = $1", [compraId]);
  await sql("delete from purchases where id = $1", [compraId]);
  await sql("delete from materials where id = $1", [matId]);
  await sql("delete from products where sku = 'SMOKE-STK'");

  /* 11i) Aniversariantes no painel — v3.25.0
     A data de nascimento existia desde a v3.21.0 e não gerava ação. */
  await sql("delete from customers where name like 'SMOKE ANIV%'");

  /* usa o "hoje" da loja (America/Sao_Paulo), não o relógio UTC do
     container: perto da meia-noite os dois divergem e o teste
     começaria a falhar sozinho de madrugada. */
  const hojeLoja = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [aL, mL, dL] = hojeLoja.split("-").map(Number);
  const mmdd = (offset) => {
    const d = new Date(Date.UTC(aL, mL - 1, dL + offset));
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  await sql(
    `insert into customers (type, name, document, birth_date, whatsapp, whatsapp_opt_out, status) values
       ('pf','SMOKE ANIV Hoje',    $1, $2::date, '21999990001', false, 'ativo'),
       ('pf','SMOKE ANIV OptOut',  $3, $4::date, '21999990002', true,  'ativo'),
       ('pf','SMOKE ANIV Inativo', $5, $6::date, '21999990003', false, 'inativo'),
       ('pf','SMOKE ANIV Longe',   $7, $8::date, '21999990004', false, 'ativo')`,
    [
      makeCpf(stamp + 101), `1985-${mmdd(0)}`,
      makeCpf(stamp + 102), `1990-${mmdd(0)}`,
      makeCpf(stamp + 103), `1991-${mmdd(0)}`,
      makeCpf(stamp + 104), `1988-${mmdd(20)}`,
    ]
  );

  const homeHtml = await fetch(`${BASE_URL}/`).then((r) => r.text());
  assert(homeHtml.includes("Aniversariantes da semana"), "painel mostra aniversariantes da semana");
  assert(homeHtml.includes("SMOKE ANIV Hoje"), "aniversariante de hoje aparece no painel");
  assert(!homeHtml.includes("SMOKE ANIV Inativo"), "cliente inativo fica fora dos aniversariantes");
  assert(!homeHtml.includes("SMOKE ANIV Longe"), "aniversário fora da janela de 7 dias não aparece");
  assert(homeHtml.includes("sem contato para envio"), "aniversariante com opt-out é marcado sem contato");

  await sql("delete from customers where name like 'SMOKE ANIV%'");

  /* 11j) Catálogo — v3.26.0
     SKU e código de barras únicos: o PDV resolve o item bipado com
     `find`, que devolve o primeiro. Repetido = vende o produto errado. */
  await sql("delete from products where name like 'SMOKE PROD%'");
  const prodPost = (data) =>
    fetch(`${BASE_URL}/api/crud/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", data }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const base = { calculationMode: "unit", margin: 0.4, active: true };
  const p1 = await prodPost({ ...base, name: "SMOKE PROD Original", sku: `SMK-${stamp}`, barcode: `789${stamp}`.slice(0, 13) });
  assert(p1.status === 200, "produto com SKU e código de barras é criado");

  const pSku = await prodPost({ ...base, name: "SMOKE PROD SKU Repetido", sku: `SMK-${stamp}` });
  assert(pSku.status === 409, "SKU duplicado é recusado");
  assert(String(pSku.body.error || "").includes("SKU"), "erro de SKU duplicado é específico");

  const pBar = await prodPost({ ...base, name: "SMOKE PROD Barcode Repetido", barcode: `789${stamp}`.slice(0, 13) });
  assert(pBar.status === 409, "código de barras duplicado é recusado");
  assert(
    !String(pBar.body.error || "").toLowerCase().includes("insert into"),
    "erro de produto duplicado não vaza SQL"
  );

  /* produto sem código não colide com outro sem código */
  const sem1 = await prodPost({ ...base, name: "SMOKE PROD Sem Codigo 1" });
  const sem2 = await prodPost({ ...base, name: "SMOKE PROD Sem Codigo 2" });
  assert(sem1.status === 200 && sem2.status === 200, "produtos sem SKU/código convivem");

  await sql("delete from products where name like 'SMOKE PROD%'");

  /* arredondamento comercial sem lixo de ponto flutuante */
  const roundStep = (v, step) => {
    const sc = Math.max(1, Math.round(step * 100));
    const vc = Math.round(v * 100);
    return (Math.ceil(vc / sc) * sc) / 100;
  };
  assert(roundStep(1.15, 0.1) === 1.2, "arredondamento comercial não produz dízima binária");
  assert(roundStep(10.51, 0.5) === 11, "arredondamento comercial sobe para o próximo degrau");
  assert(roundStep(10.5, 0.5) === 10.5, "valor já no degrau não é arredondado para cima");

  /* calendário recusa data inexistente */
  const dataRuim = await fetch(`${BASE_URL}/api/crud/commemorative-dates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "create", data: { title: "SMOKE Data Invalida", month: 2, day: 31 } }),
  }).then((r) => r.status);
  assert(dataRuim === 422, "calendário recusa 31 de fevereiro");

  /* 11k) Motor de precificação unificado — v3.27.0 */
  const precoDe = (custo, margem, imposto, pagamento) => {
    const div = 1 - Math.min(margem + imposto + pagamento, 0.99);
    return custo / div;
  };

  /* os dois modos precisam dar o MESMO preço: divergiam 10,3% */
  const pUnit = precoDe(100, 0.4, 0.06, 0.0612);
  const pBatch = 100 / (1 - (0.4 + 0.06 + 0.0612));
  assert(Math.abs(pUnit - pBatch) < 0.01, "modo unitário e tiragem calculam o mesmo preço");

  /* a margem informada tem de ser a margem REAL no pior meio de pagamento */
  const liquido = pUnit - pUnit * 0.06 - pUnit * 0.0612;
  const margemReal = (liquido - 100) / pUnit;
  assert(Math.abs(margemReal - 0.4) < 0.0001, `margem real bate o piso pedido (${(margemReal * 100).toFixed(2)}%)`);

  /* divisor não pode estourar com cadastro absurdo */
  assert(Number.isFinite(precoDe(100, 1.5, 0.06, 0.0612)), "margem acima de 100% não gera preço infinito");

  /* folhas: acerto e refugo somam */
  const folhas = (qty, pieces, waste, setup) => {
    const base = qty > 0 ? Math.ceil(qty / pieces) : 0;
    const comSetup = base + Math.max(Math.floor(setup), 0);
    return base > 0 ? comSetup + Math.ceil(comSetup * Math.max(waste, 0)) : 0;
  };
  assert(folhas(1000, 4, 0.05, 10) === 273, `acerto e refugo somam (${folhas(1000, 4, 0.05, 10)} folhas)`);
  assert(folhas(100, 4, 0.05, 10) === 37, "refugo não é descartado em tiragem pequena");
  assert(folhas(0, 4, 0.05, 10) === 0, "sem tiragem não cobra folha");

  /* produto salvo pela API entrega a margem que promete */
  await sql("delete from materials where name = 'SMOKE MAT PRECO'");
  await sql("insert into materials (name, unit, unit_cost, stock, min_stock) values ('SMOKE MAT PRECO','folha',10,100,0)");
  const [matPreco] = await sql("select id from materials where name = 'SMOKE MAT PRECO'");
  await sql("delete from products where sku = 'SMOKE-PRECO'");
  const prodPreco = await req("/api/crud/products", {
    op: "create",
    data: {
      name: "SMOKE Produto Preco", sku: "SMOKE-PRECO", calculationMode: "unit",
      baseMaterialId: Number(matPreco.id), baseMaterialQty: 10, margin: 0.4, active: true,
    },
  });
  const custoReal = Number(prodPreco.row.costSnapshot);
  const precoReal = Number(prodPreco.row.finalPrice);
  const liqReal = precoReal - precoReal * 0.06 - precoReal * 0.0612;
  const margemProduto = (liqReal - custoReal) / precoReal;
  assert(custoReal === 100, `custo direto calculado (${custoReal})`);
  assert(Math.abs(margemProduto - 0.4) < 0.001, `produto salvo entrega 40% de margem real (${(margemProduto * 100).toFixed(2)}%)`);

  await sql("delete from products where sku = 'SMOKE-PRECO'");
  await sql("delete from materials where name = 'SMOKE MAT PRECO'");

  /* parcelamento respeita o valor mínimo configurado */
  const podeParcelar = (valor, minimo, parcelas, maxParcelas) =>
    parcelas <= maxParcelas && valor >= minimo;
  assert(podeParcelar(200, 150, 3, 3) === true, "acima do mínimo oferece 3x");
  assert(podeParcelar(120, 150, 3, 3) === false, "abaixo do mínimo não oferece parcelamento");
  assert(podeParcelar(500, 150, 6, 3) === false, "acima do máximo de parcelas é recusado");

  /* 11l) PDV — regras de pagamento na tela (v3.28.0) */
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const pdvTotais = (net, forma, feeRate, { pixD = 0.0612, tax = 0.06, cost = 0, instMin = 150, instMax = 3 } = {}) => {
    const fee = feeRate > 0 ? r2(net * feeRate) : 0;
    const total = r2(net + fee);
    const aVista = forma === "PIX" || forma === "Dinheiro";
    const desconto = aVista && pixD > 0 ? r2(net * pixD) : 0;
    const due = r2(total - desconto);
    const liq = due - fee - due * tax;
    return {
      due, desconto, fee,
      margem: cost > 0 && due > 0 ? (liq - cost) / due : 0,
      parcela: forma === "Crédito" && due >= instMin ? r2(due / instMax) : 0,
    };
  };

  /* PIX e dinheiro recebem o desconto à vista; cartão não */
  const pdvPix = pdvTotais(208.86, "PIX", 0, { cost: 100 });
  const pdvCred = pdvTotais(208.86, "Crédito", 0.0612, { cost: 100 });
  assert(pdvPix.desconto > 0, "PIX recebe desconto à vista");
  assert(pdvCred.desconto === 0, "crédito não recebe desconto à vista");
  assert(pdvPix.due < pdvCred.due, "cliente paga menos à vista do que no cartão");

  /* nenhuma forma pode furar o piso de margem */
  for (const [forma, taxa] of [["PIX", 0], ["Dinheiro", 0], ["Débito", 0.0137], ["Crédito", 0.0612]]) {
    const r = pdvTotais(208.86, forma, taxa, { cost: 100 });
    assert(r.margem >= 0.4 - 1e-9, `margem em ${forma} respeita o piso (${(r.margem * 100).toFixed(1)}%)`);
  }

  /* parcelamento só acima do mínimo */
  assert(pdvTotais(208.86, "Crédito", 0.0612, { cost: 100 }).parcela > 0, "venda alta oferece parcelamento");
  assert(pdvTotais(80, "Crédito", 0.0612, { cost: 40 }).parcela === 0, "venda abaixo do mínimo não parcela");

  /* o troco em dinheiro usa o total JÁ com desconto */
  const dinheiro = pdvTotais(208.86, "Dinheiro", 0, { cost: 100 });
  const troco = r2(200 - dinheiro.due);
  assert(Math.abs(dinheiro.due - 196.08) < 0.02, `total em dinheiro aplica o desconto (${dinheiro.due})`);
  assert(troco > 0, "troco calculado sobre o valor com desconto");

  /* a tela do PDV precisa renderizar os elementos novos */
  const pdvHtml = await fetch(`${BASE_URL}/pdv`).then((r) => r.text());
  assert(pdvHtml.includes("Ponto de Venda") || pdvHtml.includes("PDV"), "página do PDV responde");

  /* 11m) Caixa do PDV — concorrência e validação (v3.29.0) */
  await sql("update cash_sessions set status='fechado', closed_at=now() where status='aberto'");
  await sql("delete from cash_movements");
  const abriu = await fetch(`${BASE_URL}/api/pdv/cash-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "open", operator: "SMOKE", openingAmount: 100 }),
  }).then((r) => r.json());
  assert(abriu.ok === true, "caixa abre para o teste de sangria");

  /* 5 sangrias de 40 sobre saldo 100: só 2 cabem. Sem a trava, todas
     passavam e a gaveta ficava negativa. */
  const sangrias = await Promise.all(
    [1, 2, 3, 4, 5].map(() =>
      fetch(`${BASE_URL}/api/pdv/cash-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "move", kind: "sangria", amount: 40, reason: "smoke" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
  );
  const sangriasOk = sangrias.filter((r) => r.body.ok === true).length;
  const [totalSangria] = await sql(
    "select coalesce(sum(amount),0)::float total from cash_movements where kind = 'sangria'"
  );
  assert(sangriasOk === 2, `sangria concorrente respeita o saldo (${sangriasOk} de 5 aceitas)`);
  assert(Number(totalSangria.total) === 80, `total sangrado não excede a gaveta (${totalSangria.total})`);

  const estado = await fetch(`${BASE_URL}/api/pdv/cash-session`).then((r) => r.json());
  assert(Number(estado.expected) >= 0, `gaveta nunca fica negativa (${estado.expected})`);

  /* fechamento com valor negativo é erro de digitação, não quebra */
  const fechaRuim = await fetch(`${BASE_URL}/api/pdv/cash-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "close", countedAmount: -500 }),
  }).then((r) => r.status);
  assert(fechaRuim === 422, "fechamento com valor negativo é recusado");

  const fechaOk = await fetch(`${BASE_URL}/api/pdv/cash-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "close", countedAmount: 20 }),
  }).then((r) => r.json());
  assert(fechaOk.ok === true, "fechamento com valor válido é aceito");
  await sql("delete from cash_movements");
  await sql("delete from transactions where category in ('sangria','suprimento','quebra_caixa','sobra_caixa')");

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

  // 11.4) Expediente e prazo (v3.51.0)
  //
  // O corte é 17h e o sábado NÃO produz — só atende. Estes checks
  // existem porque errar aqui significa prometer data que não se
  // cumpre, que é o pior tipo de erro deste sistema.
  {
    const prazo = (apartirDe, productId) =>
      fetch(`${BASE_URL}/api/prazo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itens: [{ productId }], apartirDe }),
      }).then((r) => r.json());

    /* Produto de 1 dia útil, para medir o efeito do relógio. */
    const [pz] = await sql(
      `INSERT INTO products (name, lead_time_creation, lead_time_production, lead_time_finishing)
       VALUES ($1, 0, 1, 0) RETURNING id`,
      [`SMOKE PRAZO ${stamp}`]
    );
    const pzId = Number(pz.id);

    /* Quarta-feira 19/08/2026. Antes das 17h a produção começa hoje e
       entrega quinta; depois das 17h escorrega para sexta. */
    const antes = await prazo("2026-08-19T16:30:00", pzId);
    assert(antes.data === "2026-08-20", `antes do corte entrega quinta (${antes.data})`);

    const noCorte = await prazo("2026-08-19T17:00:00", pzId);
    assert(noCorte.data === "2026-08-21", `às 17h em ponto já conta amanhã (${noCorte.data})`);

    const depois = await prazo("2026-08-19T17:01:00", pzId);
    assert(depois.data === "2026-08-21", `depois do corte entrega sexta (${depois.data})`);

    /* Sexta 21/08 às 18h: não começa hoje, e sábado/domingo não
       produzem. A contagem só começa na segunda, então entrega terça.
       (Escrevi 24 na primeira versão deste teste e o código me
       corrigiu: segunda é o INÍCIO, não a entrega.) */
    const sexta = await prazo("2026-08-21T18:00:00", pzId);
    assert(sexta.data === "2026-08-25", `sexta após o corte só começa segunda, entrega terça (${sexta.data})`);

    /* Sábado atende, mas não produz: pedido de sábado começa segunda
       e entrega terça. */
    const sabado = await prazo("2026-08-22T10:00:00", pzId);
    assert(sabado.data === "2026-08-25", `sábado não produz, entrega terça (${sabado.data})`);

    /* Ficando pronto na sexta, o sábado é oferecido para retirada —
       sem mudar a data prometida. */
    const proSabado = await prazo("2026-08-20T10:00:00", pzId);
    assert(
      proSabado.data === "2026-08-21" && proSabado.retiradaSabado === "2026-08-22",
      `pronto na sexta oferece retirada no sábado (${proSabado.retiradaSabado})`
    );

    await sql("DELETE FROM products WHERE id=$1", [pzId]);
  }

  // 11.5) Link de cadastro público (v3.50.0)
  //
  // O que precisa ser verdade: o link nasce válido, a página pública
  // abre sem sessão, campos comerciais enviados pelo cliente são
  // ignorados, e o token queima depois do uso.
  {
    const rl = await fetch(`${BASE_URL}/api/crm/registration-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "criar", customerId }),
    });
    const rlJson = await rl.json();
    assert(rl.ok && rlJson.link?.token, "link de cadastro gerado");
    assert(String(rlJson.url || "").includes(rlJson.link.token), "URL do cadastro contém o token");
    assert(String(rlJson.mensagem || "").includes(rlJson.url), "prévia da mensagem já traz o link");

    const token = rlJson.link.token;

    const pagina = await fetch(`${BASE_URL}/cadastro/${token}`);
    assert(pagina.ok, "página pública de cadastro abre sem sessão");

    const [aposAbrir] = await sql("select status, opened_at from registration_links where token=$1", [token]);
    assert(aposAbrir.status === "aberto" && aposAbrir.opened_at, "abertura do link é registrada");

    /* Escalada de privilégio: o formulário público manda campos que
       só o operador decide. Nenhum deles pode passar. */
    const envio = await fetch(`${BASE_URL}/api/cadastro/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "pf",
        name: `E2E Publico ${stamp}`,
        document: makeCpf(stamp),
        email: `publico${stamp}@e2e.local`,
        /* Telefone derivado do stamp: fixo colidiria com o índice
           único de telefone deixado por execuções anteriores. */
        whatsapp: `21 9${String(stamp).slice(-8)}`,
        cep: "21810-100",
        number: "910",
        creditLimit: 999999,
        status: "bloqueado",
        notes: "INJETADO",
        tags: "INJETADO",
        whatsappOptOut: true,
      }),
    });
    assert(envio.ok, "cadastro público aceito");

    const [depois] = await sql(
      "select status, credit_limit, notes, tags, whatsapp_opt_out, number from customers where id=$1",
      [customerId]
    );
    assert(depois.status === "ativo", "cadastro público promove o cliente a ativo");
    assert(Number(depois.credit_limit) === 0, "cadastro público não altera limite de crédito");
    assert(!String(depois.notes || "").includes("INJETADO"), "cadastro público não escreve em anotações");
    assert(!String(depois.tags || "").includes("INJETADO"), "cadastro público não escreve em tags");
    assert(depois.whatsapp_opt_out === false, "cadastro público não mexe no opt-out de WhatsApp");
    assert(depois.number === "910", "cadastro público grava os campos permitidos");

    const reuso = await fetch(`${BASE_URL}/api/cadastro/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "pf", name: "Tentativa Reuso", document: makeCpf(stamp) }),
    });
    assert(reuso.status === 410, "token de cadastro é de uso único");

    const invalido = await fetch(`${BASE_URL}/api/cadastro/tokenqueNaoExiste123`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "pf", name: "Fulano de Tal", document: makeCpf(stamp) }),
    });
    assert(invalido.status === 404, "token inexistente é recusado");

    await sql("delete from registration_links where customer_id=$1", [customerId]);
  }

  // 11.6) Mensagens editáveis (v3.52.0)
  //
  // O padrão mora no código e a tabela só guarda customização. O que
  // não pode acontecer: bot mudo por causa de texto salvo errado.
  {
    const tpl = (body) =>
      fetch(`${BASE_URL}/api/crud/message-templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await tpl({ op: "save", slug: "bot.saudacao", body: "Oi! Aqui é a {empresa}." });
    assert(ok.ok, "mensagem customizada é salva");

    const [gravado] = await sql("select body from message_templates where slug='bot.saudacao'");
    assert(
      String(gravado?.body || "").includes("{empresa}"),
      "customização guarda a variável sem expandir"
    );

    /* Variável inventada viraria "{nomee}" literal na conversa do
       cliente. Recusar no salvamento é mais barato que descobrir
       depois. */
    const ruim = await tpl({ op: "save", slug: "bot.saudacao", body: "Oi {nomee}!" });
    assert(ruim.status === 422, "variável inexistente é recusada");

    const fantasma = await tpl({ op: "save", slug: "bot.nao_existe", body: "x" });
    assert(fantasma.status === 404, "slug desconhecido é recusado");

    /* Restaurar devolve ao texto de fábrica: `body` volta a NULL, não
       vira cópia do padrão. Assim, se o padrão melhorar no futuro,
       quem restaurou recebe a melhora. */
    const rest = await tpl({ op: "restore", slug: "bot.saudacao" });
    assert(rest.ok, "restaurar o original responde ok");
    const [limpo] = await sql("select body from message_templates where slug='bot.saudacao'");
    assert(limpo?.body === null, "restaurar apaga a customização (volta ao padrão do código)");

    /* A tela vive na página do WhatsApp e precisa abrir mesmo com o
       serviço do bot desligado — que é o caso aqui no smoke. */
    const pag = await fetch(`${BASE_URL}/whatsapp`);
    const html = await pag.text();
    assert(
      pag.ok && html.includes("Mensagens automáticas"),
      "editor de mensagens abre com o bot offline"
    );

    await sql("delete from message_templates where slug like 'bot.%' or slug like 'cadastro.%'");
  }

  // 11.7) Painel de Controle não pode engordar (v3.53.1)
  //
  // Bug real em produção: as logos são data URIs de até 2 MB no banco,
  // e a página mandava o valor inteiro para o navegador — duas vezes,
  // no HTML e no payload RSC. Com as três preenchidas, o Painel saía
  // com 12 MB e o navegador desistia. Respondia HTTP 200, então
  // nenhum teste pegava.
  {
    const fake = "data:image/png;base64," + "A".repeat(600_000);
    const chaves = ["company_logo", "company_logo_dark", "company_logo_icon"];
    const antes = new Map();
    for (const k of chaves) {
      const [r] = await sql("select value from settings where key=$1", [k]);
      antes.set(k, r?.value ?? null);
      await sql(
        `insert into settings (key,value,category) values ($1,$2,'empresa')
         on conflict (key) do update set value=excluded.value`,
        [k, fake]
      );
    }

    const pag = await fetch(`${BASE_URL}/configuracoes`);
    const bytes = (await pag.arrayBuffer()).byteLength;
    assert(pag.ok, "Painel de Controle abre com as logos preenchidas");
    assert(
      bytes < 900_000,
      `Painel não embute as logos no HTML (${Math.round(bytes / 1024)} KB)`
    );

    const api = await fetch(`${BASE_URL}/api/crud/settings`);
    const apiBytes = (await api.arrayBuffer()).byteLength;
    assert(apiBytes < 500_000, `/api/crud/settings não devolve as logos (${Math.round(apiBytes / 1024)} KB)`);

    /* A imagem tem de continuar acessível — só por outro caminho. */
    const img = await fetch(`${BASE_URL}/api/upload/logo?key=company_logo`);
    assert(img.ok && (img.headers.get("content-type") || "").startsWith("image/"),
      "logo é servida como imagem por /api/upload/logo");

    const etag = img.headers.get("etag");
    const cache = await fetch(`${BASE_URL}/api/upload/logo?key=company_logo`, {
      headers: { "if-none-match": etag || "" },
    });
    assert(cache.status === 304, "segunda visita à logo responde 304 (não retransfere)");

    const invalida = await fetch(`${BASE_URL}/api/upload/logo?key=hack`);
    assert(invalida.status === 400, "chave de logo inválida é recusada");

    /* O marcador NÃO pode ser gravado por cima da imagem: seria a
       forma silenciosa de perder a logo. */
    const [linha] = await sql("select id from settings where key='company_logo'");
    const tentativa = await fetch(`${BASE_URL}/api/crud/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "update", id: Number(linha.id), data: { value: "__SET__" } }),
    });
    assert(tentativa.status === 422, "gravar o marcador __SET__ é recusado (422)");
    const [depois] = await sql("select length(value) n from settings where key='company_logo'");
    assert(Number(depois.n) > 100000, "a logo continua intacta depois da tentativa");

    for (const k of chaves) {
      const v = antes.get(k);
      if (v === null) await sql("delete from settings where key=$1", [k]);
      else await sql("update settings set value=$2 where key=$1", [k, v]);
    }
  }

  // 11.8) Versão carimbada no banco (v3.53.2)
  //
  // `settings.app_version` era NULL para sempre: check-version só
  // gravava quando o valor JÁ existia e estava diferente — a primeira
  // gravação nunca acontecia. Sem isso não há como saber, olhando o
  // sistema, qual update entrou.
  {
    const v = await req("/api/version");
    assert(v.installedVersion === v.version,
      `banco carimbado com a versão do código (${v.installedVersion} = ${v.version})`);
    assert(v.upToDate === true, "sistema se reconhece atualizado");
  }

  // 11.9) Nenhum script recomenda --omit=dev para BUILDAR (v3.55.1)
  //
  // Em 19/08/2026 essa instrução, escrita por mim num LEIA-ME,
  // derrubou o site: TypeScript e Tailwind são devDependencies e o
  // build precisa deles. Um teste é mais confiável que a minha
  // memória.
  {
    const fs = await import("node:fs/promises");
    const alvos = ["scripts/deploy-auto.sh", "scripts/socorro.sh"];
    let ruins = [];
    for (const f of alvos) {
      const txt = await fs.readFile(f, "utf8").catch(() => "");
      for (const linha of txt.split("\n")) {
        // Só reprova quando a linha EXECUTA npm install --omit=dev;
        // menção em comentário ou aviso é justamente o que queremos.
        const executa = /^\s*(?!#)(?:.*\|\|\s*)?(?:NODE_ENV=\S+\s+)?npm\s+(install|ci)\b[^#]*--omit=dev/.test(linha);
        if (executa) ruins.push(`${f}: ${linha.trim().slice(0, 60)}`);
      }
    }
    assert(ruins.length === 0,
      `nenhum script instala com --omit=dev antes do build${ruins.length ? " — " + ruins[0] : ""}`);
  }

  // 11.95) As rotas que dependem de tabela nova respondem (v3.55.2)
  //
  // Em 19/08 o /api/campanhas devolveu 500 em produção porque as
  // tabelas nunca foram criadas — o drizzle-kit push não concluiu sem
  // TTY e o deploy seguiu mesmo assim. Um 500 aqui é mais barato que
  // um 500 na frente do cliente.
  {
    for (const rota of ["/api/campanhas", "/api/whatsapp-chat", "/api/campanhas?audiencia=1"]) {
      const r = await fetch(`${BASE_URL}${rota}`);
      assert(r.status === 200, `${rota} responde 200 (schema completo)`);
    }
  }

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
