import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/*  CONTROL PANEL / SETTINGS                                          */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  category: text("category").default("geral"),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  NOTIFICAÇÕES                                                       */
/*  Persistentes + alertas operacionais calculados em tempo real       */
/* ------------------------------------------------------------------ */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").default("info").notNull(), // info, success, warning, danger
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});



/* ------------------------------------------------------------------ */
/*  NUMERAÇÃO ATÔMICA DE DOCUMENTOS                                   */
/* ------------------------------------------------------------------ */
export const documentCounters = pgTable("document_counters", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(), // quote, order, sale, purchase
  year: integer("year").notNull(),
  current: integer("current").default(0).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("document_counters_type_year_idx").on(table.documentType, table.year),
]);

/* ------------------------------------------------------------------ */
/*  CATEGORIAS GENÉRICAS (reutilizáveis por módulo)                    */
/*  Produtos, Materiais, Serviços, Acabamentos, Tabelas de Preços      */
/*  Todas editáveis pelo usuário — adicionar/editar/remover livremente*/
/* ------------------------------------------------------------------ */
export const categoryModuleEnum = pgEnum("category_module", [
  "product",
  "material",
  "service",
  "finishing",
  "pricing_table",
]);

export const itemCategories = pgTable("item_categories", {
  id: serial("id").primaryKey(),
  module: categoryModuleEnum("module").notNull(),
  name: text("name").notNull(),
  icon: text("icon").default("📁"),
  color: text("color").default("#06b6d4"),
  order: integer("order").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  CRM - CUSTOMERS (PF / PJ)                                         */
/* ------------------------------------------------------------------ */
export const customerTypeEnum = pgEnum("customer_type", ["pf", "pj"]);
export const customerStatusEnum = pgEnum("customer_status", [
  "lead",
  "ativo",
  "inativo",
  "bloqueado",
]);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  type: customerTypeEnum("type").default("pf").notNull(),
  // common
  name: text("name").notNull(), // nome (PF) ou razão social (PJ)
  tradeName: text("trade_name"), // nome fantasia
  document: text("document"), // CPF ou CNPJ
  // contato
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  secondaryPhone: text("secondary_phone"),
  website: text("website"),
  contactName: text("contact_name"),
  contactRole: text("contact_role"),
  // endereco
  cep: text("cep"),
  street: text("street"),
  number: text("number"),
  complement: text("complement"),
  district: text("district"),
  city: text("city"),
  state: text("state"),
  // PF
  rg: text("rg"),
  /* órgão emissor do RG (DETRAN-RJ, SSP-SP...) — pedido na ficha de cliente */
  rgIssuer: text("rg_issuer"),
  birthDate: date("birth_date", { mode: "string" }),
  gender: text("gender"),
  maritalStatus: text("marital_status"), // solteiro, casado, divorciado, viuvo, uniao_estavel
  // PJ
  stateRegistration: text("state_registration"), // inscricao estadual
  municipalRegistration: text("municipal_registration"), // inscricao municipal
  legalNature: text("legal_nature"), // natureza juridica
  taxRegime: text("tax_regime"), // regime tributario
  companySize: text("company_size"), // MEI, ME, EPP, demais
  foundedAt: date("founded_at", { mode: "string" }), // data de fundação
  // comercial
  /* de onde veio o cliente: whatsapp, indicacao, instagram, balcao... */
  origin: text("origin"),
  /* LGPD: cliente que pediu para não receber mensagem automática */
  whatsappOptOut: boolean("whatsapp_opt_out").default(false).notNull(),
  status: customerStatusEnum("status").default("lead").notNull(),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }).default("0"),
  tags: text("tags"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  /* Um documento, um cliente. A checagem de duplicata em `lib/crm.ts`
     é um SELECT seguido de INSERT — mesmo TOCTOU que duplicou pedidos
     na v3.16.0. Com a importação de PDF em lote o risco cresce.
     Índice sobre os dígitos, para que "034.460.327-03" e "03446032703"
     colidam. Parcial: documento é opcional e vazios não colidem. */
  uniqueIndex("customers_document_unique_idx")
    .on(table.document)
    .where(sql`coalesce(document, '') <> ''`),
]);

