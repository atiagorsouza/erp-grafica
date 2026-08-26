#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
 *  AUDITORIA DE PREÇOS — read-only, roda no servidor do ERP
 *  Uso:  cd /www/wwwroot/erp-grafica && node scripts/auditoria-precos.mjs
 *
 *  Não escreve NADA: abre transação READ ONLY e só faz SELECT.
 *  Relata os 8 problemas que fazem o preço "sair errado":
 *    1. Âncora quebrada   — faixa de 1 un ≠ finalPrice do motor
 *    2. Sem faixa de 1    — portal inventa âncora (ok, mas saiba)
 *    3. Abaixo do custo   — faixa mais barata que o costSnapshot
 *    4. Escada quebrada   — faixas que SOBEM com a quantidade
 *    5. Não precificando  — produto ativo com preço 0
 *    6. Fantasmas E2E     — produtos de teste ativos no catálogo
 *    7. Custo/página      — mapa das categorias/impressoras (o que
 *                           está zerado e não deveria)
 *    8. Estoque cego      — materiais sem custo ou sem unidade
 * ════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

/* DATABASE_URL do ambiente ou do .env do app */
let url = process.env.DATABASE_URL;
if (!url) {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!url) {
  console.error("✖ DATABASE_URL não encontrado (env nem .env).");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const brl = (v) => "R$ " + Number(v ?? 0).toFixed(2).replace(".", ",");
const N = (v) => Number(v ?? 0);

async function main() {
  const c = await pool.connect();
  await c.query("BEGIN READ ONLY");
  console.log("═════════════════════════════════════════════════════════");
  console.log("  AUDITORIA DE PREÇOS — só leitura, nada é alterado");
  console.log("═════════════════════════════════════════════════════════");

  const prods = (await c.query(`
    SELECT p.id, p.name, p.sku, p.final_price, p.cost_snapshot, p.active, p.sale_unit_label
    FROM products p ORDER BY p.active DESC, p.name`)).rows;
  const tiers = (await c.query(`
    SELECT product_id, min_quantity, unit_price, label
    FROM product_price_tiers ORDER BY product_id, min_quantity`)).rows;
  const porProd = new Map();
  for (const t of tiers) {
    const l = porProd.get(t.product_id) ?? [];
    l.push(t);
    porProd.set(t.product_id, l);
  }
  const nome = (id) => prods.find((p) => p.id === id)?.name ?? `#${id}`;

  /* ── 1. âncora quebrada ─────────────────────────────────── */
  console.log("\n── 1. Âncora quebrada (faixa de 1 un ≠ preço do motor) ──");
  let n = 0;
  for (const p of prods) {
    if (!p.active) continue;
    const f1 = (porProd.get(p.id) ?? []).find((t) => N(t.min_quantity) === 1);
    if (!f1) continue;
    if (Math.abs(N(f1.unit_price) - N(p.final_price)) > 0.01) {
      n++;
      console.log(`  ✖ ${p.name} — motor ${brl(p.final_price)} × faixa1 ${brl(f1.unit_price)}  (o site cobra ${brl(f1.unit_price)})`);
    }
  }
  if (!n) console.log("  ✔ nenhuma divergência");

  /* ── 2. sem faixa de 1 ──────────────────────────────────── */
  console.log("\n── 2. Faixas sem âncora de 1 unidade (informativo) ──");
  n = 0;
  for (const p of prods) {
    if (!p.active) continue;
    const fs = porProd.get(p.id) ?? [];
    if (fs.length && !fs.some((t) => N(t.min_quantity) === 1)) {
      n++;
      console.log(`  ⚠ ${p.name} — menor faixa ${N(fs[0].min_quantity)} un ${brl(fs[0].unit_price)}; card ancora no motor (${brl(p.final_price)})`);
    }
  }
  if (!n) console.log("  ✔ todos com faixa de 1 (ou sem faixas)");

  /* ── 3. abaixo do custo ─────────────────────────────────── */
  console.log("\n── 3. Faixa abaixo do custo (venda no prejuízo) ──");
  n = 0;
  for (const p of prods) {
    if (!p.active) continue;
    const custo = N(p.cost_snapshot);
    if (custo <= 0) continue;
    for (const t of porProd.get(p.id) ?? []) {
      if (N(t.unit_price) > 0 && N(t.unit_price) < custo) {
        n++;
        console.log(`  ✖ ${p.name} — faixa ${N(t.min_quantity)}+ a ${brl(t.unit_price)} < custo ${brl(custo)}`);
      }
    }
  }
  if (!n) console.log("  ✔ nenhuma faixa abaixo do custo");

  /* ── 4. escada quebrada ─────────────────────────────────── */
  console.log("\n── 4. Escada quebrada (preço SOBE com a quantidade) ──");
  n = 0;
  for (const p of prods) {
    if (!p.active) continue;
    const fs = porProd.get(p.id) ?? [];
    for (let i = 1; i < fs.length; i++) {
      if (N(fs[i].unit_price) > N(fs[i - 1].unit_price) + 0.001) {
        n++;
        console.log(`  ✖ ${p.name} — ${N(fs[i - 1].min_quantity)}+ ${brl(fs[i - 1].unit_price)} → ${N(fs[i].min_quantity)}+ ${brl(fs[i].unit_price)} (subiu)`);
      }
    }
  }
  if (!n) console.log("  ✔ todas as escadas descem");

  /* ── 5. não precificando ────────────────────────────────── */
  console.log("\n── 5. Produtos ativos sem preço ('não está precificando') ──");
  n = 0;
  for (const p of prods) {
    if (p.active && N(p.final_price) <= 0) {
      n++;
      console.log(`  ✖ ${p.name} — finalPrice 0 (custo ${brl(p.cost_snapshot)}) — fica FORA do catálogo do portal até ter preço`);
    }
  }
  if (!n) console.log("  ✔ todos os ativos têm preço");

  /* ── 6. fantasmas E2E ───────────────────────────────────── */
  console.log("\n── 6. Fantasmas de teste (E2E) ativos ──");
  const e2e = prods.filter((p) => p.active && /e2e/i.test(p.name ?? ""));
  if (e2e.length) e2e.forEach((p) => console.log(`  ✖ ${p.name} — DESATIVAR`));
  else console.log("  ✔ nenhum");

  /* ── 7. custo por página das categorias ─────────────────── */
  console.log("\n── 7. Custo/página por categoria (o que está zerado?) ──");
  const cats = (await c.query(`
    SELECT c.id, c.name, c.measure_mode, c.fixed_cost_per_page, c.waste_factor,
           COALESCE(json_agg(json_build_object(
             'nome', k.name, 'custo', k.unit_cost, 'rendimento', k.yield_pages,
             'aplica', k.applies_to, 'papel', k.cost_role
           ) ORDER BY k.name) FILTER (WHERE k.id IS NOT NULL), '[]') AS consumiveis
    FROM printer_categories c
    LEFT JOIN printer_consumables k ON k.category_id = c.id
    GROUP BY c.id ORDER BY c.name`)).rows;
  for (const cat of cats) {
    const cs = cat.consumiveis ?? [];
    const cor = cs.filter((x) => x.aplica === "color" || x.aplica === "both" && x.papel !== "mechanical");
    const mono = cs.filter((x) => x.aplica === "mono" || x.aplica === "both");
    const pg = (arr) => arr.reduce((s, x) => s + N(x.custo) / Math.max(N(x.rendimento), 1), 0) + N(cat.fixed_cost_per_page);
    console.log(`  • ${cat.name} [${cat.measure_mode}] fixo=${brl(cat.fixed_cost_per_page)} perda=${N(cat.waste_factor) * 100}% → color ${brl(pg(cor))}/pg · mono ${brl(pg(mono))}/pg`);
    if (cat.measure_mode === "page" && cs.length === 0) console.log(`    ✖ SEM consumível — impressão desta categoria custa SÓ o fixo`);
  }
  const printers = (await c.query(`SELECT name, category_id, cost_multiplier, hourly_rate FROM printers ORDER BY name`)).rows;
  const catNome = (id) => cats.find((c) => c.id === id)?.name ?? "?";
  for (const pr of printers) {
    const zero = N(pr.hourly_rate) === 0 ? " · ⚠ valor-hora ZERADO (tempo de máquina não entra no preço)" : "";
    console.log(`    ↳ ${pr.name} (${catNome(pr.category_id)}) fator ×${N(pr.cost_multiplier) || 1}${zero}`);
  }

  /* ── 8. estoque cego ────────────────────────────────────── */
  console.log("\n── 8. Materiais sem custo ou sem unidade ──");
  const mats = (await c.query(`SELECT name, unit, unit_cost FROM materials ORDER BY name`)).rows;
  n = 0;
  for (const m of mats) {
    if (N(m.unit_cost) <= 0 || !m.unit) {
      n++;
      console.log(`  ⚠ ${m.name} — custo ${brl(m.unit_cost)} · unidade "${m.unit ?? "—"}"`);
    }
  }
  if (!n) console.log("  ✔ todos com custo e unidade");

  await c.query("COMMIT");
  c.release();
  console.log("\n═════════════════════════════════════════════════════════");
  console.log("  Fim — nada foi alterado (transação read-only).");
  console.log("═════════════════════════════════════════════════════════");
}

main()
  .catch((e) => { console.error("✖ ERRO:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
