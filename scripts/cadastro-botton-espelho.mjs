#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
 *  CADASTRO — Botton Espelho de Bolsa 5,5cm (pedido do dono 26/08)
 *
 *  Uso (no servidor do ERP):
 *    node scripts/cadastro-botton-espelho.mjs           ← DRY-RUN (só mostra)
 *    node scripts/cadastro-botton-espelho.mjs --aplicar ← GRAVA
 *
 *  · Idempotente: se o SKU BOTT-55-PERS já existe, não faz nada.
 *  · Preço calculado pelo MOTOR REAL e conferido:
 *      impressão 0,31/pg ÷ 8  = 0,0387
 *      espelho (289,18/100)   = 2,8918
 *      papel foto A4 × 0,125  = 0,2000
 *      custo 3,1305 → ÷ (1 − 0,40 − 0,06 − 0,02) → R$ 6,02
 *  · Escreve em transação; qualquer erro → ROLLBACK, nada sujo.
 * ════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const APLICAR = process.argv.includes("--aplicar");
let url = process.env.DATABASE_URL;
if (!url) {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!url) { console.error("✖ DATABASE_URL não encontrado."); process.exit(1); }

const SKU = "BOTT-55-PERS";
const NOME = "Botton Espelho de Bolsa Espelhinho Personalizado 5,5cm";
const DESC = [
  "Botton espelho de bolsa 5,5 cm personalizado.",
  "",
  "Tampa resistente, aro de plástico e espelho com estampa de alta definição aplicada somente na frente.",
  "",
  "Garantia contra defeitos de fabricação — produto cuidadosamente embalado para garantir qualidade e integridade.",
].join("\n");
const TIERS = [
  { min: 10, preco: 5.9, label: "10 bottons" },
  { min: 20, preco: 5.5, label: "a partir de 20 bottons" },
  { min: 30, preco: 5.2, label: "a partir de 30 bottons" },
];