/* ------------------------------------------------------------------ */
/*  CRM COMERCIAL — PIPELINE, LEADS E HISTÓRICO DE RELACIONAMENTO      */
/* ------------------------------------------------------------------ */
export const crmLeads = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  column: text("column").default("novo").notNull(), // novo, qualificacao, orcamento, negociacao, ganho, perdido
  source: text("source").default("manual"), // balcao, instagram, site, indicacao, google...
  owner: text("owner"),
  expectedValue: numeric("expected_value", { precision: 12, scale: 2 }).default("0"),
  probability: integer("probability").default(10),
  nextActionAt: timestamp("next_action_at", { mode: "date" }),
  lastContactAt: timestamp("last_contact_at", { mode: "date" }),
  notes: text("notes"),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "cascade",
  }),
  leadId: integer("lead_id").references(() => crmLeads.id, {
    onDelete: "cascade",
  }),
  type: text("type").default("nota").notNull(), // nota, ligacao, reuniao, tarefa, visita, proposta
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  PRICING ENGINE - PRINTER CATEGORIES                               */
/*  The category holds the pricing logic (cost per page)              */
/* ------------------------------------------------------------------ */
export const printerCategories = pgTable("printer_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Laser, Jato de Tinta, Térmica, 3D, Sublimação, DTF
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon").default("🖨️"),
  // custo fixo por pagina (energia + manutencao + depreciacao)
  fixedCostPerPage: numeric("fixed_cost_per_page", { precision: 12, scale: 6 }).default("0"),
  wasteFactor: numeric("waste_factor", { precision: 6, scale: 4 }).default("0"), // % de perda
  defaultMargin: numeric("default_margin", { precision: 6, scale: 4 }).default("0.4"),
  color: text("color").default("#06b6d4"),
  /** define como o custo é medido: pagina | etiqueta | grama */
  measureMode: text("measure_mode").default("pagina"),
  /** unidade exibida na UI: folha, etiqueta, grama */
  unitLabel: text("unit_label").default("folha"),
  /** cobertura de referência usada nos rendimentos da categoria (Laser normalmente 5%) */
  referenceCoverage: numeric("reference_coverage", { precision: 6, scale: 4 }).default("0.05"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* consumibles belong to a category and define the per-page cost      */
export const consumableTypeEnum = pgEnum("consumable_type", ["mono", "color", "both"]);

export const printerConsumables = pgTable("printer_consumables", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => printerCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Toner Preto, Cilindro, Resina, Filamento...
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).default("0"),
  yieldPages: integer("yield_pages").default(0), // rendimento em impressoes
  appliesTo: consumableTypeEnum("applies_to").default("both"),
  /** colorant escala pela cobertura; mechanical permanece custo técnico por folha */
  costRole: text("cost_role").default("colorant"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const printerStatusEnum = pgEnum("printer_status", [
  "ativa",
  "manutencao",
  "inativa",
]);

/** Modo de medição da categoria — define COMO o custo é calculado */
export const measureModeEnum = pgEnum("measure_mode", [
  "pagina",   // Laser / Jato de Tinta / Sublimação — custo por folha (A4/A3/A3+)
  "etiqueta", // Térmica — ribbon (m) + rolo de etiqueta
  "grama",    // 3D — custo por grama de filamento (sem formato de papel)
]);

export const printers = pgTable("printers", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => printerCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Konica C284-e, L18050...
  brand: text("brand"),
  model: text("model"),
  status: printerStatusEnum("status").default("ativa").notNull(),
  costMultiplier: numeric("cost_multiplier", { precision: 6, scale: 4 }).default("1"), // override
  maxFormat: text("max_format").default("A4"),
  /** 3D: volume de construção (ex: 220x220x250mm) — não usa formato de papel */
  buildVolume: text("build_volume"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  FORMATOS DE IMPRESSÃO (A4, A3, A3+, fotos) por categoria          */
/*  Cada formato tem um fator de área e cobertura de tinta            */
/* ------------------------------------------------------------------ */
export const printFormats = pgTable("print_formats", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => printerCategories.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),          // A4, A3, A3+, 10x15, 15x20...
  widthMm: numeric("width_mm", { precision: 8, scale: 2 }).default("210"),
  heightMm: numeric("height_mm", { precision: 8, scale: 2 }).default("297"),
  /** fator de área relativo ao A4 (A4=1, A3=2, A3+=2.37) */
  areaFactor: numeric("area_factor", { precision: 8, scale: 4 }).default("1"),
  /** cobertura de tinta (1 = 100%, 0.05 = texto 5%) */
  inkCoverage: numeric("ink_coverage", { precision: 6, scale: 4 }).default("0.05"),
  /** custo comercial interno da impressão por folha; 0 usa cálculo técnico de consumíveis */
  printCostOverride: numeric("print_cost_override", { precision: 12, scale: 4 }).default("0"),
  isPhoto: boolean("is_photo").default(false),
  /* --------------------------------------------------------------
   * TÉRMICA — geometria do rolo (v3.36.0)
   *
   * Etiqueta não tem rendimento fixo: o ribbon avança o COMPRIMENTO
   * da etiqueta mais o gap, e o rolo pode ter várias colunas lado a
   * lado. Uma 100x30 em 3 colunas rende 7.125 etiquetas por ribbon
   * de 76 m; uma 100x150 em coluna única rende 500 — 14× de
   * diferença. Sem esses campos o custo por etiqueta era um chute
   * herdado da categoria.
   *
   * `feedMm` = avanço por linha (altura da etiqueta + gap).
   * `columns` = etiquetas lado a lado na largura do rolo.
   * Zerados, o motor cai no comportamento antigo (areaFactor).
   * ------------------------------------------------------------- */
  feedMm: numeric("feed_mm", { precision: 8, scale: 2 }).default("0"),
  columns: integer("columns").default(1),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  MATERIALS & SUPPLIES (Materiais e Insumos)                        */
/* ------------------------------------------------------------------ */
export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Papel A4 75g, Papel Cartolina, Vinil, TNT...
  categoryId: integer("category_id").references(() => itemCategories.id, {
    onDelete: "set null",
  }),
  unit: text("unit").default("unidade"), // folha, metro, kg, unidade
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).default("0"),
  /* --------------------------------------------------------------
   * EMBALAGEM DE COMPRA (v3.31.0)
   *
   * O insumo é COMPRADO em embalagem fechada (resma de 500 folhas,
   * pacote de 100 fotos, bobina de 300 m) mas é CONSUMIDO na unidade
   * (folha, foto, metro). Antes disso o usuário tinha que dividir na
   * calculadora e digitar o custo unitário à mão — e qualquer reajuste
   * de preço exigia refazer a conta, com erro de arredondamento
   * entrando direto na precificação de todos os produtos.
   *
   * Agora `unitCost` é DERIVADO: packCost / packQuantity. Quando a
   * embalagem não é informada (packQuantity = 0) o campo continua
   * sendo digitado direto, então todo o cadastro legado segue válido.
   * ------------------------------------------------------------- */
  /** rótulo da embalagem: "Resma 500 folhas", "Pacote 100 un" */
  packName: text("pack_name"),
  /** quantas unidades base vêm na embalagem — 0/null = não usa embalagem */
  packQuantity: numeric("pack_quantity", { precision: 12, scale: 3 }).default("0"),
  /** preço pago na embalagem fechada */
  packCost: numeric("pack_cost", { precision: 12, scale: 4 }).default("0"),
  supplier: text("supplier"),
  stock: numeric("stock", { precision: 12, scale: 3 }).default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  MOVIMENTAÇÃO DE ESTOQUE (entrada / saída / ajuste)                */
/*  Automatiza o controle: toda venda/uso baixa estoque; compras somam*/
/* ------------------------------------------------------------------ */
export const stockMovementKindEnum = pgEnum("stock_movement_kind", [
  "entrada",
  "saida",
  "ajuste",
]);
export const stockTargetEnum = pgEnum("stock_target", ["material", "product"]);

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  kind: stockMovementKindEnum("kind").notNull(),
  targetType: stockTargetEnum("target_type").notNull(),
  materialId: integer("material_id").references(() => materials.id, {
    onDelete: "cascade",
  }),
  productId: integer("product_id"), // FK adicionada depois de `products` ser declarada
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).default("0"),
  reason: text("reason").default("ajuste"), // compra, venda, perda, producao, ajuste, devolucao
  reference: text("reference"), // número da venda/pedido/nota
  notes: text("notes"),
  automatic: boolean("automatic").default(false), // gerado pelo sistema (venda/produção)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  FORNECEDORES E COMPRAS                                             */
/* ------------------------------------------------------------------ */
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tradeName: text("trade_name"),
  document: text("document"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  website: text("website"),
  cep: text("cep"),
  street: text("street"),
  number: text("number"),
  complement: text("complement"),
  district: text("district"),
  city: text("city"),
  state: text("state"),
  paymentTerms: text("payment_terms"),
  leadTimeDays: integer("lead_time_days").default(0),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliers.id, {
    onDelete: "set null",
  }),
  status: text("status").default("rascunho").notNull(), // rascunho, pedido, parcial, recebido, cancelado
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 4 }).default("0"),
  freight: numeric("freight", { precision: 12, scale: 4 }).default("0"),
  discount: numeric("discount", { precision: 12, scale: 4 }).default("0"),
  total: numeric("total", { precision: 12, scale: 4 }).default("0"),
  expectedDate: date("expected_date", { mode: "string" }),
  receivedAt: timestamp("received_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  PRICING TABLES (DTF UV, DTF Textil, Lona, Adesivo)                */
/*  Tabelas de preço independentes — podem compor produto ou serviço   */
/* ------------------------------------------------------------------ */
export const pricingTableEnum = pgEnum("pricing_table_type", [
  "dtf_uv",       // DTF UV (terceirizado) — preço por A4/A3/metro
  "dtf_textil",   // DTF Têxtil (terceirizado) — metro linear
  "lona",         // Comunicação Visual — Lona — R$/m²
  "adesivo",      // Comunicação Visual — Adesivo Vinil — R$/m²
]);

export const pricingTables = pgTable("pricing_tables", {
  id: serial("id").primaryKey(),
  type: pricingTableEnum("type").notNull(),
  categoryId: integer("category_id").references(() => itemCategories.id, {
    onDelete: "set null",
  }),
  label: text("label").notNull(),          // "A4 (22x28cm)", "A3 (28x42cm)", "1 Metro Linear", "m² Lona 440g"
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).default("0"),  // R$ por unidade
  unit: text("unit").default("unidade"),    // unidade, metro, m2, folha
  widthCm: numeric("width_cm", { precision: 8, scale: 2 }),   // largura útil em cm (28cm para metro linear)
  heightCm: numeric("height_cm", { precision: 8, scale: 2 }), // altura útil em cm
  minQty: numeric("min_qty", { precision: 10, scale: 3 }).default("1"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  FINISHING (Acabamentos)                                           */
/* ------------------------------------------------------------------ */
export const finishingItems = pgTable("finishing_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Laminadora, Guilhotina, Plastificação, Encadernação...
  categoryId: integer("category_id").references(() => itemCategories.id, {
    onDelete: "set null",
  }),
  unit: text("unit").default("unidade"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).default("0"),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  SERVICES (Serviços de Gráfica Rápida)                             */
/* ------------------------------------------------------------------ */
export const serviceTypeEnum = pgEnum("service_type", ["proprio", "terceirizado"]);

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Criação de Logo, Design, Impressão 3D, Sublimação...
  categoryId: integer("category_id").references(() => itemCategories.id, {
    onDelete: "set null",
  }),
  type: serviceTypeEnum("type").default("proprio").notNull(),
  baseCost: numeric("base_cost", { precision: 12, scale: 4 }).default("0"),
  estimatedHours: numeric("estimated_hours", { precision: 8, scale: 2 }).default("0"),
  becomesProduct: boolean("becomes_product").default(false),
  partner: text("partner"), // empresa terceirizada
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  PRODUCTS (with live cost calculator)                              */
/* ------------------------------------------------------------------ */
export const colorModeEnum = pgEnum("color_mode", ["mono", "color"]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  /** código de barras EAN/UPC — usado pelo leitor no PDV */
  barcode: text("barcode"),
  description: text("description"),
  /** categoria comercial do produto: Gráfica, Papelaria Personalizada, Brindes, DTF, Produtos 3D */
  productCategoryId: integer("product_category_id").references(
    () => itemCategories.id,
    { onDelete: "set null" }
  ),
  // motor de impressao
  printerId: integer("printer_id").references(() => printers.id, { onDelete: "set null" }),
  /** categoria da impressora (Laser, Jato de Tinta...) usada no cálculo */
  printerCategoryId: integer("printer_category_id").references(
    () => printerCategories.id,
    { onDelete: "set null" }
  ),
  printFormatId: integer("print_format_id").references(() => printFormats.id, {
    onDelete: "set null",
  }),
  colorMode: colorModeEnum("color_mode").default("mono"),
  pagesPerUnit: numeric("pages_per_unit", { precision: 10, scale: 3 }).default("1"),
  copies: numeric("copies", { precision: 10, scale: 3 }).default("1"),
  // material base
  baseMaterialId: integer("base_material_id").references(() => materials.id, {
    onDelete: "set null",
  }),
  baseMaterialQty: numeric("base_material_qty", { precision: 10, scale: 3 }).default("1"),
  // servico base
  baseServiceId: integer("base_service_id").references(() => services.id, {
    onDelete: "set null",
  }),
  // receita de produção por tiragem
  calculationMode: text("calculation_mode").default("unit").notNull(), // unit, batch
  defaultQuantity: numeric("default_quantity", { precision: 12, scale: 3 }).default("1"),
  piecesPerSheet: numeric("pieces_per_sheet", { precision: 12, scale: 3 }).default("1"),
  printSides: integer("print_sides").default(1),
  wastePercent: numeric("waste_percent", { precision: 6, scale: 4 }).default("0"),
  setupSheets: integer("setup_sheets").default(0),
  minOrderQty: numeric("min_order_qty", { precision: 12, scale: 3 }).default("1"),
  operationalRate: numeric("operational_rate", { precision: 6, scale: 4 }).default("0"),
  roundingStep: numeric("rounding_step", { precision: 10, scale: 2 }).default("0.01"),
  // precificacao — em batch, margin representa lucro alvo no divisor de markup
  margin: numeric("margin", { precision: 6, scale: 4 }).default("0.4"),
  costSnapshot: numeric("cost_snapshot", { precision: 12, scale: 4 }).default("0"),
  sellPrice: numeric("sell_price", { precision: 12, scale: 4 }).default("0"),
  finalPrice: numeric("final_price", { precision: 12, scale: 4 }).default("0"),
  active: boolean("active").default(true),
  // detalhe do calculo (transparencia)
  breakdown: jsonb("breakdown"),
  // estoque de produto acabado (opcional — nem todo produto é sob-demanda)
  trackStock: boolean("track_stock").default(false),
  stock: numeric("stock", { precision: 12, scale: 3 }).default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }).default("0"),
  /* --------------------------------------------------------------
   * LOGÍSTICA (v3.12.0) — usados na cotação de frete.
   * Quando zerados, o motor cai no pacote padrão do Painel de
   * Controle, então o cadastro legado continua funcionando.
   * ------------------------------------------------------------- */
  shipWeight: numeric("ship_weight", { precision: 10, scale: 3 }).default("0"), // kg
  shipHeight: numeric("ship_height", { precision: 10, scale: 2 }).default("0"), // cm
  shipWidth: numeric("ship_width", { precision: 10, scale: 2 }).default("0"), // cm
  shipLength: numeric("ship_length", { precision: 10, scale: 2 }).default("0"), // cm
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  /* SKU e código de barras precisam ser únicos: o PDV resolve o item
     bipado com `find`, que devolve o PRIMEIRO resultado. Com código
     repetido o operador vende o produto errado, com o preço errado, e
     nada avisa — o erro só aparece no fechamento do caixa.
     Índices parciais: os dois campos são opcionais e vazios não colidem. */
  uniqueIndex("products_sku_unique_idx")
    .on(table.sku)
    .where(sql`coalesce(sku, '') <> ''`),
  uniqueIndex("products_barcode_unique_idx")
    .on(table.barcode)
    .where(sql`coalesce(barcode, '') <> ''`),
]);

/* product -> finishing (N:N) */
export const productFinishings = pgTable("product_finishings", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  finishingId: integer("finishing_id")
    .notNull()
    .references(() => finishingItems.id, { onDelete: "cascade" }),
  /** multiplicador do acabamento na regra escolhida */
  quantity: numeric("quantity", { precision: 10, scale: 3 }).default("1"),
  /** fixed_lot, per_piece, per_sheet, per_kit, per_meter, per_m2 */
  chargeMode: text("charge_mode").default("per_piece"),
  /** usado somente em per_kit: ex. embalagem a cada 10 unidades */
  batchSize: numeric("batch_size", { precision: 10, scale: 3 }).default("1"),
});

/* product -> extra materials (N:N) */
export const productMaterials = pgTable("product_materials", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).default("1"),
});

