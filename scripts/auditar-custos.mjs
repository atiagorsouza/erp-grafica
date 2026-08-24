#!/usr/bin/env node
/**
 * Confere, produto a produto, se o custo GRAVADO bate com o que o
 * motor de precificação realmente calcula.
 *
 * Nasceu do erro da agenda: o custo estava digitado à mão em
 * cost_snapshot, sem nenhuma linha de receita. A tela mostrava um
 * número e a realidade era outra.
 *
 * A fórmula abaixo espelha `computePrintSheetCost` de src/lib/pricing.ts:
 *
 *   (corante × fator_cobertura + mecânico + custo_fixo)
 *      × fator_área × faces × (1 + perda) × multiplicador_impressora
 *
 * O fator de cobertura importa muito: um adesivo chapado (100% de
 * tinta) custa vinte vezes o clique de uma página de texto (5%).
 * Ignorar isso foi o que me fez subestimar o custo do adesivo.
 *
 * Só relata. Não altera nada.
 */
import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/** Custo de uma página impressa, do jeito que o motor calcula. */
async function custoPagina(printerId, categoryId, formatId, colorMode, sides) {
  const cat = (await c.query(`select * from printer_categories where id=$1`, [categoryId])).rows[0];
  if (!cat) return { total: 0, detalhe: "sem categoria de impressora" };
  const cons = (await c.query(`select * from printer_consumables where category_id=$1`, [categoryId])).rows;
  const fmt = formatId
    ? (await c.query(`select * from print_formats where id=$1`, [formatId])).rows[0]
    : null;
  const prt = printerId
    ? (await c.query(`select * from printers where id=$1`, [printerId])).rows[0]
    : null;

  const aplica = cons.filter((x) =>
    colorMode === "mono" ? x.applies_to === "mono" || x.applies_to === "both"
                         : x.applies_to === "color" || x.applies_to === "both");
  const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);

  const baseCov = Math.max(Number(cat.reference_coverage) || 0.05, 0.0001);
  const cov = fmt ? Number(fmt.ink_coverage) : baseCov;
  const fatorCov = cov / baseCov;
  const area = fmt ? Number(fmt.area_factor) : 1;

  const corante = aplica.filter((x) => (x.cost_role || "colorant") === "colorant").reduce((s, x) => s + rende(x), 0);
  const mecanico = aplica.filter((x) => (x.cost_role || "colorant") !== "colorant").reduce((s, x) => s + rende(x), 0);

  const bruto = (corante * fatorCov + mecanico + Number(cat.fixed_cost_per_page || 0)) * area * sides;
  const total = bruto * (1 + Number(cat.waste_factor || 0)) * Number(prt?.cost_multiplier || 1);
  return {
    total,
    detalhe: fmt ? `${fmt.name} (${(cov * 100).toFixed(0)}% tinta, área ×${area})` : "sem formato",
  };
}

const prods = (await c.query(`select * from products order by sku`)).rows;
const linhas = [];

for (const p of prods) {
  const base = p.base_material_id
    ? (await c.query(`select name, unit_cost from materials where id=$1`, [p.base_material_id])).rows[0] : null;
  const mats = (await c.query(
    `select m.name, m.unit_cost, pm.quantity from product_materials pm
       join materials m on m.id=pm.material_id where pm.product_id=$1`, [p.id])).rows;
  const fins = (await c.query(
    `select f.name, f.unit_cost, pf.quantity from product_finishings pf
       join finishing_items f on f.id=pf.finishing_id where pf.product_id=$1`, [p.id])).rows;
  const svc = p.base_service_id
    ? (await c.query(`select name, base_cost from services where id=$1`, [p.base_service_id])).rows[0] : null;

  const faces = Number(p.print_sides) || 1;
  const pgs = Number(p.pages_per_unit) || 1;
  const imp = await custoPagina(p.printer_id, p.printer_category_id, p.print_format_id, p.color_mode, faces);

  const partes = [];
  let calc = 0;

  if (p.calculation_mode === "batch") {
    const folha = Number(base?.unit_cost || 0) * Number(p.base_material_qty || 1);
    const rec = Number(svc?.base_cost || 0);
    const perda = Number(p.waste_percent || 0);
    calc = (folha + imp.total + rec) * (1 + perda);
    partes.push(`folha ${folha.toFixed(4)}`, `impressão ${imp.total.toFixed(4)} [${imp.detalhe}]`);
    if (rec) partes.push(`${svc.name.slice(0, 22)} ${rec.toFixed(4)}`);
    if (perda) partes.push(`+${(perda * 100).toFixed(0)}% perda`);
  } else {
    const folhas = pgs > 1 ? pgs / 2 : Number(p.base_material_qty) || 1;
    const bm = Number(base?.unit_cost || 0) * folhas;
    if (bm) { calc += bm; partes.push(`${base.name.slice(0, 22)} ${bm.toFixed(4)}`); }
    const ti = imp.total * pgs;
    if (ti) { calc += ti; partes.push(`impressão ${ti.toFixed(4)}`); }
    for (const m of mats) { const v = Number(m.unit_cost) * Number(m.quantity); calc += v; partes.push(`${m.name.slice(0, 18)} ${v.toFixed(2)}`); }
    for (const f of fins) { const v = Number(f.unit_cost) * Number(f.quantity); calc += v; partes.push(`${f.name.slice(0, 18)} ${v.toFixed(2)}`); }
    if (svc) { const v = Number(svc.base_cost); calc += v; partes.push(`${svc.name.slice(0, 18)} ${v.toFixed(2)}`); }
  }

  const gravado = Number(p.cost_snapshot || 0);
  const venda = Number(p.final_price || 0);
  const pecas = Number(p.pieces_per_sheet) || 1;
  linhas.push({
    sku: p.sku, modo: p.calculation_mode, gravado, calc, venda, pecas, partes,
    receita: `${mats.length}i/${fins.length}a`,
    dif: calc - gravado,
  });
}

console.log("AUDITORIA DE CUSTO — o gravado bate com o motor?\n");
const ruins = linhas.filter((x) => Math.abs(x.dif) > 0.02 || x.gravado === 0);
for (const x of linhas) {
  const alerta = Math.abs(x.dif) > 0.02 ? "  ⚠️" : (x.gravado === 0 ? "  ⚠️ zerado" : "  ok");
  console.log(`${x.sku.padEnd(12)} gravado R$ ${x.gravado.toFixed(4).padStart(8)}   motor R$ ${x.calc.toFixed(4).padStart(8)}${alerta}`);
  if (Math.abs(x.dif) > 0.02 || x.gravado === 0) {
    console.log(`             ${x.partes.join(" + ")}`);
    if (x.modo === "batch") {
      const un = x.calc / x.pecas;
      console.log(`             ${x.pecas} peças/folha -> R$ ${un.toFixed(4)}/unidade`);
    }
    const m = x.venda ? ((x.venda - (x.modo === "batch" ? x.calc / x.pecas : x.calc)) / x.venda) * 100 : 0;
    console.log(`             venda R$ ${x.venda.toFixed(2)}   margem real ${m.toFixed(0)}%   receita ${x.receita}`);
  }
}
console.log(`\n${ruins.length} de ${linhas.length} produto(s) com divergência.`);
await c.end();
