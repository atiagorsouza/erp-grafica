#!/usr/bin/env node
/**
 * Arruma três problemas do estoque e dos fornecedores.
 *
 * 1. FORNECEDORES FANTASMA
 *    46 dos 48 fornecedores chamam-se "E2E Fornecedor 1787469141485".
 *    São resíduo do teste automático, que cadastra um fornecedor novo
 *    a cada execução e nunca apaga. Só 2 são de verdade.
 *
 * 2. MATERIAIS SEM CATEGORIA
 *    Os 26 materiais da contagem do dono ficaram com category_id NULL.
 *    A limpeza de taxonomia apagou as categorias antigas, mas esses
 *    materiais apontavam para categorias de um módulo que não foi
 *    remapeado. A categoria original sobreviveu no campo `notes`
 *    ("Categoria: Papel Fotográfico."), então dá para reconstruir sem
 *    adivinhação.
 *
 * 3. MATERIAIS SEM FORNECEDOR
 *    Os mesmos 26 estão sem fornecedor. Não invento: fica registrado
 *    para o dono preencher, mas os papéis Jojo/Adespan têm origem
 *    conhecida e ficam agrupados para facilitar.
 *
 * Simula por padrão.  Para valer: node scripts/arrumar-estoque.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/** Categoria da contagem (em `notes`) -> subcategoria nova do módulo material. */
const MAPA_CATEGORIA = {
  "Papel Fotográfico": "Fotos",
  "Vinil Adesivo": "Adesivos",
  "Papel Adesivo": "Adesivos",
  "Papel Couché": "Cartões e Panfletos",
  "Papel Cartão": "Cartões e Panfletos",
  "Papel Offset": "Cópias e Impressões",
  "Papel Sulfite": "Cópias e Impressões",
  "Papel Kraft": "Embalagens",
  Sublimação: "Canecas",
  "Transfer Laser": "Camisetas",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/* ---------- levantamento ---------- */
/* Compras de teste: as que apontam para fornecedor E2E, mais as que
   ficaram SEM fornecedor nenhum e sem observação — o e2e cria uma de
   cada tipo por execução e nunca limpa. As 4 compras "de exemplo" da
   base curada têm fornecedor real e observação, e ficam. */
const comprasLixo = await c.query(
  `select p.id from purchases p
    where exists (select 1 from suppliers s
                   where s.id = p.supplier_id and s.name like 'E2E Fornecedor %')
       or (p.supplier_id is null and coalesce(p.notes,'') = '')`,
);

/* Fornecedores de teste que ninguém usa DEPOIS de tirar as compras
   acima do caminho. */
const lixo = await c.query(
  `select id, name from suppliers where name like 'E2E Fornecedor %'
     and not exists (select 1 from materials m where m.supplier_id = suppliers.id)`,
);

const semCat = await c.query(
  `select id, name, split_part(split_part(notes,'Categoria: ',2),'.',1) cat
     from materials where category_id is null and notes like '%Categoria: %'`,
);

const subs = await c.query(
  `select id, name from item_categories where module='material' and parent_id is not null`,
);
const idSub = Object.fromEntries(subs.rows.map((r) => [r.name, r.id]));

const semDestino = [
  ...new Set(semCat.rows.map((r) => r.cat).filter((cat) => !MAPA_CATEGORIA[cat])),
];

if (semDestino.length) {
  console.log("⚠️  Categorias sem destino no MAPA:", semDestino.join(", "));
  console.log("Complete o MAPA_CATEGORIA antes de aplicar.");
  await c.end();
  process.exit(1);
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO (nada gravado) ---\n");
  console.log(`1. Compras de teste a apagar: ${comprasLixo.rows.length}`);
  console.log("   (as 4 compras de exemplo da base curada ficam)\n");
  console.log(`2. Fornecedores fantasma a apagar: ${lixo.rows.length}`);
  console.log("   (nenhum deles está ligado a material real)\n");
  console.log(`3. Materiais a recategorizar: ${semCat.rows.length}`);
  const porCat = {};
  for (const r of semCat.rows) (porCat[r.cat] ??= []).push(r.name);
  for (const [cat, itens] of Object.entries(porCat)) {
    console.log(`   ${cat}  ->  ${MAPA_CATEGORIA[cat]}   (${itens.length} itens)`);
  }
  console.log("\nPara aplicar: node scripts/arrumar-estoque.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* 1a. compras de teste saem primeiro: elas seguram os fornecedores. */
  let comprasApagadas = 0;
  if (comprasLixo.rows.length) {
    const ids = comprasLixo.rows.map((x) => x.id);
    /* itens da compra podem existir em outra tabela; se existir, cai junto */
    const temItens = await c.query(
      `select to_regclass('public.purchase_items') is not null ok`,
    );
    if (temItens.rows[0].ok) {
      await c.query(`delete from purchase_items where purchase_id = any($1::int[])`, [ids]);
    }
    const r = await c.query(`delete from purchases where id = any($1::int[])`, [ids]);
    comprasApagadas = r.rowCount;
  }
  console.log(`Compras de teste apagadas: ${comprasApagadas}`);

  /* 1b. apaga fornecedores de teste que não são usados por ninguém */
  let apagados = 0;
  if (lixo.rows.length) {
    const r = await c.query(
      `delete from suppliers where id = any($1::int[])`,
      [lixo.rows.map((x) => x.id)],
    );
    apagados = r.rowCount;
  }
  console.log(`Fornecedores fantasma apagados: ${apagados}`);

  /* 2. devolve a categoria de cada material, lendo o que a contagem registrou */
  let recategorizados = 0;
  for (const m of semCat.rows) {
    const destino = idSub[MAPA_CATEGORIA[m.cat]];
    if (!destino) continue;
    const r = await c.query(`update materials set category_id=$1 where id=$2`, [
      destino,
      m.id,
    ]);
    recategorizados += r.rowCount;
  }
  console.log(`Materiais recategorizados: ${recategorizados}`);

  await c.query("commit");

  /* ---------- relatório ---------- */
  const fim = await c.query(`
    select coalesce(pai.name || ' > ' || sub.name, '(sem categoria)') categoria,
           count(*)::int n,
           count(*) filter (where m.supplier_id is null)::int sem_forn,
           round(sum(coalesce(m.stock,0) * coalesce(m.unit_cost,0))::numeric, 2) valor
      from materials m
      left join item_categories sub on sub.id = m.category_id
      left join item_categories pai on pai.id = sub.parent_id
     group by 1 order by 1`);
  console.log("\n✅ Estoque por categoria:");
  for (const r of fim.rows) {
    const alerta = r.sem_forn ? `  ⚠️ ${r.sem_forn} sem fornecedor` : "";
    console.log(
      `   ${r.categoria.padEnd(34)} ${String(r.n).padStart(3)} itens  R$ ${String(r.valor).padStart(9)}${alerta}`,
    );
  }
  const s = await c.query(
    `select count(*)::int total,
            count(*) filter (where name like 'E2E%')::int e2e from suppliers`,
  );
  console.log(
    `\nFornecedores: ${s.rows[0].total} (${s.rows[0].e2e} ainda de teste)`,
  );
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