/* ------------------------------------------------------------------ */
/*  FAIXAS DE PREÇO POR QUANTIDADE (v3.34.0)                          */
/*                                                                     */
/*  "vendo mínimo 50 und, depois 100 und e assim vai" — etiqueta,      */
/*  adesivo e brinde não são vendidos por unidade solta: o cliente     */
/*  compra lote, e quanto maior o lote menor o preço unitário.         */
/*                                                                     */
/*  Até aqui o produto tinha UM preço só. Vender 50 e 500 pelo mesmo   */
/*  unitário ou perde a venda grande, ou entrega a pequena no prejuízo */
/*  — o setup (calibrar, carregar ribbon, testar) é o mesmo nas duas.  */
/* ------------------------------------------------------------------ */
export const productPriceTiers = pgTable("product_price_tiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** quantidade mínima que ativa a faixa (50, 100, 250...) */
  minQuantity: numeric("min_quantity", { precision: 12, scale: 3 }).notNull(),
  /** preço UNITÁRIO praticado a partir dessa quantidade */
  unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull(),
  /** rótulo opcional mostrado no orçamento: "a partir de 100 un" */
  label: text("label"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  /* Duas faixas com a mesma quantidade mínima tornam o preço
     indeterminado — qual das duas o motor escolhe? */
  uniqueIndex("product_price_tiers_qty_idx").on(table.productId, table.minQuantity),
]);

