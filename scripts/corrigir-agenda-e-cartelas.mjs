#!/usr/bin/env node
/**
 * Duas correções que o dono apontou.
 *
 * ─── 1. AGENDA: A5 é meia folha A4, e a cobertura é 50% ───────────
 *
 * Eu tinha cadastrado 365 páginas como se fossem 365 cliques A4. Não
 * são. O dono lembrou: A5 é meia folha A4.
 *
 *   186 folhas A5  ->  93 folhas A4 físicas
 *   93 folhas × 2 faces  ->  186 CLIQUES A4
 *
 * Cada clique A4 imprime duas páginas A5, uma de cada lado da dobra.
 * 186 cliques rendem 372 páginas A5, que são os ~365 que ele citou.
 *
 * Eu tinha posto 365 cliques. Quase o dobro do real.
 *
 * E o formato: usei "A4 texto 5%", mas agenda personalizada é arte,
 * não texto corrido. O dono corrigiu para 50% de cobertura, que
 * multiplica o corante por 10 em relação à referência de 5%.
 *
 * Os dois erros andavam em direções opostas e mascaravam um ao outro.
 *
 * ─── 2. ADESIVOS: a unidade de venda é a CARTELA ──────────────────
 *
 * Estava vendendo por adesivo: o operador tinha de digitar 40 no PDV
 * para vender uma cartela. O dono vende cartela; o preço unitário
 * serve de controle dele, não de unidade de venda.
 *
 * Agora 1 = 1 cartela = R$ 12,90, e o preço por adesivo fica na
 * descrição, para conferência.
 *
 * Simula por padrão.  node scripts/corrigir-agenda-e-cartelas.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* Volume mensal da Konica. O dono: "acredito que tenha 15 mil, mas
   ultimamente tem chegado a 1000 a 2000, estou em reformas".
   Adotado 15.000 — é a operação normal dele. A reforma é temporária e
   precificar por ela deixaria o preço alto para o ano inteiro. */
const PAGINAS_MES = 15000;
const MANUTENCAO_ANO = 900; // técnico R$ 450 × 2/ano + energia

/* Degraus da cartela, na régua que o dono já pratica. */
const CARTELAS = [
  [1, 12.9],
  [2, 23.5],
  [5, 53.0],
  [10, 95.0],
  [25, 210.0],
  [50, 365.0],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/* ---------- 1. custo fixo por página, com o volume real ---------- */
const fixoNovo = MANUTENCAO_ANO / (PAGINAS_MES * 12);
const catAtual = (await c.query(`select * from printer_categories where id=6`)).rows[0];
const fixoAtual = Number(catAtual.fixed_cost_per_page);

/* ---------- 2. agenda ---------- */
const AGENDA = {
  sku: "AGE-A5-186",
  pages_per_unit: 186, // cliques A4 reais: 93 folhas × 2 faces
  print_sides: 1, // no modo unit as faces já estão em pages_per_unit
  print_format_id: 22, // A4 meia cobertura (50%) — agenda é arte, não texto
};

/* ---------- 3. adesivos: peças por cartela ---------- */
const PECAS = {
  "ADES-4015": 60,
  "ADES-Q30": 40,
  "ADES-R30": 40,
  "ADES-Q40": 24,
  "ADES-R40": 24,
  "ADES-Q50": 15,
  "ADES-R50": 15,
  "ADES-Q60": 8,
  "ADES-R60": 8,
};

async function custoClique(formatId, colorMode, fixo) {
  const cons = (await c.query(`select * from printer_consumables where category_id=6`)).rows;
  const fmt = (await c.query(`select * from print_formats where id=$1`, [formatId])).rows[0];
  const aplica = cons.filter((x) =>
    colorMode === "mono" ? x.applies_to === "mono" || x.applies_to === "both"
                         : x.applies_to === "color" || x.applies_to === "both");
  const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);
  const baseCov = Math.max(Number(catAtual.reference_coverage) || 0.05, 0.0001);
  const cov = Number(fmt.ink_coverage);
  const area = Number(fmt.area_factor);
  const corante = aplica.filter((x) => (x.cost_role || "colorant") === "colorant").reduce((s, x) => s + rende(x), 0);
  const mecanico = aplica.filter((x) => (x.cost_role || "colorant") !== "colorant").reduce((s, x) => s + rende(x), 0);
  return (corante * (cov / baseCov) + mecanico + fixo) * area * (1 + Number(catAtual.waste_factor || 0));
}