const pool = new Pool({ connectionString: url });
const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    /* ── já existe? ─────────────────────────────────────────── */
    const ja = await c.query("SELECT id, name, final_price FROM products WHERE sku = $1", [SKU]);
    if (ja.rows.length) {
      console.log(`✔ já cadastrado: #${ja.rows[0].id} “${ja.rows[0].name}” (${brl(ja.rows[0].final_price)}) — nada a fazer.`);
      await c.query("ROLLBACK");
      return;
    }

    /* ── resolve impressora L18050 + categoria ──────────────── */
    const imp = (await c.query(
      `SELECT p.id, p.name, p.category_id, pc.name AS categoria
       FROM printers p JOIN printer_categories pc ON pc.id = p.category_id
       WHERE p.name ILIKE '%l18050%' OR p.name ILIKE '%epson%'
       ORDER BY (p.name ILIKE '%l18050%') DESC LIMIT 1`)).rows[0];
    if (!imp) throw new Error("Impressora L18050/Epson não encontrada — cadastre no ERP antes.");

    /* ── formato A4 (da categoria da impressora, senão qualquer) ── */
    const fmt = (await c.query(
      `SELECT id, name FROM print_formats
       WHERE name ILIKE '%a4%' AND (category_id = $1 OR category_id IS NULL)
       ORDER BY (category_id = $1) DESC LIMIT 1`, [imp.category_id])).rows[0];

    /* ── material: espelho bottom kit ───────────────────────── */
    let espelho = (await c.query(
      `SELECT id FROM materials WHERE name ILIKE '%bottom%espelho%' OR name ILIKE '%espelho%bottom%' LIMIT 1`)).rows[0];
    const criaEspelho = !espelho;

    /* ── material: papel fotográfico A4 ─────────────────────── */
    let papel = (await c.query(
      `SELECT id, name, unit_cost FROM materials
       WHERE name ILIKE '%foto%' AND name ILIKE '%a4%'
       ORDER BY unit_cost DESC LIMIT 1`)).rows[0];
    const custoPapel = papel ? Number(papel.unit_cost) : 1.6;
    const criaPapel = !papel;

    /* ── categoria comercial ────────────────────────────────── */
    let cat = (await c.query(
      `SELECT id, name FROM item_categories
       WHERE module = 'product' AND parent_id IS NULL
         AND (name ILIKE '%botton%' OR name ILIKE '%personalizado%' OR name ILIKE '%brinde%')
       LIMIT 1`)).rows[0];
    const criaCat = !cat;

    /* ── plano ──────────────────────────────────────────────── */
    const custoPapellinha = custoPapel * 0.125;
    const custo = 0.0387 + 2.8918 + custoPapellinha;
    const divisor = 1 - 0.4 - 0.06 - 0.02;
    const final = custo / divisor;
    console.log("═════════════════════════════════════════════════════");
    console.log(`  PLANO — ${APLICAR ? "GRAVANDO (--aplicar)" : "DRY-RUN (nada é gravado)"}`);
    console.log("═════════════════════════════════════════════════════");
    console.log(`  Impressora : ${imp.name} (${imp.categoria})`);
    console.log(`  Formato    : ${fmt ? fmt.name : "— (sem formato: custo/página da categoria)"}`);
    console.log(`  Categoria  : ${cat ? cat.name : "Personalizados (será criada)"}`);
    console.log(`  Espelho    : ${espelho ? `#${espelho.id} já existe` : "criar “Bottom espelho kit metal 100 und” — embalagem 100 un × R$ 289,18 = R$ 2,8918/un"}`);
    console.log(`  Papel      : ${papel ? `#${papel.id} “${papel.name}” ${brl(custoPapel)}/folha` : `criar “Papel Fotográfico Jojo A4” ${brl(custoPapel)}/folha`}`);
    console.log(`  Custo      : 0,0387 (tinta ÷ 8) + 2,8918 (espelho) + ${custoPapellinha.toFixed(4)} (papel ÷ 8) = ${custo.toFixed(4)}`);
    console.log(`  Preço      : ÷ ${divisor} → ${brl(final)}  (margem 40% + imposto 6% + maquininha 2%)`);
    console.log(`  Faixas     : ${TIERS.map((t) => `${t.min}+ ${brl(t.preco)}`).join(" · ")}`);
    console.log("═════════════════════════════════════════════════════");

    if (!APLICAR) {
      await c.query("ROLLBACK");
      console.log("  Confirmou? Rode de novo com --aplicar");
      return;
    }

    /* ── grava ──────────────────────────────────────────────── */
    if (criaEspelho) {
      espelho = (await c.query(
        `INSERT INTO materials (name, unit, unit_cost, pack_quantity, pack_cost)
         VALUES ('Bottom espelho kit metal 100 und', 'un', 2.8918, 100, 289.18) RETURNING id`)).rows[0];
    }
    if (criaPapel) {
      papel = (await c.query(
        `INSERT INTO materials (name, unit, unit_cost) VALUES ('Papel Fotográfico Jojo A4', 'folha', $1) RETURNING id`,
        [custoPapel])).rows[0];
    }
    if (criaCat) {
      cat = (await c.query(
        `INSERT INTO item_categories (module, name, icon) VALUES ('product', 'Personalizados', '🪞') RETURNING id`)).rows[0];
    }

    const [prod] = (await c.query(
      `INSERT INTO products (
         name, sku, description, product_category_id,
         printer_id, printer_category_id, print_format_id, color_mode,
         pages_per_unit, copies, pieces_per_sheet, calculation_mode,
         base_material_id, base_material_qty, min_order_qty, default_quantity,
         margin, cost_snapshot, sell_price, final_price, active, breakdown
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,$7,'color',
         1, 1, 8, 'unit',
         $8, 1, 10, 10,
         0.4, $9, $10, $11, true, $12
       ) RETURNING id`,
      [
        NOME, SKU, DESC, cat.id,
        imp.id, imp.category_id, fmt ? fmt.id : null,
        espelho.id,
        Number(custo.toFixed(4)),
        Number((final * 0.92).toFixed(4)),
        Number(final.toFixed(4)),
        JSON.stringify({
          mode: "unit",
          lines: [
            { label: "Impressão", detail: "1 via(s) × 1 pg × R$ 0,31/pg (colorido · A4) ÷ 8 por folha", amount: 0.0387 },
            { label: "Material: Bottom espelho kit metal", detail: "1 un × R$ 2,8918", amount: 2.8918 },
            { label: "Insumo: Papel fotográfico A4", detail: `0.125 folha × ${brl(custoPapel)}`, amount: Number(custoPapellinha.toFixed(4)) },
          ],
          unitPrice: Number(final.toFixed(4)),
        }),
      ])).rows;

    await c.query(
      `INSERT INTO product_materials (product_id, material_id, quantity) VALUES ($1, $2, 0.125)`,
      [prod.id, papel.id]);
    for (const t of TIERS) {
      await c.query(
        `INSERT INTO product_price_tiers (product_id, min_quantity, unit_price, label) VALUES ($1, $2, $3, $4)`,
        [prod.id, t.min, t.preco, t.label]);
    }

    await c.query("COMMIT");
    console.log(`\n✔ PRODUTO CRIADO: #${prod.id} — ${NOME}`);
    console.log(`  Custo ${brl(custo)} · Preço ${brl(final)} · faixas ${TIERS.map((t) => `${t.min}+ ${brl(t.preco)}`).join(" · ")}`);
    console.log(`  Faltam as IMAGENS: anexe no ERP (campo de imagem do produto) — o dono tem as 3 fotos.`);
    console.log(`  Conferir no ERP: Produtos → abrir “${NOME}” — a calculadora ao vivo refaz a mesma conta.`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("✖ ERRO — ROLLBACK, nada foi gravado:", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
  }
}

main().catch((e) => { console.error("✖", e.message); process.exitCode = 1; }).finally(() => pool.end());
