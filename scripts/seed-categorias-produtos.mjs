#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Árvore de categorias de produto — 4 mestres, 14 subcategorias.

     node scripts/seed-categorias-produtos.mjs             (simula)
     node scripts/seed-categorias-produtos.mjs --aplicar

   Desenho do dono, não meu. Ele mandou a árvore pronta depois de
   duas rodadas rejeitando meus nomes ("Corporativo & Escritório",
   "Embalagem & Unboxing"), e a versão dele é melhor: organiza por
   COMO O CLIENTE PERGUNTA, não por máquina.

   As 4 mestres batem com as 4 frentes reais do negócio:
   gráfica rápida · papelaria personalizada · brindes · 3D.

   Só DOIS níveis. Com três ninguém acha nada.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/* A ordem das mestres é a do faturamento, não alfabética. */
const ARVORE = [
  {
    name: "Gráfica Rápida & Divulgação", icon: "🖨️", color: "#0ea5e9", order: 1,
    filhos: [
      { name: "Serviços de Balcão & Cópias",  icon: "📑", order: 1 },
      { name: "Impressos Comerciais",          icon: "💼", order: 2 },
      { name: "Divulgação & Panfletagem",      icon: "📣", order: 3 },
      { name: "Comunicação Visual Rápida",     icon: "🏷️", order: 4 },
    ],
  },
  {
    name: "Papelaria Personalizada", icon: "🎨", color: "#e11d8f", order: 2,
    filhos: [
      { name: "Organização & Encadernação",     icon: "📓", order: 1 },
      { name: "Festas & Eventos",               icon: "🎉", order: 2 },
      { name: "Papelaria para Lojas e E-commerce", icon: "🛍️", order: 3 },
    ],
  },
  {
    name: "Brindes & Estamparia", icon: "🥤", color: "#f59e0b", order: 3,
    filhos: [
      { name: "Copos & Acrílicos",       icon: "🍸", order: 1 },
      { name: "Sublimação Clássica",     icon: "☕", order: 2 },
      { name: "Estamparia Têxtil",       icon: "👕", order: 3 },
      { name: "Bottons & Acessórios",    icon: "🎖️", order: 4 },
    ],
  },
  {
    name: "Impressão 3D & Modelagem", icon: "🤖", color: "#10b981", order: 4,
    filhos: [
      { name: "Peças Decorativas & Colecionáveis", icon: "🧊", order: 1 },
      { name: "Cortadores & Confeitaria",          icon: "🍪", order: 2 },
      { name: "Corporativo & Utilitários",         icon: "🏆", order: 3 },
    ],
  },
];

/* Para onde vai cada produto já cadastrado. Chave = nome exato.

   Feito à mão em vez de por palavra-chave: são 16 produtos e o custo
   de errar é o dono reclassificando na unha. Palpite automático serve
   para 200 itens, não para 16. */
const REMAPA = {
  "Impressão A4 colorida":            "Serviços de Balcão & Cópias",
  "Impressão A3 colorida":            "Serviços de Balcão & Cópias",
  "Cartão de visita 100un":           "Impressos Comerciais",
  "Cartão de visita 200un":           "Impressos Comerciais",
  "Panfleto A5 colorido (100un)":     "Divulgação & Panfletagem",
  "Banner em lona 440g":              "Comunicação Visual Rápida",
  "Adesivo vinil impresso":           "Comunicação Visual Rápida",
  "Adesivo vinil recortado":          "Comunicação Visual Rápida",
  "Agenda personalizada":             "Organização & Encadernação",
  "Kit papelaria personalizada":      "Organização & Encadernação",
  "Camiseta personalizada DTF":       "Estamparia Têxtil",
  "Caneca long drink personalizada":  "Copos & Acrílicos",
  "Taça de gin personalizada":        "Copos & Acrílicos",
  "Eco copo personalizado":           "Copos & Acrílicos",
  "Peça 3D em PLA":                   "Peças Decorativas & Colecionáveis",
  "Peça 3D com modelagem":            "Peças Decorativas & Colecionáveis",
};

const q = async (s, p = []) => (await client.query(s, p)).rows;