/* ------------------------------------------------------------------ */
/*  QUOTES / ORÇAMENTOS                                               */
/* ------------------------------------------------------------------ */
export const quoteStatusEnum = pgEnum("quote_status", [
  "rascunho",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
]);

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  status: quoteStatusEnum("status").default("rascunho").notNull(),
  validUntil: date("valid_until", { mode: "string" }),
  subtotal: numeric("subtotal", { precision: 12, scale: 4 }).default("0"),
  discount: numeric("discount", { precision: 12, scale: 4 }).default("0"),
  taxes: numeric("taxes", { precision: 12, scale: 4 }).default("0"),
  shippingFee: numeric("shipping_fee", { precision: 12, scale: 4 }).default("0"),
  total: numeric("total", { precision: 12, scale: 4 }).default("0"),
  paymentMethod: text("payment_method"),
  channel: text("channel").default("Atendimento"),
  sellerName: text("seller_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  serviceId: integer("service_id").references(() => services.id, {
    onDelete: "set null",
  }),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).default("0"),
  total: numeric("total", { precision: 12, scale: 4 }).default("0"),
});

/* ------------------------------------------------------------------ */
/*  PEDIDOS / ORDEM DE PRODUÇÃO                                       */
/*  Orçamento aprovado é convertido aqui, preservando o snapshot.     */
/* ------------------------------------------------------------------ */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  quoteId: integer("quote_id").references(() => quotes.id, {
    onDelete: "set null",
  }),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  status: text("status").default("aberto").notNull(), // aberto, confirmado, concluido, cancelado
  productionStatus: text("production_status").default("aguardando").notNull(),
  artStatus: text("art_status").default("nao_enviada").notNull(),
  deliveryStatus: text("delivery_status").default("a_definir").notNull(),
  financialStatus: text("financial_status").default("pago").notNull(),
  priority: text("priority").default("normal"),
  dueDate: date("due_date", { mode: "string" }),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 4 }).default("0"),
  discount: numeric("discount", { precision: 12, scale: 4 }).default("0"),
  taxes: numeric("taxes", { precision: 12, scale: 4 }).default("0"),
  shippingFee: numeric("shipping_fee", { precision: 12, scale: 4 }).default("0"),
  total: numeric("total", { precision: 12, scale: 4 }).default("0"),
  paymentMethod: text("payment_method"),
  channel: text("channel").default("Atendimento"),
  sellerName: text("seller_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  /* Um orçamento gera NO MÁXIMO um pedido.
     A rota de conversão conferia com um SELECT e inseria em seguida —
     duplo-clique no botão "Converter em Pedido" criava duas OS para a
     mesma proposta (reproduzido na auditoria da v3.15.0: 5 chamadas
     paralelas geraram 3 pedidos). Parcial porque quote_id é nulo em
     pedido avulso, e NULL não colide em índice único. */
  uniqueIndex("orders_one_per_quote_idx")
    .on(table.quoteId)
    .where(sql`quote_id is not null`),
]);

