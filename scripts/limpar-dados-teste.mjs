#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Remove o lixo deixado pelos testes automatizados.

     node scripts/limpar-dados-teste.mjs             (lista)
     node scripts/limpar-dados-teste.mjs --aplicar   (remove)

   O `e2e-smoke.mjs` cria material, cliente e produto de teste a cada
   execução e nem sempre apaga. Rodando o smoke em produção — o que o
   deploy faz no passo 9/9 — isso acumula: encontrei 10 "E2E Papel"
   e 110 movimentos de estoque órfãos no banco do dono.

   Não é grave, mas é sujeira que aparece na tela do operador e
   atrapalha na hora de conferir estoque.

   SEGURANÇA: só remove o que casa com os prefixos de teste abaixo, e
   só se o registro NÃO estiver preso a nada real (pedido, venda,
   produto). Na dúvida, mantém — dado do cliente vale mais que uma
   listagem limpa.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/* Prefixos que SÓ os testes usam. Nada aqui pode ser algo que um
   humano digitaria: por isso "E2E " e "TESTE-CAMP", não "teste". */
const PADROES = {
  materials: ["E2E Papel %", "E2E Material %"],
  customers: ["E2E Cliente%", "TESTE-CAMP%", "E2E PF %", "E2E PJ %"],
  products: ["E2E Produto%"],
  campaigns: ["TESTE-CAMP%"],
};

const q = async (s, p = []) => (await client.query(s, p)).rows;

try {
  console.log("\n" + "═".repeat(62));
  console.log(`  LIXO DE TESTE  ${APLICAR ? "(removendo)" : "(listando)"}`);
  console.log("═".repeat(62));

  let total = 0;

  /* ── Materiais ── */
  const mats = await q(
    `SELECT m.id, m.name,
            (SELECT count(*) FROM product_materials pm WHERE pm.material_id = m.id)::int usado
       FROM materials m
      WHERE ${PADROES.materials.map((_, i) => `m.name LIKE $${i + 1}`).join(" OR ")}
      ORDER BY m.name`,
    PADROES.materials
  );
  const matsLivres = mats.filter((m) => m.usado === 0);
  const matsPresos = mats.filter((m) => m.usado > 0);

  console.log(`\n  MATERIAIS de teste: ${mats.length}`);
  if (matsPresos.length) {
    console.log(`   ! ${matsPresos.length} está(ão) em uso por produtos — MANTIDOS`);
  }
  if (matsLivres.length) {
    for (const m of matsLivres.slice(0, 5)) console.log(`   − ${m.name}`);
    if (matsLivres.length > 5) console.log(`   − … mais ${matsLivres.length - 5}`);

    const ids = matsLivres.map((m) => m.id);
    const [{ n: movs }] = await q(
      `SELECT count(*)::int n FROM stock_movements WHERE material_id = ANY($1)`,
      [ids]
    );
    console.log(`     (+ ${movs} movimento(s) de estoque)`);
    total += matsLivres.length;

    if (APLICAR) {
      await client.query(`DELETE FROM stock_movements WHERE material_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM materials WHERE id = ANY($1)`, [ids]);
    }
  }

  /* ── Clientes ── */
  const cli = await q(
    `SELECT c.id, c.name,
            (SELECT count(*) FROM orders o WHERE o.customer_id = c.id)::int pedidos,
            (SELECT count(*) FROM sales s WHERE s.customer_id = c.id)::int vendas
       FROM customers c
      WHERE ${PADROES.customers.map((_, i) => `c.name LIKE $${i + 1}`).join(" OR ")}
      ORDER BY c.name`,
    PADROES.customers
  );
  const cliLivres = cli.filter((c) => c.pedidos === 0 && c.vendas === 0);
  const cliPresos = cli.filter((c) => c.pedidos > 0 || c.vendas > 0);

  console.log(`\n  CLIENTES de teste: ${cli.length}`);
  if (cliPresos.length) {
    console.log(`   ! ${cliPresos.length} têm pedido ou venda — MANTIDOS`);
  }
  if (cliLivres.length) {
    for (const c of cliLivres.slice(0, 5)) console.log(`   − ${c.name}`);
    if (cliLivres.length > 5) console.log(`   − … mais ${cliLivres.length - 5}`);
    total += cliLivres.length;
    if (APLICAR) {
      const ids = cliLivres.map((c) => c.id);
      await client.query(`DELETE FROM campaign_targets WHERE customer_id = ANY($1)`, [ids]).catch(() => {});
      await client.query(`DELETE FROM registration_links WHERE customer_id = ANY($1)`, [ids]).catch(() => {});
      await client.query(`DELETE FROM customers WHERE id = ANY($1)`, [ids]);
    }
  }

  /* ── Produtos ── */
  const prods = await q(
    `SELECT p.id, p.name FROM products p
      WHERE ${PADROES.products.map((_, i) => `p.name LIKE $${i + 1}`).join(" OR ")}`,
    PADROES.products
  );
  console.log(`\n  PRODUTOS de teste: ${prods.length}`);
  if (prods.length) {
    for (const p of prods.slice(0, 5)) console.log(`   − ${p.name}`);
    total += prods.length;
    if (APLICAR) {
      const ids = prods.map((p) => p.id);
      await client.query(`DELETE FROM product_materials WHERE product_id = ANY($1)`, [ids]).catch(() => {});
      await client.query(`DELETE FROM products WHERE id = ANY($1)`, [ids]);
    }
  }

  /* ── Campanhas ── */
  const camps = await q(
    `SELECT id, name FROM campaigns WHERE name LIKE $1`,
    PADROES.campaigns
  ).catch(() => []);
  if (camps.length) {
    console.log(`\n  CAMPANHAS de teste: ${camps.length}`);
    total += camps.length;
    if (APLICAR) {
      await client.query(`DELETE FROM campaigns WHERE name LIKE $1`, PADROES.campaigns);
    }
  }

  /* ── Movimentos órfãos (material já removido antes) ── */
  const [{ n: orfaos }] = await q(
    `SELECT count(*)::int n FROM stock_movements sm
      WHERE sm.material_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.id = sm.material_id)`
  );
  if (orfaos > 0) {
    console.log(`\n  MOVIMENTOS órfãos (material inexistente): ${orfaos}`);
    total += orfaos;
    if (APLICAR) {
      await client.query(`
        DELETE FROM stock_movements sm
         WHERE sm.material_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.id = sm.material_id)`);
    }
  }

  console.log("\n" + "─".repeat(62));
  if (!total) {
    console.log("  ✔ Nada de teste no banco.\n");
  } else if (APLICAR) {
    console.log(`  ✅ ${total} registro(s) de teste removido(s).\n`);
  } else {
    console.log(`  ${total} registro(s) de teste encontrado(s).`);
    console.log("→ Para remover: node scripts/limpar-dados-teste.mjs --aplicar\n");
  }
} catch (e) {
  console.error("\n✖ falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
