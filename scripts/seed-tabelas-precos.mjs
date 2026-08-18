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
 * `piecesPerSheet` = 1 é só a REFERÊNCIA: quantas peças cabem depende
 * do tamanho da ESTAMPA, não da folha (6 canecas ou 30 chaveiros na
 * mesma 20×28). Quem define é o produto (`basePricingTablePieces`) ou
 * a linha de venda no PDV (`piecesPerSheet` no item).
 *
 * `sellPrice` = custo × 2,2, confirmado pelo usuário.
 * ------------------------------------------------------------------ */
const rows = [
  // type, label, custo, venda, unit, w, h, pcs/folha, minCusto, minVenda
  ["dtf_textil", "DTF Textil A4+ 38x25", "11.61", "25.54", "unidade", "38", "25", "1", "0", "0"],
  ["dtf_textil", "DTF Textil A3+ 38x50", "24.03", "52.87", "unidade", "38", "50", "1", "0", "0"],
  ["dtf_textil", "DTF Textil Metro 38x100", "36.00", "79.20", "unidade", "38", "100", "1", "0", "0"],

  ["dtf_uv", "DTF UV A4 20x28", "23.22", "51.08", "unidade", "20", "28", "1", "0", "0"],
  ["dtf_uv", "DTF UV A3 28x40", "36.00", "79.20", "unidade", "28", "40", "1", "0", "0"],
  ["dtf_uv", "DTF UV Metro 28x100", "67.50", "148.50", "unidade", "28", "100", "1", "0", "0"],

  /* GRANDE FORMATO — preços reais do fornecedor (v3.46.1).
   *
   * A VTDIGITAL não tem plotter de grande formato: lona e adesivo são
   * TERCEIRIZADOS. Os valores de custo abaixo são o que o fornecedor
   * cobra por m²; a venda sai da fórmula do motor
   * (margem 40% + imposto 6% + pagamento 6,12% → divisor 0,4788),
   * arredondada para múltiplo de R$5 por ser mais fácil de falar ao
   * telefone. A margem real fica em 40-41%.
   *
   * PISO EM REAIS: abaixo de 1 m² cobra-se o piso, não a fração. Um
   * adesivo de 30×30 (0,09 m²) custaria R$2,79 sem piso — não paga nem
   * o tempo de atendimento. O piso de CUSTO é o do fornecedor; o de
   * VENDA leva a mesma margem, senão a peça pequena sai no prejuízo.
   *
   * As 4 linhas são materiais/serviços distintos, não variações:
   * o recorte eletrônico e a máscara de transferência (fita que
   * transporta o desenho recortado para a parede/vidro) são etapas a
   * mais, cada uma com seu preço fechado. */
  ["lona", "Lona e Banner", "35.00", "75.00", "m2", "100", "100", "1", "26", "55"],
  ["adesivo", "Adesivo vinil", "31.00", "65.00", "m2", "100", "100", "1", "20", "45"],
  ["adesivo", "Adesivo vinil com recorte", "40.00", "85.00", "m2", "100", "100", "1", "30", "65"],
  ["adesivo", "Adesivo com recorte e máscara", "50.00", "105.00", "m2", "100", "100", "1", "37", "80"],
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
