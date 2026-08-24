#!/usr/bin/env node
/**
 * Corrige o que a auditoria de custo encontrou.
 *
 * A revisão pedida pelo dono achou três problemas diferentes. O mais
 * grave era o meu, na agenda.
 *
 * ─── 1. AGENDA: faces contadas duas vezes ─────────────────────────
 *
 * Gravei `pages_per_unit=186` E `print_sides=2`. O motor multiplica um
 * pelo outro: 372 impressões, quando o dono disse 365. Pior, sem
 * formato definido o motor assume a cobertura de referência e a conta
 * de impressão dava R$ 29,19 — mais que o produto inteiro vendido.
 *
 * No modo unitário as faces JÁ estão contadas em `pages_per_unit`
 * (está escrito no comentário do próprio pricing.ts). Então:
 * pages_per_unit = 365 (as impressões reais), print_sides = 1, e
 * formato "A4 texto 5%", que é o que uma agenda de miolo escrito é.
 *
 * ─── 2. XEROX E ENCADERNAÇÃO: cost_snapshot zerado ou defasado ────
 *
 * COP-PB-A4 e COP-COR-A4 estavam com custo ZERO. ENC-050/070/100
 * tinham só o preço do espiral, sem a impressão. Nenhum quebrava
 * venda, mas todo relatório de margem mentia.
 *
 * ─── 3. ADESIVOS: cost_snapshot alto demais ───────────────────────
 *
 * Gravado R$ 5,48 por folha; o motor calcula R$ 3,03. A diferença é
 * que o R$ 5,48 do documento somava DUAS folhas de vinil e DUAS
 * impressões (a cartela de teste usava frente e verso), mas o produto
 * cadastrado é de uma folha só. O motor está certo.
 *
 * O preço de venda NÃO muda em nenhum caso — quem manda é a régua que
 * o dono já pratica. O que muda é o custo passar a ser verdade.
 *
 * Simula por padrão.  node scripts/corrigir-custos-produtos.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/** Espelha computePrintSheetCost de src/lib/pricing.ts. */
async function custoPagina(printerId, categoryId, formatId, colorMode, sides) {
  const cat = (await c.query(`select * from printer_categories where id=$1`, [categoryId])).rows[0];
  if (!cat) return 0;
  const cons = (await c.query(`select * from printer_consumables where category_id=$1`, [categoryId])).rows;
  const fmt = formatId ? (await c.query(`select * from print_formats where id=$1`, [formatId])).rows[0] : null;
  const prt = printerId ? (await c.query(`select * from printers where id=$1`, [printerId])).rows[0] : null;

  const aplica = cons.filter((x) =>
    colorMode === "mono" ? x.applies_to === "mono" || x.applies_to === "both"
                         : x.applies_to === "color" || x.applies_to === "both");
  const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);
  const baseCov = Math.max(Number(cat.reference_coverage) || 0.05, 0.0001);
  const cov = fmt ? Number(fmt.ink_coverage) : baseCov;
  const area = fmt ? Number(fmt.area_factor) : 1;
  const corante = aplica.filter((x) => (x.cost_role || "colorant") === "colorant").reduce((s, x) => s + rende(x), 0);
  const mecanico = aplica.filter((x) => (x.cost_role || "colorant") !== "colorant").reduce((s, x) => s + rende(x), 0);
  const bruto = (corante * (cov / baseCov) + mecanico + Number(cat.fixed_cost_per_page || 0)) * area * sides;
  return bruto * (1 + Number(cat.waste_factor || 0)) * Number(prt?.cost_multiplier || 1);
}

/** Ajustes de cadastro (não de preço). */
const AJUSTES = {
  "AGE-A5-186": {
    pages_per_unit: 365, // as impressões reais que o dono informou
    print_sides: 1, // no modo unit as faces já estão em pages_per_unit
    print_format_id: 21, // A4 texto 5% — miolo de agenda é texto
    motivo: "faces contavam duas vezes e faltava formato",
  },
};

const prods = (await c.query(`select * from products order by sku`)).rows;
const plano = [];

