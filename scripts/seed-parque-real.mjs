/**
 * Recadastra o parque REAL do usuário com os preços confirmados.
 *
 * O ambiente é efêmero: quando o sandbox recicla, o Postgres volta
 * vazio. Este script existe para reconstruir o parque em um comando,
 * em vez de repetir dezenas de curls.
 *
 * Rodar: node scripts/seed-parque-real.mjs
 */
import pg from "pg";

const c = new pg.Client({
  host: "127.0.0.1",
  user: "postgres",
  password: "postgres",
  database: "app_db",
});
await c.connect();

const q = (sql, params) => c.query(sql, params);

/* ------------------------------------------------------------------ */
/* Limpeza — ordem respeita as FKs                                     */
/* ------------------------------------------------------------------ */
await q("delete from product_price_tiers");
await q("delete from product_materials");
await q("delete from product_finishings");
await q("delete from products");
await q("delete from print_formats");
await q("delete from printer_consumables");
await q("delete from printers");
await q("delete from printer_categories");
await q("delete from materials where name ilike any (array['%ribbon%','%etiqueta%','%bopp%','%chamex%','%papel foto%'])");

/* ------------------------------------------------------------------ */
/* CATEGORIAS                                                          */
/*                                                                     */
/* `fixedCostPerPage` da Laser embute a manutenção do técnico:         */
/* R$ 450 a cada 6 meses = R$ 900/ano. A R$ 2.000/mês (24.000 pág/ano) */
/* isso dá R$ 0,0375/pág. Somado ao 0,02 de energia/depreciação que    */
/* já existia → 0,0575. É o número que mais depende do VOLUME real.    */
/* ------------------------------------------------------------------ */
const cats = [
  ["Laser Colorida", "laser-colorida", "pagina", "folha", "0.0575", "0.03", "0.40", "0.05", "🖨️", "#06b6d4"],
  ["Jato de Tinta", "jato-de-tinta", "pagina", "folha", "0.01", "0.03", "0.40", "0.10", "💧", "#3b82f6"],
  ["Sublimação", "sublimacao", "pagina", "folha", "0.01", "0.05", "0.50", "1.00", "🔥", "#f97316"],
  ["Térmica", "termica", "etiqueta", "etiqueta", "0.005", "0.03", "0.50", "1.00", "🏷️", "#8b5cf6"],
  ["Recorte / Plotter", "recorte-plotter", "pagina", "folha", "0.01", "0.08", "0.50", "1.00", "✂️", "#ec4899"],
  ["Impressão 3D", "impressao-3d", "grama", "grama", "0", "0.05", "0.60", "1.00", "🧊", "#10b981"],
];
const catId = {};
for (const [name, slug, mode, unit, fixed, waste, margin, ref, icon, color] of cats) {
  const r = await q(
    `insert into printer_categories
     (name, slug, measure_mode, unit_label, fixed_cost_per_page, waste_factor, default_margin, reference_coverage, icon, color)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [name, slug, mode, unit, fixed, waste, margin, ref, icon, color]
  );
  catId[slug] = r.rows[0].id;
}

/* ------------------------------------------------------------------ */
/* IMPRESSORAS — `hourly_rate` só onde o tempo é o produto             */
/* ------------------------------------------------------------------ */
const prts = [
  ["laser-colorida", "Konica Minolta C284e", "Konica Minolta", "C284e", "A3", null, "0"],
  ["jato-de-tinta", "Epson L18050", "Epson", "L18050", "A3", null, "0"],
  ["sublimacao", "Sublimática 3150 (tinta Genesis)", "—", "3150", "A4", null, "0"],
  ["termica", "Elgin L42 Pro Full", "Elgin", "L42 Pro Full", "106mm", null, "0"],
  ["recorte-plotter", "Silhouette Cameo 5", "Silhouette", "Cameo 5", "305mm", null, "2.50"],
  ["impressao-3d", "Bambu Lab A1", "Bambu Lab", "A1", null, "256 x 256 x 256 mm", "2.50"],
];
const prtId = {};
for (const [slug, name, brand, model, maxFormat, build, hourly] of prts) {
  const r = await q(
    `insert into printers (category_id, name, brand, model, status, cost_multiplier, max_format, build_volume, hourly_rate)
     values ($1,$2,$3,$4,'ativa','1',$5,$6,$7) returning id`,
    [catId[slug], name, brand, model, maxFormat, build, hourly]
  );
  prtId[slug] = r.rows[0].id;
}

/* ------------------------------------------------------------------ */
/* CONSUMÍVEIS                                                         */
/*                                                                     */
/* Konica: kit CMYK R$ 800 (R$ 200/cor). O PRETO é `both` porque a     */
/* composição em CMYK usa as 4 cores — o usuário confirmou.            */
/* Cilindros e unidades de imagem seguem a mesma lógica: o preto gira  */
/* em P&B e em cor; os coloridos só quando há cor.                     */
/* ------------------------------------------------------------------ */
const cons = [
  ["laser-colorida", "Toner Preto TN512K (kit CMYK R$800/4)", "200", 27500, "both", "colorant", "Kit compatível CMYK R$ 800 rateado."],
  ["laser-colorida", "Toner Ciano TN512C (kit CMYK R$800/4)", "200", 26000, "color", "colorant", null],
  ["laser-colorida", "Toner Magenta TN512M (kit CMYK R$800/4)", "200", 26000, "color", "colorant", null],
  ["laser-colorida", "Toner Amarelo TN512Y (kit CMYK R$800/4)", "200", 26000, "color", "colorant", null],
  ["laser-colorida", "Unidade de imagem PRETO", "599.90", 95000, "both", "mechanical", "Compatível, ~95.000 pág a 5%."],
  ["laser-colorida", "Unidade de imagem CIANO", "599.90", 95000, "color", "mechanical", null],
  ["laser-colorida", "Unidade de imagem MAGENTA", "599.90", 95000, "color", "mechanical", null],
  ["laser-colorida", "Unidade de imagem AMARELO", "599.90", 95000, "color", "mechanical", null],
  ["laser-colorida", "Caixa de resíduos WX-103 (compatível)", "77", 40000, "both", "mechanical", "Zeus R$ 77,04. Usuário nunca precisou trocar."],
  ["laser-colorida", "Correia de transferência (AliExpress)", "400", 200000, "both", "mechanical", "AliExpress R$ 400. Mão de obra no custo fixo da categoria."],
  ["laser-colorida", "Unidade de fusão", "700", 600000, "both", "mechanical", "Base R$ 700. Técnico troca junto."],

  ["jato-de-tinta", "Tinta preta T524 (70ml)", "45", 7500, "both", "colorant", null],
  ["jato-de-tinta", "Tintas coloridas CMY (jogo 70ml)", "135", 6000, "color", "colorant", null],
  ["jato-de-tinta", "Manutenção / cabeça (rateio)", "600", 60000, "both", "mechanical", null],

  ["sublimacao", "Tinta sublimática Genesis (100ml)", "120", 1200, "both", "colorant", "Rendimento medido a 100% de cobertura."],
  ["sublimacao", "Manutenção da cabeça (rateio)", "500", 20000, "both", "mechanical", null],

  /* Térmica: só a cabeça. Os ribbons são MATERIAL de estoque, porque
     cera/misto/resina são alternativas — se virassem consumíveis da
     categoria, o motor somaria os três em toda etiqueta. */
  ["termica", "Cabeça térmica (rateio)", "900", 300000, "both", "mechanical", null],

  ["recorte-plotter", "Lâmina de corte (rateio)", "120", 3000, "both", "mechanical", null],
  ["recorte-plotter", "Base de corte (rateio)", "90", 500, "both", "mechanical", "500 folhas confirmado pelo usuário."],

  ["impressao-3d", "Filamento PLA (1kg)", "110", 1000, "both", "colorant", null],
  ["impressao-3d", "Bico + manutenção (rateio por grama)", "150", 20000, "both", "mechanical", null],
];
for (const [slug, name, cost, y, ap, role, notes] of cons) {
  await q(
    `insert into printer_consumables (category_id, name, unit_cost, yield_pages, applies_to, cost_role, notes)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [catId[slug], name, cost, y, ap, role, notes]
  );
}