export const artApprovals = pgTable("art_approvals", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  version: integer("version").default(1),
  status: text("status").default("pendente").notNull(), // pendente, aprovado, revisao, recusado
  clientComment: text("client_comment"),
  internalNote: text("internal_note"),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  PDV - SALES (Cupom Fiscal)                                        */
/* ------------------------------------------------------------------ */
export const saleTypeEnum = pgEnum("sale_type", ["produto", "servico", "mixto"]);

/* Sessões de caixa — abertura, sangria/suprimento e fechamento cego. */
export const cashSessions = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),
  status: text("status").default("aberto").notNull(), // aberto | fechado
  operator: text("operator"),
  openingAmount: numeric("opening_amount", { precision: 12, scale: 2 }).default("0"),
  /* informado pelo operador no fechamento, ANTES de ver o esperado */
  countedAmount: numeric("counted_amount", { precision: 12, scale: 2 }),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }),
  differenceAmount: numeric("difference_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  openedAt: timestamp("opened_at", { mode: "date" }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { mode: "date" }),
}, (table) => [
  /* Só pode existir UMA sessão aberta por vez.
     Sem esta trava, três requisições simultâneas de "abrir caixa"
     criavam três sessões e a conferência de gaveta ficava sem sentido
     (reproduzido em teste na v3.13.1). */
  uniqueIndex("cash_sessions_one_open_idx")
    .on(table.status)
    .where(sql`status = 'aberto'`),
]);

