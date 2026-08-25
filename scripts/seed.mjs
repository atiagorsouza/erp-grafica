// Seed de demonstração — executar com: node seed.mjs
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params = []) => {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    console.error("SQL FAILED:", sql.slice(0, 120), "PARAMS:", params);
    throw e;
  }
};

async function main() {
  console.log("Limpando tabelas...");
  await q(`
    TRUNCATE TABLE
      settings, notifications,
      document_counters, customers, crm_leads, crm_activities, item_categories,
      printer_consumables, printers, printer_categories,
      materials, finishing_items, services, product_finishings, product_materials,
      products, stock_movements, quote_items, quotes, sales, kanban_cards,
      orders, art_approvals, suppliers, purchases, production_schedules, deliveries,
      transactions, api_integrations, pricing_tables, print_formats
    RESTART IDENTITY CASCADE
  `);

  // ---------- SETTINGS ----------
  const settings = [
    ["company_name", "Gráfica VT Digital"],
    ["company_document", "12.345.678/0001-90"],
    ["company_phone", "(21) 3000-0000"],
    ["company_address", "Av. das Gráficas, 100 — Centro, Rio de Janeiro/RJ"],
    ["pix_key", "contato@graficavtdigital.com.br"],
    ["operational_rate", "15"],
    ["tax_rate", "6"],
    ["fiscal_environment", "homologacao"],
    ["fiscal_tax_regime", "simples"],
    ["fiscal_nfe_enabled", "false"],
    ["fiscal_nfce_enabled", "false"],
    ["fiscal_nfse_enabled", "false"],
    ["fiscal_provider", "manual"],
    ["fiscal_certificate_type", "nenhum"],
    ["document_number_mode", "annual"],
    ["document_number_width", "4"],
    ["document_prefix_quote", "ORC"],
    ["document_prefix_order", "PED"],
    ["document_prefix_sale", "PDV"],
    ["document_prefix_purchase", "CMP"],








    ["card_fee_debit", "1.99"],
    ["card_fee_credit", "4.99"],
    ["pdv_seller_default", "OPERADOR"],
    ["pdv_delivery_default", "Retirada no balcão"],
    ["pdv_allow_negative_stock", "false"],
    ["pdv_require_customer", "false"],
    ["pdv_require_open_cash", "true"],
    ["pdv_receipt_footer", "Agradecemos a preferência! Volte sempre."],
  ];
  for (const [k, v] of settings) {
    const category = k.startsWith("document_")
      ? "documentos"
      : k.startsWith("fiscal_")
        ? "fiscal"
        : k.startsWith("pdv_")
          ? "pdv"
          : (k.includes("rate") || k.includes("fee") || k.includes("rounding"))
            ? "tributacao"
            : "geral";
    await q(`INSERT INTO settings (key, value, category) VALUES ($1,$2,$3)`, [k, v, category]);
  }

  // ====================================================================
  //  CATEGORIAS EDITÁVEIS POR MÓDULO
  //  A interface permite criar/editar/remover qualquer uma delas.
  // ====================================================================
  const itemCategorySeed = [
    // Produtos — categorias comerciais solicitadas
    ["product", "Gráfica", "🖨️", "#2563eb"],
    ["product", "Papelaria Personalizada", "✂️", "#8b5cf6"],
    ["product", "Brindes", "🎁", "#ec4899"],
    ["product", "DTF", "🧵", "#f97316"],
    ["product", "Produtos 3D", "🧊", "#f59e0b"],
    ["product", "Sublimação", "👕", "#db2777"],
    ["product", "Comunicação Visual", "🪧", "#06b6d4"],
    // Materiais e estoque — agrupamento operacional
    ["material", "Papéis e Cartões", "📄", "#2563eb"],
    ["material", "Papéis Fotográficos", "📷", "#a855f7"],
    ["material", "Etiquetas & Ribbons", "🏷️", "#10b981"],
    ["material", "Sublimação", "👕", "#db2777"],
    ["material", "Têxtil & DTF", "🧵", "#f97316"],
    ["material", "Filamentos 3D", "🧊", "#f59e0b"],
    ["material", "Embalagens", "📦", "#64748b"],
    ["material", "Comunicação Visual", "🪧", "#06b6d4"],
    ["material", "Consumíveis de Impressão", "🧪", "#0ea5e9"],
    // Serviços — organiza operação e terceirização
    ["service", "Design & Criação", "🎨", "#8b5cf6"],
    ["service", "Impressão Digital", "🖨️", "#2563eb"],
    ["service", "Papelaria Personalizada", "✂️", "#a855f7"],
    ["service", "Brindes & Sublimação", "🎁", "#ec4899"],
    ["service", "Comunicação Visual", "🪧", "#06b6d4"],
    ["service", "DTF UV", "✨", "#f97316"],
    ["service", "DTF Têxtil", "🧵", "#ea580c"],
    ["service", "Modelagem & Impressão 3D", "🧊", "#f59e0b"],
    ["service", "Fotografia", "📷", "#14b8a6"],
    // Acabamentos
    ["finishing", "Corte & Vinco", "✂️", "#2563eb"],
    ["finishing", "Laminação", "✨", "#8b5cf6"],
    ["finishing", "Plastificação", "🛡️", "#0ea5e9"],
    ["finishing", "Encadernação", "📚", "#a855f7"],
    ["finishing", "Montagem & Embalagem", "📦", "#64748b"],
    // Tabelas (como solicitado)
    ["pricing_table", "DTF", "🧵", "#f97316"],
    ["pricing_table", "Comunicação Visual", "🪧", "#06b6d4"],
  ];
  const itemCatIds = {};
  let catOrder = 0;
  for (const [module, name, icon, color] of itemCategorySeed) {
    const r = await q(
      `INSERT INTO item_categories (module, name, icon, color, "order") VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [module, name, icon, color, catOrder++]
    );
    itemCatIds[`${module}:${name}`] = r.rows[0].id;
  }
  console.log("  ✅ Categorias de Produtos, Materiais, Serviços, Acabamentos e Tabelas");

  // ---------- CATEGORIAS DE IMPRESSORA ----------
  // measureMode: pagina | etiqueta | grama  — define COMO o custo é calculado
  const cats = [
    ["Laser", "laser", "Laser colorida e P&B (Konica C284-e)", "🖨️", "#6366f1", "0.0120", "0.05", "0.45", "pagina", "folha", "0.05"],
    ["Jato de Tinta", "jato-de-tinta", "EcoTank 6 cores / Fotos (Epson L18050)", "💧", "#0ea5e9", "0.0080", "0.05", "0.40", "pagina", "folha", "1"],
    ["Térmica", "termica", "Etiquetas — ribbon (m) + rolo de etiqueta", "🏷️", "#10b981", "0.0050", "0.03", "0.50", "etiqueta", "etiqueta", "1"],
    ["3D", "3d", "Impressão 3D FDM — custo por grama de filamento", "🧊", "#f59e0b", "0.0020", "0.10", "0.60", "grama", "grama", "1"],
    ["Sublimação", "sublimacao", "Estamparia por sublimação (4 tintas)", "👕", "#ec4899", "0.0300", "0.08", "0.55", "pagina", "folha", "1"],
  ];
  const catIds = {};
  for (const [name, slug, desc, icon, color, fixed, waste, margin, mode, unitLabel, referenceCoverage] of cats) {
    const r = await q(
      `INSERT INTO printer_categories (name, slug, description, icon, color, fixed_cost_per_page, waste_factor, default_margin, measure_mode, unit_label, reference_coverage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [name, slug, desc, icon, color, fixed, waste, margin, mode, unitLabel, referenceCoverage]
    );
    catIds[slug] = r.rows[0].id;
  }

  // ====================================================================
  //  FORMATOS DE IMPRESSÃO por categoria
  //  areaFactor relativo ao A4 | inkCoverage = cobertura de tinta
  // ====================================================================
  const formats = [
    // [categoria, nome, largura, altura, fator área, cobertura, custo manual/face, foto]
    // --- LASER: matriz comercial configurável ---
    /* print_cost_override = 0: o motor calcula pelo consumível real.
       Até a v3.46.3 estes formatos vinham com 1,50 / 2,50 / 3,50 — valores
       genéricos de exemplo que SUBSTITUÍAM o cálculo técnico inteiro
       (toner, cilindro, fusor, técnico, cobertura, área e desperdício
       eram ignorados). Numa agenda de 92 faces o override dava R$ 138,00
       contra R$ 21,14 de custo real. */
    ["laser", "A4", 210, 297, 1.0, 0.30, 0, false],
    ["laser", "A3", 297, 420, 2.0, 0.30, 0, false],
    ["laser", "A3+ (SRA3)", 320, 450, 2.31, 0.30, 0, false],
    // --- JATO DE TINTA: A4 foto R$1,80 conforme exemplo ---
    ["jato-de-tinta", "A4", 210, 297, 1.0, 1.0, 1.80, false],
    ["jato-de-tinta", "A3", 297, 420, 2.0, 1.0, 3.60, false],
    ["jato-de-tinta", "A3+ (SRA3)", 329, 483, 2.55, 1.0, 4.60, false],
    ["jato-de-tinta", "Foto 10x15", 100, 150, 0.24, 1.0, 0.55, true],
    ["jato-de-tinta", "Foto 13x18", 130, 180, 0.375, 1.0, 0.75, true],
    ["jato-de-tinta", "Foto 15x20", 150, 200, 0.48, 1.0, 0.95, true],
    ["jato-de-tinta", "Foto 20x30", 200, 300, 0.96, 1.0, 1.80, true],
    ["jato-de-tinta", "Foto 30x40", 300, 400, 1.92, 1.0, 3.20, true],
    ["jato-de-tinta", "Foto A3+ (33x48)", 329, 483, 2.55, 1.0, 4.60, true],
    // --- SUBLIMAÇÃO ---
    ["sublimacao", "A4", 210, 297, 1.0, 1.0, 0.90, false],
    ["sublimacao", "A3", 297, 420, 2.0, 1.0, 1.80, false],
    // --- TÉRMICA ---
    ["termica", "Etiqueta 50x50mm", 50, 50, 1.0, 1.0, 0, false],
    ["termica", "Etiqueta 33x25mm", 33, 25, 0.33, 1.0, 0, false],
    ["termica", "Etiqueta 100x50mm", 100, 50, 2.0, 1.0, 0, false],
    // --- 3D: sem formato de papel ---
    ["3d", "Peça pequena (~15g)", 0, 0, 15, 1.0, 0, false],
    ["3d", "Peça média (~30g)", 0, 0, 30, 1.0, 0, false],
    ["3d", "Peça grande (~80g)", 0, 0, 80, 1.0, 0, false],
  ];
  const formatIds = {};
  for (const [slug, name, w, h, area, ink, printCost, isPhoto] of formats) {
    const result = await q(
      `INSERT INTO print_formats (category_id, name, width_mm, height_mm, area_factor, ink_coverage, print_cost_override, is_photo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [catIds[slug], name, w, h, area, ink, printCost, isPhoto]
    );
    formatIds[`${slug}:${name}`] = result.rows[0].id;
  }
  console.log("  ✅ Formatos de impressão (A4, A3, A3+, fotos, etiquetas, 3D em gramas)");

  // ====================================================================
  //  CONSUMÍVEIS REAIS — preços e rendimentos pesquisados
  //  Konica C284-e: TN321K/C/M/Y, DR-512K/C/M/Y, DV-512, WX-103
  //  L18050: Tinta 108 (6 cores) + Caixa de Manutenção
  //  Térmica: Ribbon 110x76m + Rolo Etiqueta
  //  Sublimação: 4 tintas (C/M/Y/K) por garrafa 100ml
  // ====================================================================
  const consumables = [
    // ==================== LASER (Konica C284-e real) ====================
    // Toner TN321 — rendimento @5% cobertura
    ["laser", "Toner Preto TN321K", 260, 27000, "both"],           // $52 → R$260
    ["laser", "Toner Ciano TN321C", 490, 25000, "color"],          // $98 → R$490
    ["laser", "Toner Magenta TN321M", 490, 25000, "color"],        // $98 → R$490
    ["laser", "Toner Amarelo TN321Y", 490, 25000, "color"],        // $98 → R$490
    // Cilindro/Drum DR-512 — 4 unidades separadas (K, C, M, Y)
    ["laser", "Cilindro/Drum Preto DR-512K", 570, 120000, "both"], // R$570
    ["laser", "Cilindro/Drum Ciano DR-512C", 570, 75000, "color"], // R$570
    ["laser", "Cilindro/Drum Magenta DR-512M", 570, 75000, "color"],
    ["laser", "Cilindro/Drum Amarelo DR-512Y", 570, 75000, "color"],
    // Developer DV-512
    ["laser", "Developer Preto DV-512K", 1100, 590000, "both"],    // $220 → R$1100
    ["laser", "Developer Ciano DV-512C", 3400, 590000, "color"],   // $680 → R$3400
    ["laser", "Developer Magenta DV-512M", 3400, 590000, "color"],
    ["laser", "Developer Amarelo DV-512Y", 3400, 590000, "color"],
    // Resíduo (waste toner box) + Fusora + Transfer Belt
    ["laser", "Caixa Resíduo WX-103", 180, 100000, "both"],       // $36 → R$180
    ["laser", "Unidade Fusora FK-512", 1200, 150000, "both"],      // ~R$1200
    ["laser", "Unidade Transferência ITB-512", 1500, 150000, "both"],

    // ==================== JATO DE TINTA (Epson L18050 — 6 cores) ====================
    // Tinta Epson 108: garrafa 70ml original — ~R$42/un no BR
    // Rendimento: preto 5700 fotos 10x15, cores 2100 fotos 10x15
    // Para documentos: preto 3600pg, cores 7200pg
    ["jato-de-tinta", "Tinta Preta 108 (70ml)", 42, 5700, "both"],      // fotos 10x15
    ["jato-de-tinta", "Tinta Ciano 108 (70ml)", 42, 2100, "color"],
    ["jato-de-tinta", "Tinta Magenta 108 (70ml)", 42, 2100, "color"],
    ["jato-de-tinta", "Tinta Amarela 108 (70ml)", 42, 2100, "color"],
    ["jato-de-tinta", "Tinta Light Ciano 108 (70ml)", 42, 2100, "color"],
    ["jato-de-tinta", "Tinta Light Magenta 108 (70ml)", 42, 2100, "color"],
    // Caixa de manutenção C9345 (troca pelo usuário)
    ["jato-de-tinta", "Caixa Manutenção C9345", 90, 15000, "both"],

    // ==================== TÉRMICA ====================
    // Ribbon 110mm x 76m — lógica: custo do ribbon por metro + custo da etiqueta
    // Para categorias 3D/Sublimação, a lógica é por peça (filamento/tinta+base)
    ["termica", "Ribbon Resina Preto 110x76m", 60, 76, "both"],     // R$60, 76m
    ["termica", "Ribbon Resina Dourado 110x76m", 165, 76, "both"],  // R$165
    ["termica", "Ribbon Resina Prata 110x76m", 160, 76, "both"],    // R$160
    ["termica", "Ribbon Resina Rose Gold 110x76m", 190, 76, "both"], // R$190

    // ==================== 3D (custo por GRAMA — não por folha) ====================
    // Rolo 1kg = 1000g. yieldPages aqui representa GRAMAS por rolo.
    // Custo/grama = preço ÷ 1000g
    ["3d", "Filamento PLA 1kg (preto)", 80, 1000, "both"],   // R$0,080/g
    ["3d", "Filamento PLA 1kg (cores)", 90, 1000, "color"],  // R$0,090/g
    ["3d", "Filamento PETG 1kg", 110, 1000, "both"],         // R$0,110/g
    ["3d", "Filamento ABS 1kg", 95, 1000, "both"],           // R$0,095/g

    // ==================== SUBLIMAÇÃO (Epson F170 ou similar) ====================
    // 4 cores: Preto, Ciano, Magenta, Amarelo — garrafa 100ml ~R$40
    // Rendimento por garrafa: ~400 folhas A4 (100% cobertura)
    ["sublimacao", "Tinta Sublimação Preta 100ml", 40, 400, "both"],
    ["sublimacao", "Tinta Sublimação Ciano 100ml", 40, 400, "color"],
    ["sublimacao", "Tinta Sublimação Magenta 100ml", 40, 400, "color"],
    ["sublimacao", "Tinta Sublimação Amarela 100ml", 40, 400, "color"],
  ];
  for (const [slug, name, cost, yieldP, applies] of consumables) {
    await q(
      `INSERT INTO printer_consumables (category_id, name, unit_cost, yield_pages, applies_to)
       VALUES ($1,$2,$3,$4,$5)`,
      [catIds[slug], name, cost, yieldP, applies]
    );
  }
  await q(
    `UPDATE printer_consumables SET cost_role = 'mechanical'
     WHERE name ILIKE '%Cilindro%' OR name ILIKE '%Developer%' OR name ILIKE '%Resíduo%'
        OR name ILIKE '%Fusora%' OR name ILIKE '%Transferência%' OR name ILIKE '%Manutenção%'`
  );

  // ---------- IMPRESSORAS ----------
  // [categoryId, name, brand, model, status, multiplier, format]
  const printers = [
    ["laser", "Konica C284-e", "Konica Minolta", "bizhub C284-e", "ativa", "1.0", "A3"],
    ["laser", "Xerox C315", "Xerox", "VersaLink C315", "ativa", "1.05", "A4"],
    ["jato-de-tinta", "Epson L18050", "Epson", "EcoTank L18050", "ativa", "1.0", "A3+"],
    ["jato-de-tinta", "Epson L3250", "Epson", "EcoTank L3250", "manutencao", "1.1", "A4"],
    ["termica", "Zebra GC420t", "Zebra", "GC420t (110mm)", "ativa", "1.0", "110mm"],
    ["termica", "Elgin L42 Pro", "Elgin", "L42PRó (110mm)", "ativa", "1.0", "110mm"],
    ["3d", "Creality Ender 3 V3", "Creality", "Ender-3 V3 SE", "ativa", "1.0", "220 × 220 × 250 mm"],
    ["3d", "Bambu Lab A1 Mini", "Bambu Lab", "A1 Mini", "ativa", "1.1", "180 × 180 × 180 mm"],
    ["sublimacao", "Epson SureColor F170", "Epson", "SureColor F170", "ativa", "1.0", "A4"],
  ];
  const printerIds = {};
  for (const [slug, name, brand, model, status, mult, fmt] of printers) {
    // 3D não usa formato de papel — usa volume de construção
    const isThreeD = slug === "3d";
    const r = await q(
      `INSERT INTO printers (category_id, name, brand, model, status, cost_multiplier, max_format, build_volume)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        catIds[slug],
        name,
        brand,
        model,
        status,
        mult,
        isThreeD ? null : fmt,
        isThreeD ? fmt : null,
      ]
    );
    printerIds[name] = r.rows[0].id;
  }

  // ---------- MATERIAIS ----------
  const materials = [
    // Papéis (para Laser e Jato de Tinta)
    ["Papel A4 75g (folha)", "Papel", "folha", 0.04, "Distribuidora SP", 5000, 1000],
    ["Papel A4 90g (folha)", "Papel", "folha", 0.07, "Distribuidora SP", 3000, 500],
    ["Papel Couché 150g A4", "Papel", "folha", 0.18, "Distribuidora SP", 1500, 300],
    ["Papel Couché 150g A3", "Papel", "folha", 0.45, "Distribuidora SP", 800, 200],
    ["Papel Kraft A3 240g", "Papel", "folha", 0.95, "Papelaria Central", 500, 100],
    ["Folha Adesivo Vinil A3+", "Comunicação Visual", "folha", 2.50, "Vinil Brasil", 600, 120],
    // Papéis fotográficos (L18050 — cobertura 100%)
    ["Papel Foto 10x15 Glossy", "Fotográfico", "folha", 0.28, "Epson/Distribuidora", 2000, 500],
    ["Papel Foto 13x18 Glossy", "Fotográfico", "folha", 0.45, "Epson/Distribuidora", 800, 200],
    ["Papel Foto 15x20 Glossy", "Fotográfico", "folha", 0.60, "Epson/Distribuidora", 600, 150],
    ["Papel Foto 20x30 Glossy", "Fotográfico", "folha", 1.20, "Epson/Distribuidora", 300, 80],
    ["Papel Foto 30x40 Glossy", "Fotográfico", "folha", 2.50, "Epson/Distribuidora", 150, 40],
    ["Papel Foto A3+ Glossy", "Fotográfico", "folha", 3.50, "Epson/Distribuidora", 100, 30],
    ["Papel Fotográfico 230g A4", "Fotográfico", "folha", 1.20, "Epson/Distribuidora", 800, 150],
    // Etiquetas (Térmica — ficam nos Materiais)
    ["Rolo Etiqueta 50x50mm Redonda (1000un)", "Etiqueta", "rolo", 60.0, "iLabel", 100, 25],
    ["Rolo Etiqueta 33x25mm (10000un)", "Etiqueta", "rolo", 38.80, "iLabel", 80, 20],
    ["Rolo Etiqueta 100x50mm (3000un)", "Etiqueta", "rolo", 45.0, "iLabel", 60, 15],
    ["Rolo Etiqueta Térmica 57x30m", "Etiqueta", "rolo", 8.0, "iLabel", 200, 50],
    // Canecas e camisetas (Sublimação)
    ["Caneca Sublimática 325ml", "Sublimação", "unidade", 4.5, "Importadora", 200, 50],
    ["Caneca Mágica Sublimática", "Sublimação", "unidade", 8.0, "Importadora", 100, 25],
    ["Camiseta Algodão PV (un)", "Têxtil", "unidade", 14.0, "Fábrica Têxtil", 120, 30],
    ["Papel Sublimático A4 (100fl)", "Sublimação", "pacote", 35.0, "Distribuidora", 80, 20],
    // 3D
    ["Filamento PLA 1kg (preto)", "3D", "kg", 80.0, "Loja 3D", 15, 5],
    ["Filamento PLA 1kg (cores)", "3D", "kg", 90.0, "Loja 3D", 10, 3],
    ["Filamento PETG 1kg", "3D", "kg", 110.0, "Loja 3D", 8, 3],
  ];
  const materialCategoryMap = {
    Papel: "Papéis e Cartões",
    Fotográfico: "Papéis Fotográficos",
    Etiqueta: "Etiquetas & Ribbons",
    Sublimação: "Sublimação",
    Têxtil: "Têxtil & DTF",
    "3D": "Filamentos 3D",
    "Comunicação Visual": "Comunicação Visual", 
  };
  const matIds = {};
  for (const [name, cat, unit, cost, supplier, stock, min] of materials) {
    const r = await q(
      `INSERT INTO materials (name, category_id, unit, unit_cost, supplier, stock, min_stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, itemCatIds[`material:${materialCategoryMap[cat]}`], unit, cost, supplier, stock, min]
    );
    matIds[name] = r.rows[0].id;
  }

  // ---------- ACABAMENTOS ----------
  const finishings = [
    ["Laminação Fosca", "Laminação", "folha", 0.35],
    ["Laminação Brilho", "Laminação", "folha", 0.35],
    ["Corte na Guilhotina", "Corte & Vinco", "unidade", 0.05],
    ["Plastificação A4", "Plastificação", "unidade", 1.2],
    ["Encadernação Espiral", "Encadernação", "unidade", 3.5],
    ["Vinco", "Corte & Vinco", "unidade", 0.15],
    ["Dobra", "Corte & Vinco", "unidade", 0.05],
    ["Corte Especial (faca)", "Corte & Vinco", "unidade", 0.8],
    ["Plotter de Recorte Eletrônico", "Corte & Vinco", "peça", 0.06],
    ["Plotter Corte + Vinco", "Corte & Vinco", "peça", 0.20],
    ["Fita de Cetim (adereço)", "Montagem & Embalagem", "lote", 15.00],
  ];
  const finIds = {};
  for (const [name, cat, unit, cost] of finishings) {
    const r = await q(
      `INSERT INTO finishing_items (name, category_id, unit, unit_cost) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, itemCatIds[`finishing:${cat}`], unit, cost]
    );
    finIds[name] = r.rows[0].id;
  }

  // ---------- SERVIÇOS ----------
  // Serviços próprios e terceirizados
  // DTF, Lona, Adesivo: o preço vem da tabela de preços — o serviço herda
  const services = [
    ["Criação de Logo", "Design", "proprio", 250, 8, false, null],
    ["Arte Final / Diagramação", "Design", "proprio", 80, 2, false, null],
    ["Banner Lona (terceirizado)", "Comunicação Visual", "terceirizado", 0, 0, true, "Banner & Cia"],
    ["Adesivo Vinil (terceirizado)", "Comunicação Visual", "terceirizado", 0, 0, true, "Banner & Cia"],
    ["DTF UV Adesivo (terceirizado)", "DTF UV", "terceirizado", 0, 0, true, "Impressão Digital BR"],
    ["DTF Têxtil (terceirizado)", "DTF Têxtil", "terceirizado", 0, 0, true, "Impressão Digital BR"],
    ["Camiseta DTF Pronta", "DTF Têxtil", "terceirizado", 14, 0.5, true, "Impressão Digital BR"],
    ["Modelagem 3D", "3D", "proprio", 200, 5, false, null],
    ["Personalização de Canecas", "Sublimação", "proprio", 15, 0.5, true, null],
    ["Álbum de Fotos (20pg)", "Fotográfico", "proprio", 40, 1, true, null],
    ["Convite Personalizado", "Impressão", "proprio", 5, 0.1, true, null],
    ["Cartão PVC (impressão)", "Impressão", "proprio", 3, 0.05, true, null],
  ];
  const serviceCategoryMap = {
    Design: "Design & Criação",
    "Comunicação Visual": "Comunicação Visual",
    "DTF UV": "DTF UV",
    "DTF Têxtil": "DTF Têxtil",
    "3D": "Modelagem & Impressão 3D",
    Sublimação: "Brindes & Sublimação",
    Fotográfico: "Fotografia",
    Impressão: "Impressão Digital",
  };
  const svcIds = {};
  for (const [name, cat, type, cost, hours, becomes, partner] of services) {
    const r = await q(
      `INSERT INTO services (name, category_id, type, base_cost, estimated_hours, becomes_product, partner)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, itemCatIds[`service:${serviceCategoryMap[cat]}`], type, cost, hours, becomes, partner]
    );
    svcIds[name] = r.rows[0].id;
  }

  // ====================================================================
  //  PRICING TABLES (DTF UV, DTF Textil, Lona, Adesivo — Terceirizados)
  //  Tabelas independentes que podem compor Produto OU Serviço, sem misturar
  // ====================================================================

  // ---------- DTF UV ----------
  // Preços reais baseados em pesquisa (printcenterbrasil, infinityplace, mercadolivre)
  const dtfuv = [
    ["dtf_uv", "A4 (área útil 22x28cm)", 35.00, "unidade", 22, 28, 1, "Por folha"],
    ["dtf_uv", "A3 (área útil 28x42cm)", 50.00, "unidade", 28, 42, 1, "Por folha"],
    ["dtf_uv", "1 Metro Linear (28cm largura)", 90.00, "metro", 28, 100, 1, "28cm x 100cm"],
    ["dtf_uv", "2 Metros Linear (28cm largura)", 85.00, "metro", 28, 200, 2, "Desconto acima de 2m"],
    ["dtf_uv", "3-10 Metros Linear (28cm largura)", 80.00, "metro", 28, 300, 3, "Desconto volume"],
    ["dtf_uv", "11+ Metros Linear (28cm largura)", 75.00, "metro", 28, 1100, 11, "Volume alto"],
  ];
  const dtftextil = [
    ["dtf_textil", "1 Metro Linear (55cm largura)", 7.00, "metro", 55, 100, 1, "Preço fixo por metro"],
    ["dtf_textil", "5+ Metros Linear (55cm largura)", 6.50, "metro", 55, 500, 5, "Desconto volume"],
    ["dtf_textil", "10+ Metros Linear (55cm largura)", 6.00, "metro", 55, 1000, 10, "Volume alto"],
    ["dtf_textil", "Camiseta Estampa DTF", 12.00, "unidade", 30, 40, 1, "Estampa até 30x40cm"],
  ];
  const lona = [
    ["lona", "Lona 440g — até 1m²", 45.00, "m2", 100, 100, 1, "Preço por m² pequena"],
    ["lona", "Lona 440g — 2-5m²", 40.00, "m2", 200, 250, 2, "Desconto volume"],
    ["lona", "Lona 440g — 6-20m²", 35.00, "m2", 600, 1000, 6, "Volume"],
    ["lona", "Lona 440g — 20+m²", 30.00, "m2", 2000, 10000, 20, "Grande formato"],
    ["lona", "Lona Backlight", 55.00, "m2", 100, 100, 1, "Luminoso"],
    ["lona", "Lona Perfurada (microfuros)", 60.00, "m2", 100, 100, 1, "Fachada ventilada"],
  ];
  const adesivo = [
    ["adesivo", "Adesivo Vinil Branco — até 1m²", 55.00, "m2", 100, 100, 1, "Impressão + vinil"],
    ["adesivo", "Adesivo Vinil — 2-5m²", 48.00, "m2", 200, 250, 2, "Desconto"],
    ["adesivo", "Adesivo Vinil — 6-20m²", 42.00, "m2", 600, 1000, 6, "Volume"],
    ["adesivo", "Adesivo Vinil — 20+m²", 35.00, "m2", 2000, 10000, 20, "Grande formato"],
    ["adesivo", "Adesivo Perfurado (microfuros)", 65.00, "m2", 100, 100, 1, "Vidro/vitrine"],
    ["adesivo", "Adesivo Transparente", 70.00, "m2", 100, 100, 1, "Aplicação em vidro"],
    ["adesivo", "Adesivo Jateado", 85.00, "m2", 100, 100, 1, "Efeito jateado em vidro"],
  ];
  const pricingCategoryFor = (type) =>
    type === "dtf_uv" || type === "dtf_textil" ? "DTF" : "Comunicação Visual";
  for (const row of [...dtfuv, ...dtftextil, ...lona, ...adesivo]) {
    const [type, label, cost, unit, w, h, min, notes] = row;
    await q(
      `INSERT INTO pricing_tables (type, category_id, label, unit_cost, unit, width_cm, height_cm, min_qty, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [type, itemCatIds[`pricing_table:${pricingCategoryFor(type)}`], label, cost, unit, w, h, min, notes]
    );
  }

  console.log("  ✅ Tabelas de preços em DTF e Comunicação Visual");

  // ---------- CLIENTES ----------
  const customers = [
    ["pf", "Ana Oliveira", "Café Aurora", "28.991.321/0001-44", "ana@cafeaurora.com.br", "(11) 99871-2001", "Simples", "ativo", "01000-000", "Rua Augusta", "500", "Consolação"],
    ["pf", "Raphaela Pinheiro", null, "172.595.737-08", "raphaela@email.com", "(21) 99690-2449", null, "ativo", "21863-090", "Rua Luzia de Macedo Dantas", "151", "Bangu"],
    ["pj", "Padaria Pão Quente LTDA", "Pão Quente", "12.345.678/0001-95", "contato@paoquente.com", "(21) 99999-1111", "Simples", "ativo", "21863-090", "Rua Luzia de Macedo Dantas", "151", "Bangu"],
    ["pj", "Escola Saber Mais", "Saber Mais", "04.252.011/0001-10", "secretaria@sabermais.com", "(21) 97777-3333", "Simples", "lead", "20040-020", "Rua do Lavradio", "80", "Centro"],
  ];
  const custIds = [];
  for (const [type, name, trade, doc, email, phone, tax, status, cep, street, number, district] of customers) {
    const r = await q(
      `INSERT INTO customers (type, name, trade_name, document, email, phone, whatsapp, tax_regime, status, cep, street, number, district, city, state)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,'Rio de Janeiro','RJ') RETURNING id`,
      [type, name, trade, doc, email, phone, tax, status, cep, street, number, district]
    );
    custIds.push(r.rows[0].id);
  }



  // ====================================================================
  //  PRODUTOS — exemplos vinculados às categorias comerciais
  //  A futura lógica de tiragem (cartões/tags) será adicionada sem alterar
  //  esta estrutura base de custo unitário.
  // ====================================================================
  const productSeed = [
    ["Cartão de Visita 4x4 (10un)", "Cartão colorido frente e verso, 10 un por folha A4 couché 150g", "Gráfica", "Konica C284-e", "laser", "color", 0.1, 2, "Papel Couché 150g A4", 0.1, 0.50, 0.12, 0.24, 0.27],
    ["Foto 10x15 (L18050)", "Impressão fotográfica 10x15cm, 6 cores, 100% cobertura, papel glossy", "Gráfica", "Epson L18050", "jato-de-tinta", "color", 1, 1, "Papel Foto 10x15 Glossy", 1, 0.50, 0.45, 0.90, 1.02],
    ["Caneca Sublimática 325ml", "Caneca com arte personalizada — sublimação 4 tintas, 100% cobertura", "Brindes", "Epson SureColor F170", "sublimacao", "color", 1, 1, "Caneca Sublimática 325ml", 1, 0.55, 5.5, 12, 14],
    ["Etiqueta Redonda 50x50mm (milheiro)", "Etiqueta adesiva impressa em térmica com ribbon resina. Cálculo: ribbon por etiqueta + rolo etiqueta", "Papelaria Personalizada", "Zebra GC420t", "termica", "mono", 1, 1, "Rolo Etiqueta 50x50mm Redonda (1000un)", 0.001, 0.50, 0.07, 0.14, 0.16],
    ["Impressão Colorida A4 (1 via)", "Impressão colorida em papel A4 75g, Laser", "Gráfica", "Konica C284-e", "laser", "color", 1, 1, "Papel A4 75g (folha)", 1, 0.45, 0.35, 0.64, 0.72],
  ];
  for (const [name, description, pCat, printer, printerCat, colorMode, pages, copies, material, materialQty, margin, cost, sell, finalPrice] of productSeed) {
    await q(
      `INSERT INTO products (name, description, product_category_id, printer_id, printer_category_id, color_mode, pages_per_unit, copies, base_material_id, base_material_qty, margin, cost_snapshot, sell_price, final_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [name, description, itemCatIds[`product:${pCat}`], printerIds[printer], catIds[printerCat], colorMode, pages, copies, matIds[material], materialQty, margin, cost, sell, finalPrice]
    );
  }

  // ---------- PRODUTOS POR TIRAGEM (fórmulas práticas do motor) -----
  // Exemplo 1: 200 adesivos: 8 folhas A3+ × (R$2,50 material + R$3,50 impressão)
  // + 200 peças × R$0,06 plotter = CD R$60,00. Markup 15%+6%+29% = divisor 0,50 → R$120,00
  const [adhesiveBatch] = (await q(
    `INSERT INTO products (name, description, product_category_id, printer_id, printer_category_id, print_format_id, color_mode, base_material_id, base_material_qty, calculation_mode, default_quantity, pieces_per_sheet, print_sides, waste_percent, setup_sheets, min_order_qty, operational_rate, margin, cost_snapshot, sell_price, final_price, rounding_step)
     VALUES ($1,$2,$3,$4,$5,$6,'color',$7,1,'batch',200,25,1,0,0,10,0.15,0.29,60,120,120,0.01) RETURNING id`,
    [
      "200 Adesivos Vinil A3+ com Plotter",
      "Receita de tiragem: 25 adesivos por A3+, impressão laser colorida e recorte eletrônico por peça.",
      itemCatIds["product:Comunicação Visual"],
      printerIds["Konica C284-e"],
      catIds["laser"],
      formatIds["laser:A3+ (SRA3)"],
      matIds["Folha Adesivo Vinil A3+"],
    ]
  )).rows;
  await q(
    `INSERT INTO product_finishings (product_id, finishing_id, quantity, charge_mode, batch_size)
     VALUES ($1,$2,1,'per_piece',1)`,
    [adhesiveBatch.id, finIds["Plotter de Recorte Eletrônico"]]
  );

  // Exemplo 2: 50 caixinhas: 50 folhas A4 × (R$1,20 papel + R$1,80 impressão)
  // + Plotter R$10,00 + Fita fixa R$15,00 = CD R$175. Divisor 0,44 → R$397,73
  const [milkBatch] = (await q(
    `INSERT INTO products (name, description, product_category_id, printer_id, printer_category_id, print_format_id, color_mode, base_material_id, base_material_qty, calculation_mode, default_quantity, pieces_per_sheet, print_sides, waste_percent, setup_sheets, min_order_qty, operational_rate, margin, cost_snapshot, sell_price, final_price, rounding_step)
     VALUES ($1,$2,$3,$4,$5,$6,'color',$7,1,'batch',50,1,1,0,0,10,0.15,0.35,175,397.73,397.73,0.01) RETURNING id`,
    [
      "50 Caixinhas Milk Fotográficas",
      "Receita de tiragem: 1 caixinha por A4, jato de tinta fotográfico, plotter corte/vinco por peça e fita fixa por lote.",
      itemCatIds["product:Papelaria Personalizada"],
      printerIds["Epson L18050"],
      catIds["jato-de-tinta"],
      formatIds["jato-de-tinta:A4"],
      matIds["Papel Fotográfico 230g A4"],
    ]
  )).rows;
  await q(
    `INSERT INTO product_finishings (product_id, finishing_id, quantity, charge_mode, batch_size) VALUES
      ($1,$2,1,'per_piece',1),
      ($1,$3,1,'fixed_lot',1)`,
    [milkBatch.id, finIds["Plotter Corte + Vinco"], finIds["Fita de Cetim (adereço)"]]
  );
  console.log("  ✅ Produtos por tiragem: 200 Adesivos e 50 Caixinhas Milk");

  // ====================================================================
  //  CRM, PEDIDOS, ARTE, COMPRAS, PRODUÇÃO E ENTREGA — dados exemplo
  // ====================================================================
  const cardProduct = (await q(`SELECT id, name, final_price FROM products WHERE name = $1`, ["Cartão de Visita 4x4 (10un)"])).rows[0];
  const canecaProduct = (await q(`SELECT id, name, final_price FROM products WHERE name = $1`, ["Caneca Sublimática 325ml"])).rows[0];

  // Pipeline comercial + atividades
  const leadSeed = [
    [custIds[2], "Material escolar 2026 — Escola Saber Mais", "qualificacao", "instagram", 1850, 35, "Tiago", "Necessita orçamento para agenda e apostilas"],
    [custIds[0], "500 tags kraft para promoção", "orcamento", "whatsapp", 620, 70, "Tiago", "Aguardando confirmação do tamanho da tag"],
    [custIds[3], "Canecas personalizadas para evento", "negociacao", "indicacao", 1400, 80, "Comercial", "Evento corporativo no próximo mês"],
    [custIds[1], "Cartões de visita profissional", "ganho", "balcao", 280, 100, "Tiago", "Pedido confirmado"],
  ];
  const leadIds = [];
  for (const [customerId, title, column, source, expectedValue, probability, owner, notes] of leadSeed) {
    const r = await q(
      `INSERT INTO crm_leads (customer_id, title, "column", source, expected_value, probability, owner, notes, next_action_at, last_contact_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() + interval '2 days',NOW()) RETURNING id`,
      [customerId, title, column, source, expectedValue, probability, owner, notes]
    );
    leadIds.push(r.rows[0].id);
  }
  await q(
    `INSERT INTO crm_activities (customer_id, lead_id, type, title, description, created_at)
     VALUES ($1,$2,'whatsapp','Cliente confirmou quantidade','Aguardando aprovação da arte antes da produção.',NOW() - interval '1 day')`,
    [custIds[0], leadIds[1]]
  );
  await q(
    `INSERT INTO crm_activities (customer_id, lead_id, type, title, description, due_at)
     VALUES ($1,$2,'tarefa','Retornar para escola','Enviar amostras de papel e estimativa de prazo.',NOW() + interval '1 day')`,
    [custIds[2], leadIds[0]]
  );

  // Orçamentos de demonstração
  const quoteItems1 = [
    { description: "TOPO BOLO PERSONALIZADO", productId: cardProduct.id, quantity: 1, unitPrice: 15, total: 15 },
    { description: "IMPRESSÃO XEROX A4 LASER OFFSET 75GR", productId: null, quantity: 2, unitPrice: 1.5, total: 3 },
  ];
  const quoteResult1 = await q(
    `INSERT INTO quotes (number, customer_id, status, valid_until, subtotal, discount, shipping_fee, taxes, total, payment_method, channel, seller_name, notes)
     VALUES ('ORC-2026-0001', $1, 'aprovado', CURRENT_DATE + 10, 18, 0.83, 0, 0, 17.17, 'A definir', 'Atendimento', 'TIAGO SOUZA', 'Proposta aprovada pelo cliente.') RETURNING id`,
    [custIds[0]]
  );
  for (const it of quoteItems1) {
    await q(
      `INSERT INTO quote_items (quote_id, description, product_id, quantity, unit_price, total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [quoteResult1.rows[0].id, it.description, it.productId, it.quantity, it.unitPrice, it.total]
    );
  }

  // Pedido/OS idêntico ao modelo de referência
  const orderItems = [{ description: "Pedido originado fora do orçamento", productId: null, quantity: 1, unitPrice: 420, total: 420 }];
  const orderResult = await q(
    `INSERT INTO orders (number, customer_id, quote_id, status, production_status, art_status, delivery_status, financial_status, priority, due_date, items, subtotal, discount, shipping_fee, taxes, total, payment_method, channel, seller_name, notes)
     VALUES ('PED-2026-001',$1,$2,'confirmado','aguardando','aprovado','a_definir','pago','normal',CURRENT_DATE + 2,$3,420,0,0,0,420,'A definir','Atendimento','TIAGO SOUZA','Sem observações registradas.') RETURNING id`,
    [custIds[0], quoteResult1.rows[0].id, JSON.stringify(orderItems)]
  );
  const orderId = orderResult.rows[0].id;
  await q(
    `INSERT INTO art_approvals (order_id, file_name, file_url, version, status, client_comment, internal_note, created_at)
     VALUES ($1,'cartao-visita-joao-v1.pdf','https://example.com/cartao-visita-joao-v1.pdf',1,'pendente','Favor aumentar levemente o telefone.','Arte enviada pelo comercial.',NOW())`,
    [orderId]
  );
  await q(
    `INSERT INTO production_schedules (order_id, printer_id, title, scheduled_date, start_time, estimated_minutes, status, notes)
     VALUES ($1,$2,'Imprimir 100 cartões de visita',CURRENT_DATE + 2,'09:00',45,'planejado','Aguardar aprovação final da arte.')`,
    [orderId, printerIds["Konica C284-e"]]
  );
  await q(
    `INSERT INTO deliveries (order_id, customer_id, method, status, scheduled_at, recipient_name, delivery_fee, address_snapshot, notes)
     VALUES ($1,$2,'retirada','separado',NOW() + interval '3 days','João da Silva',0,'Retirada no balcão','Avisar cliente via WhatsApp quando estiver pronto.')`,
    [orderId, custIds[1]]
  );

  // Fornecedor + compra pendente de recebimento
  const supplierResult = await q(
    `INSERT INTO suppliers (name, trade_name, document, contact_name, email, phone, whatsapp, city, state, payment_terms, lead_time_days, notes)
     VALUES ('Distribuidora Carioca de Papéis LTDA','Carioca Papéis','11.222.333/0001-81','Fernanda Compras','vendas@cariocapapeis.com.br','2130001122','21990001122','Rio de Janeiro','RJ','28 dias',3,'Fornecedor de papéis e couché.') RETURNING id`
  );
  const supplierId = supplierResult.rows[0].id;
  const purchaseItems = [
    { materialId: matIds["Papel Couché 150g A4"], label: "Papel Couché 150g A4", quantity: 500, unitCost: 0.18 },
    { materialId: matIds["Papel Foto 10x15 Glossy"], label: "Papel Foto 10x15 Glossy", quantity: 300, unitCost: 0.28 },
  ];
  await q(
    `INSERT INTO purchases (number, supplier_id, status, items, subtotal, freight, discount, total, expected_date, notes)
     VALUES ('CMP-2026-0001',$1,'pedido',$2,174,22,0,196,CURRENT_DATE + 3,'Reposição automática sugerida pelo estoque.')`,
    [supplierId, JSON.stringify(purchaseItems)]
  );

  console.log("  ✅ CRM, Pedido/OS, Aprovação de Arte, Compra, Agenda e Entrega");

  // ---------- TRANSAÇÕES ----------
  await q(
    `INSERT INTO transactions (type, category, description, amount, due_date, status, method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    ["receita", "Vendas", "Pagamento PDV - Cartão de Visitas", 250, new Date(Date.now() + 86400000).toISOString().slice(0, 10), "pago", "PIX"]
  );
  await q(
    `INSERT INTO transactions (type, category, description, amount, due_date, status, method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    ["receita", "Serviços", "Criação de Logo - Padaria", 250, new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), "pendente", "Boleto"]
  );
  await q(
    `INSERT INTO transactions (type, category, description, amount, due_date, status, method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    ["despesa", "Insumos", "Compra de Papel Couché", 540, new Date().toISOString().slice(0, 10), "pago", "PIX"]
  );
  await q(
    `INSERT INTO transactions (type, category, description, amount, due_date, status, method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    ["despesa", "Energia", "Conta de Luz", 380, new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), "pendente", "Boleto"]
  );

  // ---------- KANBAN ----------
  const kanban = [
    ["Backlog - 100 Cartões Pão Quente", "backlog", "Padaria Pão Quente", "baixa"],
    ["Banner Escola Saber Mais", "producao", "Escola Saber Mais", "alta"],
    ["50 Canecas Evento", "revisao", "Maria Oliveira", "urgente"],
    ["Logo + Cartão João", "pronto", "João da Silva", "normal"],
    ["Adesivos Lona entregues", "entregue", "Cliente Avulso", "normal"],
  ];
  for (const [title, col, cust, pri] of kanban) {
    await q(
      `INSERT INTO kanban_cards (title, "column", customer_name, priority) VALUES ($1,$2,$3,$4)`,
      [title, col, cust, pri]
    );
  }

  // ---------- CONTADORES ATÔMICOS DE DOCUMENTOS ----------
  // Os exemplos já ocupam PED-2026-0001 e CMP-2026-0001.
  const currentYear = new Date().getFullYear();
  await q(
    `INSERT INTO document_counters (document_type, year, current) VALUES
      ('quote',$1,0), ('order',$1,1), ('sale',$1,0), ('purchase',$1,1)`,
    [currentYear]
  );

  // ---------- INTEGRAÇÕES (registro de exemplo) ----------
  await q(
    `INSERT INTO api_integrations (name, type, endpoint, api_key, active) VALUES ($1,$2,$3,$4,$5)`,
    ["WhatsApp Bot", "whatsapp", "https://bot.graficavt.com.br", "whatsapp_*****", true]
  );
  await q(
    `INSERT INTO api_integrations (name, type, endpoint, api_key, active) VALUES ($1,$2,$3,$4,$5)`,
    ["Portal de Clientes", "portal", "https://portal.graficavt.com.br", "portal_*****", true]
  );

  console.log("✅ Seed concluído com sucesso!");
  await pool.end();
}

main().catch((e) => {
  console.error("❌ Erro no seed:", e);
  pool.end();
  process.exit(1);
});