/* ------------------------------------------------------------------ */
/* FORMATOS — térmica usa feed_mm/columns (geometria do rolo)          */
/* ------------------------------------------------------------------ */
const fmts = [
  ["laser-colorida", "A4 texto (5%)", "210", "297", "1", "0.05", "0", 1],
  ["laser-colorida", "A4 gráfico/foto (60%)", "210", "297", "1", "0.60", "0", 1],
  ["laser-colorida", "A3 texto (5%)", "297", "420", "2", "0.05", "0", 1],
  ["laser-colorida", "A3 gráfico/foto (60%)", "297", "420", "2", "0.60", "0", 1],

  ["jato-de-tinta", "A4", "210", "297", "1", "0.10", "0", 1],
  ["jato-de-tinta", "A3", "297", "420", "2", "0.10", "0", 1],
  ["jato-de-tinta", "Foto 10x15", "150", "100", "0.24", "1.00", "0", 1],
  ["jato-de-tinta", "Foto 13x18", "180", "130", "0.375", "1.00", "0", 1],
  ["jato-de-tinta", "A4 foto borda a borda", "210", "297", "1", "1.00", "0", 1],

  ["sublimacao", "A4 sublimático", "210", "297", "1", "1.00", "0", 1],
  ["sublimacao", "Caneca 11oz (20x8cm)", "200", "80", "0.2565", "1.00", "0", 1],
  ["sublimacao", "Azulejo 15x15", "150", "150", "0.3608", "1.00", "0", 1],
  ["sublimacao", "Camiseta A4", "210", "297", "1", "1.00", "0", 1],

  ["termica", "Etiqueta 50x50mm (2 colunas)", "50", "50", "0.52", "1.00", "52", 2],
  ["termica", "Etiqueta 40x40mm (2 colunas)", "40", "40", "0.42", "1.00", "42", 2],
  ["termica", "Etiqueta 100x50mm", "100", "50", "1", "1.00", "52", 1],
  ["termica", "Etiqueta 100x30mm", "100", "30", "0.6", "1.00", "32", 1],
  ["termica", "Etiqueta 100x150mm (envio)", "100", "150", "3", "1.00", "152", 1],
  ["termica", "Pulseira 250x25mm", "250", "25", "5", "1.00", "252", 1],

  ["recorte-plotter", "Folha de recorte A4", "210", "297", "1", "1.00", "0", 1],
  ["recorte-plotter", "Folha de recorte A3", "297", "420", "2", "1.00", "0", 1],

  ["impressao-3d", "Peça 3D (por grama)", "0", "0", "1", "1.00", "0", 1],
];
const fmtId = {};
for (const [slug, name, w, h, af, cov, feed, cols] of fmts) {
  const r = await q(
    `insert into print_formats (category_id, name, width_mm, height_mm, area_factor, ink_coverage, feed_mm, columns)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [catId[slug], name, w, h, af, cov, feed, cols]
  );
  fmtId[name] = r.rows[0].id;
}

/* ------------------------------------------------------------------ */
/* MATERIAIS — embalagem de compra define o custo unitário             */
/* ------------------------------------------------------------------ */
const mats = [
  ["Papel Chamex A4 75g", "folha", "Resma 500 folhas", "500", "28.00", 500, 100],
  ["Papel Foto 10x15 Glossy 180g", "unidade", "Pacote 100 folhas", "100", "42.00", 100, 50],

  ["Ribbon Cera Preto 110x76m", "metro", "Rolo 76 m", "76", "32.00", 76, 20],
  ["Ribbon Misto (cera/resina) 110x76m", "metro", "Rolo 76 m", "76", "90.00", 76, 20],
  ["Ribbon Resina Metálica Rosê 110x76m", "metro", "Rolo 76 m", "76", "190.00", 76, 20],

  /* BOPP: R$ 50–60 o rolo. Adotado 55 (meio da faixa informada). */
  ["Etiqueta adesiva 5x5cm (rolo 1000 un)", "unidade", "Rolo 26 m — 1.000 un (2 col)", "1000", "60.00", 1000, 200],
  ["BOPP Transparente 5x5cm (rolo 1000 un)", "unidade", "Rolo 26 m — 1.000 un (2 col)", "1000", "55.00", 1000, 200],
  ["BOPP Branco 5x5cm (rolo 1000 un)", "unidade", "Rolo 26 m — 1.000 un (2 col)", "1000", "55.00", 1000, 200],
  ["BOPP Prata 5x5cm (rolo 1000 un)", "unidade", "Rolo 26 m — 1.000 un (2 col)", "1000", "55.00", 1000, 200],
  ["BOPP Transparente 4x4cm (rolo 1238 un)", "unidade", "Rolo 26 m — 1.238 un (2 col)", "1238", "55.00", 1238, 200],
  ["BOPP Transparente 10x5cm (rolo 500 un)", "unidade", "Rolo 26 m — 500 un (1 col)", "500", "55.00", 500, 100],
];
const matId = {};
for (const [name, unit, packName, packQty, packCost, stock, minStock] of mats) {
  const unitCost = (Number(packCost) / Number(packQty)).toFixed(4);
  const r = await q(
    `insert into materials (name, unit, unit_cost, pack_name, pack_quantity, pack_cost, stock, min_stock)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [name, unit, unitCost, packName, packQty, packCost, stock, minStock]
  );
  matId[name] = r.rows[0].id;
}

console.log("categorias :", Object.keys(catId).length);
console.log("impressoras:", Object.keys(prtId).length);
console.log("consumíveis:", cons.length);
console.log("formatos   :", Object.keys(fmtId).length);
console.log("materiais  :", Object.keys(matId).length);

await c.end();
