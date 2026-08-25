#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Categorias de material + classificação do que já existe.

     node scripts/seed-categorias-materiais.mjs             (simula)
     node scripts/seed-categorias-materiais.mjs --aplicar

   O banco tinha `materials.category_id` e a tabela `item_categories`
   desde sempre, e a tela já mostrava a coluna "Categoria" — mas
   NENHUMA categoria de material havia sido criada. Resultado: 22
   materiais, todos "—", e um <select> com uma opção só ("Sem
   categoria").

   As oito categorias saem do que a gráfica realmente faz:
   papelaria personalizada, gráfica rápida, brindes (copo long drink,
   eco copo, taça gin) e impressão 3D.

   A classificação automática usa palavra-chave no nome. Só toca em
   material SEM categoria — o que já foi classificado à mão fica como
   está, porque quem classificou sabia mais que o script.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/* Ordem de exibição pensada no uso: o que mais sai primeiro.
   Adesivo lidera porque, palavras do dono, "é o que mais sai". */
/* `icon` guarda EMOJI, não nome de ícone — é a convenção que as
   categorias de produto e acabamento já usavam, e a tela imprime o
   valor direto dentro do <option>. */
const CATEGORIAS = [
  { name: "Adesivo & Vinil",       icon: "🏷️", color: "#e11d8f", order: 1 },
  { name: "Papel & Cartonagem",    icon: "📄", color: "#0ea5e9", order: 2 },
  { name: "Tinta, Toner & DTF",    icon: "🎨", color: "#7c3aed", order: 3 },
  { name: "Brindes para gravar",   icon: "🥤", color: "#f59e0b", order: 4 },
  { name: "Filamento & Resina 3D", icon: "🧊", color: "#10b981", order: 5 },
  { name: "Acabamento",            icon: "✂️", color: "#f43f5e", order: 6 },
  { name: "Embalagem",             icon: "📦", color: "#64748b", order: 7 },
  { name: "Uso geral",             icon: "🧰", color: "#94a3b8", order: 8 },
];

/* Palavras-chave por categoria. A ordem importa: a primeira que bate
   vence, então o específico vem antes do genérico.

   "Ribbon" é o caso que justifica isso: é uma fita de tinta usada na
   impressora térmica. Cai em Tinta, não em Acabamento — apesar de
   "fita" soar como acabamento. */
const REGRAS = [
  ["Filamento & Resina 3D", [
    /\bfilament/i, /\bpla\b/i, /\babs\b/i, /\bpetg\b/i, /\btpu\b/i,
    /resina\s*(3d|uv|foto)/i, /\bsla\b/i, /\bnylon\b/i,
  ]],
  ["Brindes para gravar", [
    /\bcopo/i, /long\s*drink/i, /eco\s*copo/i, /\bta[çc]a/i, /\bgin\b/i,
    /caneca/i, /squeeze/i, /garrafa/i, /chaveiro/i, /\bcanet[ao]/i,
    /\bim[ãa]\b/i, /porta[- ]copo/i, /\bbon[ée]/i, /camiseta/i, /\becobag/i,
  ]],
  ["Tinta, Toner & DTF", [
    /\btinta/i, /\btoner/i, /cartucho/i, /\bribbon/i, /\bdtf\b/i,
    /\bpo?\s*hot\s*melt/i, /\bp[óo]\s*(dtf|adesivo)/i, /revelador/i,
    /\bcilindro/i, /\bdrum\b/i, /sublima/i,
  ]],
  ["Adesivo & Vinil", [
    /adesiv/i, /\bvinil/i, /\bbopp\b/i, /etiqueta/i, /\blona\b/i,
    /recorte/i, /m[áa]scara/i, /transfer/i, /\bimant/i,
  ]],
  ["Papel & Cartonagem", [
    /\bpapel/i, /sulfite/i, /chamex/i, /couch[êe]/i, /\bofset|offset/i,
    /cart[ãa]o/i, /cartolina/i, /\bkraft/i, /duplex/i, /triplex/i,
    /\bfotogr[áa]f/i, /\bglossy/i, /\bcanson/i, /vergê|verge/i,
  ]],
  ["Acabamento", [
    /ilh[óo]s/i, /espiral/i, /wire[- ]?o/i, /\bla[çc]o/i, /\bfita\b/i,
    /\bcola\b/i, /verniz/i, /lamina/i, /plastific/i, /grampo/i,
    /\bfuro/i, /rebite/i, /\bcordão|cordao/i, /\bpercinta/i,
  ]],
  ["Embalagem", [
    /embalag/i, /\bsacol[ao]/i, /\bsaco\b/i, /caixa/i, /\bbobina\b/i,
    /papel[- ]?bolha/i, /\bstretch/i, /\bplastico\s*bolha/i, /\benvelope/i,
  ]],
];

function classificar(nome) {
  for (const [cat, padroes] of REGRAS) {
    if (padroes.some((p) => p.test(nome))) return cat;
  }
  return null;
}

try {
  console.log("\n" + "═".repeat(66));
  console.log(`  CATEGORIAS DE MATERIAL  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(66));

  /* ── 1. Criar as categorias que faltam ── */
  const { rows: jaTem } = await client.query(
    `SELECT id, name FROM item_categories WHERE module = 'material'`
  );
  const mapa = new Map(jaTem.map((r) => [r.name, r.id]));

  console.log("\n  CATEGORIAS:");
  let criadas = 0;
  for (const c of CATEGORIAS) {
    if (mapa.has(c.name)) {
      console.log(`   = ${c.name}`);
      /* Mantém ícone/cor/ordem alinhados se o catálogo mudar — o
         NOME é a identidade, o resto é apresentação. */
      if (APLICAR) {
        await client.query(
          `UPDATE item_categories SET icon = $1, color = $2, "order" = $3
            WHERE id = $4`,
          [c.icon, c.color, c.order, mapa.get(c.name)]
        );
      }
      continue;
    }
    console.log(`   + ${c.name}`);
    criadas++;
    if (APLICAR) {
      const { rows } = await client.query(
        `INSERT INTO item_categories (module, name, icon, color, "order")
         VALUES ('material', $1, $2, $3, $4) RETURNING id`,
        [c.name, c.icon, c.color, c.order]
      );
      mapa.set(c.name, rows[0].id);
    }
  }

  /* ── 2. Classificar o que está sem categoria ── */
  const { rows: soltos } = await client.query(
    `SELECT id, name FROM materials WHERE category_id IS NULL ORDER BY name`
  );

  console.log(`\n  MATERIAIS SEM CATEGORIA: ${soltos.length}`);

  const porCat = new Map();
  const semPalpite = [];

  for (const m of soltos) {
    const cat = classificar(m.name);
    if (!cat) {
      semPalpite.push(m.name);
      continue;
    }
    if (!porCat.has(cat)) porCat.set(cat, []);
    porCat.get(cat).push(m);
  }

  for (const [cat, itens] of [...porCat].sort()) {
    console.log(`\n   ${cat}  (${itens.length})`);
    for (const m of itens.slice(0, 6)) console.log(`     · ${m.name}`);
    if (itens.length > 6) console.log(`     · … mais ${itens.length - 6}`);

    if (APLICAR) {
      const id = mapa.get(cat);
      if (!id) {
        console.log(`     ! categoria "${cat}" não existe — pulando`);
        continue;
      }
      await client.query(
        `UPDATE materials SET category_id = $1 WHERE id = ANY($2) AND category_id IS NULL`,
        [id, itens.map((m) => m.id)]
      );
    }
  }

  if (semPalpite.length) {
    console.log(`\n   Sem palpite seguro (${semPalpite.length}) — ficam sem categoria:`);
    for (const n of semPalpite.slice(0, 10)) console.log(`     · ${n}`);
    if (semPalpite.length > 10) console.log(`     · … mais ${semPalpite.length - 10}`);
    console.log("     (classifique na tela; o script não chuta)");
  }

  console.log("\n" + "  " + "─".repeat(62));
  if (APLICAR) {
    const { rows: r } = await client.query(`
      SELECT coalesce(c.name,'(sem categoria)') cat, count(*)::int n
        FROM materials m
        LEFT JOIN item_categories c ON c.id = m.category_id
       GROUP BY 1 ORDER BY 2 DESC`);
    console.log("  RESULTADO:");
    for (const x of r) console.log(`   ${String(x.n).padStart(3)}  ${x.cat}`);
    console.log(`\n✅ ${criadas} categoria(s) criada(s), ${soltos.length - semPalpite.length} material(is) classificado(s).\n`);
  } else {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/seed-categorias-materiais.mjs --aplicar\n");
  }
} catch (e) {
  console.error("\n✖ falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