/* Sangrias e suprimentos de gaveta. */
export const cashMovements = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => cashSessions.id, { onDelete: "cascade" })
    .notNull(),
  kind: text("kind").notNull(), // sangria | suprimento
  amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  type: saleTypeEnum("type").default("mixto").notNull(),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 4 }).default("0"),
  discount: numeric("discount", { precision: 12, scale: 4 }).default("0"),
  taxes: numeric("taxes", { precision: 12, scale: 4 }).default("0"),
  cardFee: numeric("card_fee", { precision: 12, scale: 4 }).default("0"),
  /* frete cotado no PDV (SuperFrete) — soma no total (v3.12.0) */
  shippingFee: numeric("shipping_fee", { precision: 12, scale: 4 }).default("0"),
  shippingService: text("shipping_service"),
  shippingServiceId: integer("shipping_service_id"),
  total: numeric("total", { precision: 12, scale: 4 }).default("0"),
  paymentMethod: text("payment_method"),
  status: text("status").default("concluida").notNull(),
  /* idempotência: o cliente envia um UUID por venda; retry de rede não duplica */
  clientRef: text("client_ref").unique(),
  /* pagamento dividido: [{ method, amount }] */
  payments: jsonb("payments"),
  receivedAmount: numeric("received_amount", { precision: 12, scale: 2 }),
  changeAmount: numeric("change_amount", { precision: 12, scale: 2 }),
  sellerName: text("seller_name"),
  deliveryMode: text("delivery_mode"),
  deliveryDate: text("delivery_date"),
  notes: text("notes"),
  cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
    onDelete: "set null",
  }),
  canceledAt: timestamp("canceled_at", { mode: "date" }),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  KANBAN                                                            */