const cliqueAgenda = await custoClique(22, "mono", fixoNovo);
const custoAgenda =
  186 * cliqueAgenda + // impressão
  93 * 0.0558 + // 93 folhas A4 de sulfite
  2 * 0.7499 + // papelão
  4 * 0.4259 + // adesivo Jojo
  4.32 + // wire-o
  4 * 0.35; // laminação

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("1. CUSTO FIXO POR PÁGINA");
  console.log(`   hoje:  R$ ${fixoAtual.toFixed(4)}  (base de 2.000 páginas/mês)`);
  console.log(`   novo:  R$ ${fixoNovo.toFixed(4)}  (base de ${PAGINAS_MES.toLocaleString("pt-BR")} páginas/mês)\n`);

  console.log("2. AGENDA — a conta certa");
  console.log("   186 folhas A5 = 93 folhas A4 × 2 faces = 186 cliques A4");
  console.log(`   formato: A4 meia cobertura (50%), não texto 5%`);
  console.log(`   clique R$ ${cliqueAgenda.toFixed(4)} × 186 = R$ ${(186 * cliqueAgenda).toFixed(2)}`);
  console.log(`   + materiais R$ ${(93 * 0.0558 + 2 * 0.7499 + 4 * 0.4259 + 4.32 + 4 * 0.35).toFixed(2)}`);
  console.log(`   CUSTO R$ ${custoAgenda.toFixed(2)}   venda R$ 46,90   margem ${(((46.9 - custoAgenda) / 46.9) * 100).toFixed(0)}%`);
  console.log(`   (estava gravado R$ 47,75 — margem negativa)\n`);

  console.log("3. ADESIVOS — venda por CARTELA");
  console.log("   antes: operador digita 40 para vender 1 cartela");
  console.log("   agora: digita 1 = 1 cartela = R$ 12,90\n");
  for (const [sku, pecas] of Object.entries(PECAS).slice(0, 3)) {
    console.log(`   ${sku.padEnd(11)} ${String(pecas).padStart(2)} adesivos/cartela  ->  R$ ${(12.9 / pecas).toFixed(4)}/adesivo (controle)`);
  }
  console.log("   ...");
  console.log("\n   Degraus: 1 · 2 · 5 · 10 · 25 · 50 cartelas");
  console.log("   R$ 12,90 · 23,50 · 53,00 · 95,00 · 210,00 · 365,00");
  console.log("\nPara aplicar: node scripts/corrigir-agenda-e-cartelas.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* 1. volume real da Konica */
  await c.query(`update printer_categories set fixed_cost_per_page=$1 where id=6`, [
    fixoNovo.toFixed(6),
  ]);
  console.log(`Custo fixo/página: R$ ${fixoAtual.toFixed(4)} -> R$ ${fixoNovo.toFixed(4)}`);

  /* 2. agenda */
  await c.query(
    `update products set pages_per_unit=$2, print_sides=$3, print_format_id=$4,
       cost_snapshot=$5 where sku=$1`,
    [AGENDA.sku, AGENDA.pages_per_unit, AGENDA.print_sides, AGENDA.print_format_id,
     custoAgenda.toFixed(4)],
  );
  console.log(`Agenda: 186 cliques A4, cobertura 50%, custo R$ ${custoAgenda.toFixed(2)}`);

  /* 3. adesivos passam a ser vendidos por cartela */
  for (const [sku, pecas] of Object.entries(PECAS)) {
    const p = (await c.query(`select id, name, description from products where sku=$1`, [sku])).rows[0];
    if (!p) continue;
    const porAdesivo = 12.9 / pecas;

    const nota =
      `Vendido por CARTELA com ${pecas} adesivos. ` +
      `Equivale a R$ ${porAdesivo.toFixed(4)} por adesivo — referência de controle, não de venda.`;
    const desc = (p.description || "").replace(/\s*Vendido por CARTELA.*$/s, "").trim();

    await c.query(
      `update products set min_order_qty=1, default_quantity=1, final_price=$2,
         sell_price=$2, description=$3 where id=$1`,
      [p.id, CARTELAS[0][1].toFixed(4), `${desc}\n\n${nota}`.trim()],
    );

    await c.query(`delete from product_price_tiers where product_id=$1`, [p.id]);
    for (const [qtd, preco] of CARTELAS) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [p.id, qtd, preco / qtd, `${qtd} cartela${qtd > 1 ? "s" : ""} · ${qtd * pecas} adesivos`],
      );
    }
  }
  console.log(`Adesivos convertidos para cartela: ${Object.keys(PECAS).length}`);

  await c.query("commit");

  const fim = await c.query(
    `select p.sku, p.pieces_per_sheet, p.final_price,
            (select unit_price from product_price_tiers t
              where t.product_id=p.id order by min_quantity limit 1) primeira
       from products p where p.sku like 'ADES%' order by p.sku`,
  );
  console.log("\n✅ Adesivos (1 = 1 cartela):");
  for (const r of fim.rows) {
    const pecas = Number(r.pieces_per_sheet);
    console.log(
      `   ${r.sku.padEnd(11)} R$ ${Number(r.primeira).toFixed(2)} a cartela ` +
        `(${pecas} un = R$ ${(12.9 / pecas).toFixed(4)}/adesivo)`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