for (const p of prods) {
  const aj = AJUSTES[p.sku] || {};
  const pgs = aj.pages_per_unit ?? (Number(p.pages_per_unit) || 1);
  const faces = aj.print_sides ?? (Number(p.print_sides) || 1);
  const fmtId = aj.print_format_id ?? p.print_format_id;

  const base = p.base_material_id
    ? (await c.query(`select name, unit_cost from materials where id=$1`, [p.base_material_id])).rows[0] : null;
  const mats = (await c.query(
    `select m.unit_cost, pm.quantity from product_materials pm
       join materials m on m.id=pm.material_id where pm.product_id=$1`, [p.id])).rows;
  const fins = (await c.query(
    `select f.unit_cost, pf.quantity from product_finishings pf
       join finishing_items f on f.id=pf.finishing_id where pf.product_id=$1`, [p.id])).rows;
  const svc = p.base_service_id
    ? (await c.query(`select base_cost from services where id=$1`, [p.base_service_id])).rows[0] : null;

  const porPagina = await custoPagina(p.printer_id, p.printer_category_id, fmtId, p.color_mode, faces);
  let calc = 0;

  if (p.calculation_mode === "batch") {
    const folha = Number(base?.unit_cost || 0) * Number(p.base_material_qty || 1);
    calc = (folha + porPagina + Number(svc?.base_cost || 0)) * (1 + Number(p.waste_percent || 0));
  } else {
    /* miolo de várias páginas: folha A4 dobrada rende 2 páginas A5 */
    /* Quantas folhas físicas o produto consome.

       Regra: quem manda é `base_material_qty`, que o cadastro informa.
       A divisão por 2 só vale para miolo DOBRADO (agenda A5: uma folha
       A4 dobrada vira 2 folhas A5), e nesse caso base_material_qty
       fica em 1 porque o consumo é derivado das páginas.

       Errei isso no kit de polaroid: 2 páginas A4 INTEIRAS viraram
       "1 folha dobrada" e o custo saiu pela metade. */
    const qtdBase = Number(p.base_material_qty) || 1;
    /* Quantas folhas o produto consome:
         qtdBase diferente de 1  -> vale ele, inclusive fração.
           2   = kit que usa duas folhas inteiras
           0,5 = meia folha (dois copos saem de uma folha de transfer)
         qtdBase = 1 e várias páginas -> miolo DOBRADO (agenda A5:
           uma folha A4 dobrada vira duas folhas A5). */
    const folhas = qtdBase !== 1 ? qtdBase : (pgs > 1 ? pgs / 2 : 1);
    /* Meia folha também custa meia impressão: quando dois copos saem
       da mesma folha, cada um leva metade do clique. */
    const fatorImp = qtdBase < 1 ? qtdBase : 1;
    calc += Number(base?.unit_cost || 0) * folhas;
    calc += porPagina * pgs * fatorImp;
    for (const m of mats) calc += Number(m.unit_cost) * Number(m.quantity);
    for (const f of fins) calc += Number(f.unit_cost) * Number(f.quantity);
    /* Serviço por FOLHA dividido entre as peças que ela rende. */
    if (svc) calc += Number(svc.base_cost) / (Number(p.pieces_per_sheet) || 1);
  }

  const gravado = Number(p.cost_snapshot || 0);
  if (Math.abs(calc - gravado) > 0.005 || Object.keys(aj).length) {
    plano.push({ id: p.id, sku: p.sku, modo: p.calculation_mode, gravado, calc,
                 venda: Number(p.final_price || 0), pecas: Number(p.pieces_per_sheet) || 1, aj });
  }
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  for (const x of plano) {
    const unit = x.modo === "batch" ? x.calc / x.pecas : x.calc;
    const m = x.venda ? ((x.venda - unit) / x.venda) * 100 : 0;
    console.log(`${x.sku}`);
    if (x.aj.motivo) console.log(`   cadastro: ${x.aj.motivo}`);
    console.log(`   custo  R$ ${x.gravado.toFixed(4)}  ->  R$ ${x.calc.toFixed(4)}`);
    if (x.modo === "batch") console.log(`   por unidade (${x.pecas} peças/folha): R$ ${unit.toFixed(4)}`);
    console.log(`   venda R$ ${x.venda.toFixed(2)}   margem ${m.toFixed(0)}%\n`);
  }
  console.log(`${plano.length} produto(s) a corrigir. Preço de venda não muda.`);
  console.log("\nPara aplicar: node scripts/corrigir-custos-produtos.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  for (const x of plano) {
    const sets = ["cost_snapshot=$2"];
    const vals = [x.id, x.calc.toFixed(4)];
    let i = 3;
    for (const [col, v] of Object.entries(x.aj)) {
      if (col === "motivo") continue;
      sets.push(`${col}=$${i++}`);
      vals.push(v);
    }
    await c.query(`update products set ${sets.join(", ")} where id=$1`, vals);
    console.log(`${x.sku.padEnd(12)} R$ ${x.gravado.toFixed(4)} -> R$ ${x.calc.toFixed(4)}`);
  }
  await c.query("commit");
  console.log(`\n✅ ${plano.length} produto(s) corrigido(s).`);
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
