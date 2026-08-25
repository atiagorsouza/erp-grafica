#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Limpa ORÇAMENTOS FANTASMA do banco.

   O que é fantasma (pedido do dono, 25/08):
     • rascunho  com mais de 30 dias  — teste/esquecimento, nunca foi
       enviado a cliente nenhum
     • expirado ou recusado com mais de 90 dias — já passou, não paga
       aluguel na lista

   Por padrão só RELATA (dry-run): lista número, cliente, valor e idade.
   Para apagar de verdade, DUAS confirmações:
       node scripts/limpar-orcamentos-fantasma.mjs --aplicar --tenho-certeza

   Antes de --aplicar, rode um backup (bash scripts/backup.sh). Orçamento
   apagado leva junto ITENS e CARDS DO KANBAN vinculados (FK em cascata)
   — pedido NÃO é tocado: orçamento aprovado vira pedido antes, e
   aprovado recente não entra na regra.

   Aprovado e enviado NUNCA são apagados, de qualquer idade.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const CERTEZA = process.argv.includes("--tenho-certeza");

const REGRAS = [
  { status: "rascunho", dias: 30 },
  { status: "expirado", dias: 90 },
  { status: "recusado", dias: 90 },
];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  const partes = REGRAS.map(
    (r) => `(status = '${r.status}' AND created_at < now() - interval '${r.dias} days')`
  );
  const condicao = partes.join(" OR ");

  const { rows } = await pool.query(
    `SELECT id, number, status, total, created_at::date AS data,
            (SELECT name FROM customers WHERE id = quotes.customer_id) AS cliente
       FROM quotes WHERE ${condicao}
      ORDER BY created_at DESC`
  );

  if (!rows.length) {
    console.log("Nenhum orçamento fantasma. Base limpa ✔");
    process.exit(0);
  }

  const soma = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  console.log(`Fantasmas encontrados: ${rows.length} (soma de valores: R$ ${soma.toFixed(2)})`);
  console.log("Regra: " + REGRAS.map((r) => `${r.status} > ${r.dias} dias`).join(" · "));
  console.log("");
  for (const r of rows.slice(0, 40)) {
    console.log(
      `  ${r.number} · ${r.status} · ${r.data} · R$ ${Number(r.total || 0).toFixed(2)} · ${
        r.cliente || "sem cliente"
      }`
    );
  }
  if (rows.length > 40) console.log(`  … e mais ${rows.length - 40}`);

  if (!APLICAR) {
    console.log("");
    console.log("DRY-RUN: nada foi apagado. Confira a lista acima e, se estiver tudo certo:");
    console.log("  node scripts/limpar-orcamentos-fantasma.mjs --aplicar --tenho-certeza");
    process.exit(0);
  }

  if (!CERTEZA) {
    console.log("");
    console.log("Faltou --tenho-certeza. Nada foi apagado (itens e cards do Kanban iriam junto).");
    process.exit(1);
  }

  await pool.query("BEGIN");
  const ids = rows.map((r) => r.id);
  const itens = await pool.query("DELETE FROM quote_items WHERE quote_id = ANY($1::int[])", [ids]);
  const cards = await pool.query("DELETE FROM kanban_cards WHERE quote_id = ANY($1::int[])", [ids]);
  const mortos = await pool.query("DELETE FROM quotes WHERE id = ANY($1::int[]) RETURNING id", [ids]);
  await pool.query("COMMIT");

  console.log("");
  console.log(
    `✔ Apagados: ${mortos.rows.length} orçamentos · ${itens.rowCount} itens · ${cards.rowCount} cards do Kanban`
  );
} catch (e) {
  console.error("ERRO:", e.message);
  try {
    await pool.query("ROLLBACK");
  } catch {}
  process.exit(1);
} finally {
  await pool.end();
}