try {
  console.log("\n" + "═".repeat(66));
  console.log(`  ÁRVORE DE PRODUTOS  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(66));

  const existentes = await q(
    `SELECT id, name, parent_id FROM item_categories WHERE module = 'product'`
  );
  const porNome = new Map(existentes.map((r) => [r.name, r]));

  let criadas = 0;

  for (const mestre of ARVORE) {
    let idMestre = porNome.get(mestre.name)?.id;
    const jaTinha = !!idMestre;
    console.log(`\n  ${jaTinha ? "=" : "+"} ${mestre.icon} ${mestre.name}`);

    if (APLICAR) {
      if (!idMestre) {
        const [r] = await q(
          `INSERT INTO item_categories (module, name, icon, color, "order", parent_id)
           VALUES ('product', $1, $2, $3, $4, NULL) RETURNING id`,
          [mestre.name, mestre.icon, mestre.color, mestre.order]
        );
        idMestre = r.id;
        porNome.set(mestre.name, { id: idMestre, name: mestre.name, parent_id: null });
      } else {
        /* Mantém apresentação alinhada; o NOME é a identidade. */
        await client.query(
          `UPDATE item_categories SET icon=$1, color=$2, "order"=$3, parent_id=NULL WHERE id=$4`,
          [mestre.icon, mestre.color, mestre.order, idMestre]
        );
      }
    }
    if (!jaTinha) criadas++;

    for (const filho of mestre.filhos) {
      const existe = porNome.get(filho.name);
      console.log(`      ${existe ? "=" : "+"} ${filho.icon} ${filho.name}`);
      if (!existe) criadas++;

      if (APLICAR) {
        if (existe) {
          await client.query(
            `UPDATE item_categories SET icon=$1, color=$2, "order"=$3, parent_id=$4 WHERE id=$5`,
            [filho.icon, mestre.color, filho.order, idMestre, existe.id]
          );
        } else {
          const [r] = await q(
            `INSERT INTO item_categories (module, name, icon, color, "order", parent_id)
             VALUES ('product', $1, $2, $3, $4, $5) RETURNING id`,
            [filho.name, filho.icon, mestre.color, filho.order, idMestre]
          );
          porNome.set(filho.name, { id: r.id, name: filho.name, parent_id: idMestre });
        }
      }
    }
  }

  /* ── Remapeamento dos produtos ── */
  console.log("\n  " + "─".repeat(62));
  console.log("  PRODUTOS:");

  const produtos = await q(
    `SELECT p.id, p.name, c.name AS cat
       FROM products p
       LEFT JOIN item_categories c ON c.id = p.product_category_id
      ORDER BY p.name`
  );

  let movidos = 0;
  const semDestino = [];

  for (const p of produtos) {
    const destino = REMAPA[p.name];
    if (!destino) {
      semDestino.push(p.name);
      continue;
    }
    if (p.cat === destino) continue;

    console.log(`   → ${p.name}`);
    console.log(`       ${p.cat || "(sem)"}  ⇒  ${destino}`);
    movidos++;

    if (APLICAR) {
      const alvo = porNome.get(destino);
      if (alvo) {
        await client.query(`UPDATE products SET product_category_id = $1 WHERE id = $2`, [alvo.id, p.id]);
      }
    }
  }

  if (semDestino.length) {
    console.log(`\n   Sem destino definido (${semDestino.length}) — ficam como estão:`);
    for (const n of semDestino.slice(0, 8)) console.log(`     · ${n}`);
  }

  /* ── Categorias antigas que sobraram vazias ── */
  if (APLICAR) {
    const orfas = await q(`
      SELECT c.id, c.name FROM item_categories c
       WHERE c.module = 'product'
         AND c.parent_id IS NULL
         AND c.name <> ALL($1)
         AND NOT EXISTS (SELECT 1 FROM products p WHERE p.product_category_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM item_categories f WHERE f.parent_id = c.id)`,
      [ARVORE.map((m) => m.name)]
    );
    if (orfas.length) {
      console.log(`\n  ANTIGAS, agora vazias (removidas): ${orfas.map((o) => o.name).join(", ")}`);
      await client.query(`DELETE FROM item_categories WHERE id = ANY($1)`, [orfas.map((o) => o.id)]);
    }
  }

  console.log("\n" + "  " + "─".repeat(62));
  if (APLICAR) {
    const arv = await q(`
      SELECT m.name mestre, count(f.id)::int subs,
             (SELECT count(*) FROM products p
               WHERE p.product_category_id = m.id
                  OR p.product_category_id IN (SELECT id FROM item_categories x WHERE x.parent_id = m.id)
             )::int itens
        FROM item_categories m
        LEFT JOIN item_categories f ON f.parent_id = m.id
       WHERE m.module='product' AND m.parent_id IS NULL
       GROUP BY m.id, m.name, m."order" ORDER BY m."order"`);
    for (const a of arv) {
      console.log(`   ${String(a.itens).padStart(3)} produto(s)  ${a.mestre}  (${a.subs} sub)`);
    }
    console.log(`\n✅ ${criadas} categoria(s) criada(s), ${movidos} produto(s) remapeado(s).\n`);
  } else {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/seed-categorias-produtos.mjs --aplicar\n");
  }
} catch (e) {
  console.error("\n✖ falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