/* ------------------------------------------------------------------ */
export const kanbanCards = pgTable("kanban_cards", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  column: text("column").default("backlog").notNull(), // backlog, producao, revisao, pronto, entregue
  customerName: text("customer_name"),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  /* `orderId` e `customerId` sempre tiveram FK; `quoteId` era um
     integer solto — orçamento removido deixava o card apontando para
     um id inexistente. */
  quoteId: integer("quote_id").references(() => quotes.id, {
    onDelete: "set null",
  }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  order: integer("order").default(0),
  priority: text("priority").default("normal"), // baixa, normal, alta, urgente
  dueDate: date("due_date", { mode: "string" }),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  AGENDA / CAPACIDADE DE PRODUÇÃO                                    */
/* ------------------------------------------------------------------ */
export const productionSchedules = pgTable("production_schedules", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  printerId: integer("printer_id").references(() => printers.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  startTime: text("start_time").default("08:00"),
  estimatedMinutes: integer("estimated_minutes").default(30),
  status: text("status").default("planejado").notNull(), // planejado, em_producao, concluido, bloqueado
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  ENTREGAS E RETIRADAS                                               */
/* ------------------------------------------------------------------ */
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  method: text("method").default("retirada").notNull(), // retirada, motoboy, correios, transportadora
  status: text("status").default("aguardando").notNull(), // aguardando, separado, em_rota, entregue, devolvido
  scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  deliveredAt: timestamp("delivered_at", { mode: "date" }),
  trackingCode: text("tracking_code"),
  recipientName: text("recipient_name"),
  deliveryFee: numeric("delivery_fee", { precision: 12, scale: 2 }).default("0"),
  addressSnapshot: text("address_snapshot"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  FINANCIAL                                                         */
/* ------------------------------------------------------------------ */
export const txTypeEnum = pgEnum("tx_type", ["receita", "despesa"]);
export const txStatusEnum = pgEnum("tx_status", ["pendente", "pago", "atrasado"]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: txTypeEnum("type").notNull(),
  category: text("category"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).default("0"),
  dueDate: date("due_date", { mode: "string" }),
  paidDate: date("paid_date", { mode: "string" }),
  status: txStatusEnum("status").default("pendente").notNull(),
  method: text("method"),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  /* --------------------------------------------------------------
   * VÍNCULO COM O DOCUMENTO DE ORIGEM (v3.11.0)
   *
   * Antes o Financeiro se ligava aos outros módulos por TEXTO da
   * descrição (ilike "Pedido PED-2026-001%"), o que casava pedido
   * errado a partir do nº 10 e impedia reconciliação/estorno seguro.
   * ------------------------------------------------------------- */
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  purchaseId: integer("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
  cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
    onDelete: "set null",
  }),
  /* lançado por rotina do sistema (PDV, pedido, compra, caixa) — não editável na mão */
  automatic: boolean("automatic").default(false).notNull(),
  /* arquivamento não-destrutivo, no padrão dos demais módulos */
  archivedAt: timestamp("archived_at", { mode: "date" }),
  archiveReason: text("archive_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  API INTEGRATIONS (WhatsApp, VoIP, Portal - external systems)      */
/* ------------------------------------------------------------------ */
export const integrationTypeEnum = pgEnum("integration_type", [
  "whatsapp",
  "voip",
  "portal",
  "email",
]);

export const apiIntegrations = pgTable("api_integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: integrationTypeEnum("type").notNull(),
  apiKey: text("api_key"),
  endpoint: text("endpoint"),
  webhook: text("webhook"),
  active: boolean("active").default(true),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type CrmLead = typeof crmLeads.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type ArtApproval = typeof artApprovals.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type ProductionSchedule = typeof productionSchedules.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type PrintFormat = typeof printFormats.$inferSelect;
export type PricingTable = typeof pricingTables.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type PrinterCategory = typeof printerCategories.$inferSelect;
export type PrinterConsumable = typeof printerConsumables.$inferSelect;
export type Printer = typeof printers.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type FinishingItem = typeof finishingItems.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type KanbanCard = typeof kanbanCards.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  DATAS COMEMORATIVAS & CALENDÁRIO COMERCIAL                      */
/* ------------------------------------------------------------------ */
export const commemorativeDates = pgTable("commemorative_dates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date", { mode: "string" }).notNull().default("2000-01-01"),
  month: integer("month").notNull().default(1),
  day: integer("day").notNull().default(1),
  monthDay: text("month_day"),
  /** tipo: feriado_nacional | data_comercial | data_comemorativa | interno */
  type: text("type").default("data_comemorativa"),
  /** relevancia para gráfica: alta | media | baixa */
  relevance: text("relevance").default("media"),
  /** emoji ou ícone */
  icon: text("icon").default("📅"),
  /** dica de produto/serviço para esta data */
  actionHint: text("action_hint"),
  category: text("category").default("comercial"),
  description: text("description"),
  active: boolean("active").default(true),
  recurring: boolean("recurring").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const commemorativeDateAudit = pgTable("commemorative_date_audit", {
  id: serial("id").primaryKey(),
  dateId: integer("date_id").references(() => commemorativeDates.id, {
    onDelete: "cascade",
  }),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  performedBy: text("performed_by"),
  details: text("details"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type CommemorativeDate = typeof commemorativeDates.$inferSelect;

/* ------------------------------------------------------------------ */
/*  SUPERFRETE · ENVIOS (v3.12.0)                                     */
/*                                                                    */
/*  Ciclo real da API:                                                */
/*    cotação → carrinho (/cart) → checkout (paga) → etiqueta         */
/*    (/tag/print) → rastreio (/tag/tracking)                         */
/*                                                                    */
/*  Guardamos cada etapa para nunca perder o dinheiro já gasto: se o  */
/*  checkout deu certo mas a impressão falhou, o orderId da           */
/*  SuperFrete continua aqui e a etiqueta pode ser reimpressa.        */
/* ------------------------------------------------------------------ */
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "cotado",
  "no_carrinho",
  "pago",
  "postado",
  "em_transito",
  "entregue",
  "cancelado",
  "erro",
]);

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "set null" }),
  deliveryId: integer("delivery_id").references(() => deliveries.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),

  status: shipmentStatusEnum("status").default("cotado").notNull(),

  /* identificadores do lado da SuperFrete */
  superfreteOrderId: text("superfrete_order_id").unique(),
  protocol: text("protocol"),
  serviceId: integer("service_id"),
  serviceName: text("service_name"),
  carrier: text("carrier"),

  /* valores */
  price: numeric("price", { precision: 12, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).default("0"),
  insuranceValue: numeric("insurance_value", { precision: 12, scale: 2 }).default("0"),
  deliveryMin: integer("delivery_min"),
  deliveryMax: integer("delivery_max"),

  /* pacote cotado */
  weight: numeric("weight", { precision: 10, scale: 3 }).default("0"),
  height: numeric("height", { precision: 10, scale: 2 }).default("0"),
  width: numeric("width", { precision: 10, scale: 2 }).default("0"),
  length: numeric("length", { precision: 10, scale: 2 }).default("0"),

  cepOrigin: text("cep_origin"),
  cepDestination: text("cep_destination"),
  addressSnapshot: text("address_snapshot"),

  /* pós-compra */
  trackingCode: text("tracking_code"),
  labelUrl: text("label_url"),
  trackingStatus: text("tracking_status"),
  paidAt: timestamp("paid_at", { mode: "date" }),
  postedAt: timestamp("posted_at", { mode: "date" }),
  deliveredAt: timestamp("delivered_at", { mode: "date" }),

  /* ambiente em que foi gerado — sandbox e produção não se misturam */
  environment: text("environment").default("production").notNull(),
  /* resposta crua da API, para auditoria e suporte */
  payload: jsonb("payload"),
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export type Shipment = typeof shipments.$inferSelect;

/* ------------------------------------------------------------------ */
/*  INFINITEPAY · COBRANÇAS (v3.13.0)                                 */
/*                                                                    */
/*  Ciclo real da API:                                                */
/*    POST /links          → cria o link de checkout                  */
/*    cliente paga (Pix ou cartão em até 12x)                         */
/*    webhook_url          → InfinitePay avisa que pagou              */
/*    POST /payment_check  → confirmação ativa (fallback + double     */
/*                            check de segurança)                     */
/*                                                                    */
/*  O webhook é uma URL pública SEM assinatura HMAC: qualquer um      */
/*  poderia forjar um "pagamento aprovado". Por isso todo webhook é   */
/*  reconferido com payment_check antes de dar baixa no Financeiro.   */
/* ------------------------------------------------------------------ */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pendente",
  "pago",
  "expirado",
  "cancelado",
  "erro",
]);

export const paymentLinks = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  /** identificador enviado à InfinitePay e devolvido no webhook */
  orderNsu: text("order_nsu").notNull().unique(),

  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "set null" }),
  quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),

  status: paymentStatusEnum("status").default("pendente").notNull(),
  description: text("description").notNull(),

  /** valor cobrado e valor efetivamente pago (podem diferir: juros de parcelamento) */
  amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }),

  checkoutUrl: text("checkout_url"),
  handle: text("handle"),

  /* devolvidos após o pagamento */
  invoiceSlug: text("invoice_slug"),
  transactionNsu: text("transaction_nsu"),
  captureMethod: text("capture_method"), // pix | credit_card
  installments: integer("installments"),
  receiptUrl: text("receipt_url"),

  items: jsonb("items"),
  paidAt: timestamp("paid_at", { mode: "date" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),

  /** tarifa do checkout repassada ao cliente (0 quando a loja absorve) */
  passedFee: numeric("passed_fee", { precision: 12, scale: 2 }).default("0"),
  /** tarifa efetivamente retida pela InfinitePay, calculada na confirmação */
  providerFee: numeric("provider_fee", { precision: 12, scale: 2 }).default("0"),
  /** como a confirmação chegou: webhook | payment_check | manual */
  confirmedBy: text("confirmed_by"),
  webhookReceivedAt: timestamp("webhook_received_at", { mode: "date" }),
  checkAttempts: integer("check_attempts").default(0).notNull(),

  payload: jsonb("payload"),
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export type PaymentLink = typeof paymentLinks.$inferSelect;
