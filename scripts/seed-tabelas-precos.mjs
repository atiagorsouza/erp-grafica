/**
 * Tabelas de preço reais do usuário (DTF UV, DTF Têxtil, Lona, Vinil).
 *
 * Ambiente é efêmero: quando o sandbox recicla, o Postgres volta vazio.
 * Rodar depois de `seed-parque-real.mjs`:
 *
 *   node scripts/seed-tabelas-precos.mjs
 */
import pg from "pg";

const c = new pg.Client({
  host: "127.0.0.1",
  user: "postgres",
  password: "postgres",
  database: "app_db",
});
await c.connect();

await c.query("delete from pricing_tables");

/* --------------------------------------------------------------------
 * DTF — folha FECHADA de tamanho fixo. O preço é da folha inteira; o
 * que muda é quantas peças cabem. A folha é INDIVISÍVEL: 8 canecas
 * consomem 2 folhas de 6 e a sobra é perda.
 *
 * `piecesPerSheet` no têxtil é 1 porque a estampa ocupa a folha toda.
 * No UV vem da referência do usuário: 6 canecas na 20×28 (≈93 cm² por
 * caneca); A3 e Metro foram derivados por área — CONFIRMAR.
 *
 * `sellPrice` são valores de partida (~2,2× o custo) — ajustar.
 * ------------------------------------------------------------------ */
const rows = [
  // type, label, custo, venda, unit, w, h, pcs/folha, minCusto, minVenda
  ["dtf_textil", "DTF Textil A4+ 38x25", "11.61", "29.00", "unidade", "38", "25", "1", "0", "0"],
  ["dtf_textil", "DTF Textil A3+ 38x50", "24.03", "56.00", "unidade", "38", "50", "1", "0", "0"],
  ["dtf_textil", "DTF Textil Metro 38x100", "36.00", "79.00", "unidade", "38", "100", "1", "0", "0"],

  ["dtf_uv", "DTF UV A4 20x28", "23.22", "55.00", "unidade", "20", "28", "6", "0", "0"],
  ["dtf_uv", "DTF UV A3 28x40", "36.00", "82.00", "unidade", "28", "40", "12", "0", "0"],
  ["dtf_uv", "DTF UV Metro 28x100", "67.50", "149.00", "unidade", "28", "100", "30", "0", "0"],

  /* Lona/Vinil: preço por m² com PISO EM REAIS por peça. O piso de
     custo é o do fornecedor (26/30); o de venda é o seu, com margem —
     usar o mesmo nos dois zerava o lucro nas peças pequenas. */
  ["lona", "Lona 440g", "45.00", "89.00", "m2", "100", "100", "1", "26", "60"],
  ["adesivo", "Vinil adesivo", "45.00", "95.00", "m2", "100", "100", "1", "30", "70"],
];

for (const [type, label, cost, sell, unit, w, h, pcs, minC, minS] of rows) {
  await c.query(
    `insert into pricing_tables
       (type, label, unit_cost, sell_price, unit, width_cm, height_cm,
        pieces_per_sheet, min_charge, min_charge_sell, min_qty, active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'1',true)`,
    [type, label, cost, sell, unit, w, h, pcs, minC, minS]
  );
}

console.log("linhas de tabela:", rows.length);
await c.end();
