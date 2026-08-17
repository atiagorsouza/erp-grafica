// PrintFlow ERP · smoke test ponta a ponta
// Requer servidor rodando. Uso: BASE_URL=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();

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
    type: "pf", name: `E2E Cliente ${stamp}`, email: `e2e-${stamp}@example.com`, phone: "21988887777", status: "lead"
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

  // 6) Páginas principais respondem
  for (const path of ["/clientes", "/orcamentos", "/pedidos", "/kanban", "/estoque", "/relatorios"]) {
    const res = await fetch(`${BASE_URL}${path}`);
    assert(res.ok, `página ${path} responde`);
  }

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
