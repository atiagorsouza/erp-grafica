// PrintFlow ERP · reparo do módulo Impressoras & Tintas
// - Normaliza custos percentuais/fatores
// - Corrige rendimentos zerados para evitar divisões inválidas
// - Garante slugs únicos de categorias
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const slugify = (s) => String(s || "categoria")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "") || "categoria";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: cats } = await client.query(`SELECT id, name, slug, measure_mode, unit_label, reference_coverage, waste_factor, default_margin FROM printer_categories ORDER BY id`);
    const used = new Set();
    let catFix = 0;
    for (const c of cats) {
      let slug = c.slug || slugify(c.name);
      const base = slug;
      let n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);
      const mode = ["pagina", "etiqueta", "grama"].includes(c.measure_mode) ? c.measure_mode : "pagina";
      const unit = c.unit_label || (mode === "grama" ? "grama" : mode === "etiqueta" ? "etiqueta" : "folha");
      const ref = Math.min(Math.max(Number(c.reference_coverage || 0.05), 0.0001), 1);
      const waste = Math.min(Math.max(Number(c.waste_factor || 0), 0), 1);
      const margin = Math.min(Math.max(Number(c.default_margin || 0.4), 0), 0.95);
      const r = await client.query(
        `UPDATE printer_categories
            SET slug=$2, measure_mode=$3, unit_label=$4, reference_coverage=$5, waste_factor=$6, default_margin=$7
          WHERE id=$1
            AND (slug IS DISTINCT FROM $2 OR measure_mode IS DISTINCT FROM $3 OR unit_label IS DISTINCT FROM $4 OR reference_coverage IS DISTINCT FROM $5 OR waste_factor IS DISTINCT FROM $6 OR default_margin IS DISTINCT FROM $7)`,
        [c.id, slug, mode, unit, ref, waste, margin]
      );
      catFix += r.rowCount || 0;
    }

    const consFix = await client.query(`
      UPDATE printer_consumables
         SET yield_pages = 1,
             notes = concat(coalesce(notes, ''), CASE WHEN coalesce(notes,'') = '' THEN '' ELSE E'\n' END, 'Reparo automático: rendimento inválido ajustado para 1.')
       WHERE yield_pages IS NULL OR yield_pages <= 0
    `);

    const consRoleFix = await client.query(`
      UPDATE printer_consumables
         SET cost_role = 'colorant'
       WHERE cost_role IS NULL OR cost_role NOT IN ('colorant','mechanical')
    `);

    const printerFix = await client.query(`
      UPDATE printers
         SET cost_multiplier = 1
       WHERE cost_multiplier IS NULL OR cost_multiplier::numeric <= 0
    `);

    const formatFix = await client.query(`
      UPDATE print_formats
         SET area_factor = CASE WHEN area_factor IS NULL OR area_factor::numeric <= 0 THEN 1 ELSE area_factor END,
             ink_coverage = CASE WHEN ink_coverage IS NULL OR ink_coverage::numeric < 0 THEN 0.05 WHEN ink_coverage::numeric > 1 THEN 1 ELSE ink_coverage END,
             print_cost_override = CASE WHEN print_cost_override IS NULL OR print_cost_override::numeric < 0 THEN 0 ELSE print_cost_override END
       WHERE area_factor IS NULL OR area_factor::numeric <= 0 OR ink_coverage IS NULL OR ink_coverage::numeric < 0 OR ink_coverage::numeric > 1 OR print_cost_override IS NULL OR print_cost_override::numeric < 0
    `);

    /* v3.46.4 — remove o custo comercial de exemplo dos formatos laser.
       O seed antigo gravava 1,50 / 2,50 / 3,50 em print_cost_override, e
       esse campo SUBSTITUI o cálculo técnico inteiro: toner, cilindro,
       fusor, técnico, cobertura de tinta, área e desperdício deixavam de
       contar. Numa agenda de 92 faces dava R$ 138,00 contra R$ 21,14 de
       custo real.

       Só zera os valores que vieram do exemplo. Se o usuário digitou
       outro número, é decisão dele e fica. */
    const overrideFix = await client.query(`
      UPDATE print_formats f
         SET print_cost_override = 0
        FROM printer_categories c
       WHERE f.category_id = c.id
         AND c.slug IN ('laser', 'laser-colorida')
         AND f.print_cost_override::numeric IN (1.50, 2.50, 3.50)
    `);

    /* v3.46.5 — faixas reais da Konica.
       O formato "gráfico/foto (60%)" descrevia um trabalho que não existe
       na operação do usuário (a Konica faz texto, meia cobertura ou
       chapado), e o CHAPADO — que existe — não tinha formato nenhum.
       Quem fosse orçar um chapado escolhia o de 60% e cobrava menos do
       que devia.

       Renomeia 60% -> 50% (meia cobertura) e cria o chapado se faltar.
       Só mexe em quem ainda está no formato antigo. */
    const renomeados = await client.query(`
      UPDATE print_formats f
         SET name = replace(f.name, 'gráfico/foto (60%)', 'meia cobertura (50%)'),
             ink_coverage = 0.50
        FROM printer_categories c
       WHERE f.category_id = c.id
         AND c.slug = 'laser-colorida'
         AND f.name LIKE '%gráfico/foto (60%%)%'
    `);

    let chapados = 0;
    for (const [rotulo, w, h, area] of [["A4", 210, 297, 1], ["A3", 297, 420, 2]]) {
      const r = await client.query(
        `INSERT INTO print_formats (category_id, name, width_mm, height_mm, area_factor, ink_coverage, print_cost_override, is_photo)
         SELECT c.id, $1, $2, $3, $4, 1.00, 0, false
           FROM printer_categories c
          WHERE c.slug = 'laser-colorida'
            AND NOT EXISTS (
              SELECT 1 FROM print_formats f
               WHERE f.category_id = c.id AND f.name = $1
            )`,
        [`${rotulo} chapado (100%)`, w, h, area]
      );
      chapados += r.rowCount;
    }

    await client.query("COMMIT");
    console.log(`✅ Impressoras & Tintas reparado: ${catFix} categorias, ${consFix.rowCount} rendimentos, ${consRoleFix.rowCount} papéis de custo, ${printerFix.rowCount} impressoras, ${formatFix.rowCount} formatos, ${overrideFix.rowCount} custos de exemplo removidos, ${renomeados.rowCount} faixas renomeadas, ${chapados} chapados criados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-print-engine falhou:", e.message);
  process.exit(1);
});
