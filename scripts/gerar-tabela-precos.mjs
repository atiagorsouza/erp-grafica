#!/usr/bin/env node
/**
 * Gera a TABELA DE PRECOS INTERNA em A4 e A3 deitado.
 *
 * Uso interno de balcao: mostra custo, margem e piso de desconto.
 * NAO e a tabela do cliente — o dono desistiu da versao do cliente
 * nesta rodada e pediu so a interna, nos dois formatos deitados.
 *
 *   node scripts/gerar-tabela-precos.mjs
 *
 * Saida: tabelas/tabela-interna-a4.html e tabelas/tabela-interna-a3.html
 * Abrir no navegador e imprimir em PDF (o @page ja fixa o formato).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MARGEM_MINIMA = 0.5; // piso de desconto: nunca vender abaixo de 50% de margem

const EMPRESA = {
  nome: "VTDIGITAL ART STUDIO",
  fone: "(21) 2038-3504 · (21) 97886-9414",
};

/** Ordem das secoes na folha. O que mais sai no balcao vem primeiro. */
const ORDEM = [
  "Cópias e Impressões",
  "Encadernação",
  "Fotos",
  "Cartões e Panfletos",
  "Adesivos",
  "Copos e Acrílicos",
  "Agendas e Cadernos",
];

const brl = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** Piso de desconto: menor preco que ainda deixa MARGEM_MINIMA, arredondado pra cima em 0,05. */
function piso(custo) {
  const bruto = Number(custo) / (1 - MARGEM_MINIMA);
  return Math.ceil(bruto * 20) / 20;
}

function margem(venda, custo) {
  const v = Number(venda);
  if (!v) return 0;
  return ((v - Number(custo)) / v) * 100;
}

async function carregar() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    select coalesce(c.name,'Outros') as cat,
           p.sku, p.name,
           p.final_price::numeric(12,4)   as venda,
           p.cost_snapshot::numeric(12,4) as custo,
           coalesce((
             select json_agg(json_build_object('q', t.min_quantity::numeric(12,0), 'p', t.unit_price::numeric(12,4))
                             order by t.min_quantity)
             from product_price_tiers t where t.product_id = p.id
           ), '[]'::json) as faixas
    from products p
    left join item_categories c on c.id = p.product_category_id
    where p.active
    order by 1, 2
  `);
  await client.end();
  return rows;
}

function agrupar(rows) {
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.cat)) mapa.set(r.cat, []);
    mapa.get(r.cat).push(r);
  }
  const ordenado = [];
  for (const nome of ORDEM) if (mapa.has(nome)) ordenado.push([nome, mapa.get(nome)]);
  for (const [nome, itens] of mapa) if (!ORDEM.includes(nome)) ordenado.push([nome, itens]);
  return ordenado;
}

function linhaProduto(r) {
  const faixas = r.faixas || [];
  const m = margem(r.venda, r.custo);
  const alerta = m < 40 ? " linha-alerta" : "";

  // As faixas viram chips "qtd → preco". Sem faixa, mostra so o balcao.
  const chips = faixas.length
    ? faixas.map((f) => `<span class="chip"><b>${f.q}</b>${brl(f.p)}</span>`).join("")
    : `<span class="chip"><b>1</b>${brl(r.venda)}</span>`;

  return `<tr class="prod${alerta}">
    <td class="nome">${esc(r.name)}<span class="sku">${esc(r.sku || "")}</span></td>
    <td class="faixas">${chips}</td>
    <td class="num custo">${brl(r.custo)}</td>
    <td class="num piso">${brl(piso(r.custo))}</td>
    <td class="num marg">${m.toFixed(0)}%</td>
  </tr>`;
}

function render(grupos, formato) {
  const secoes = grupos
    .map(
      ([cat, itens]) => `<section class="bloco">
      <h2>${esc(cat)}</h2>
      <table>
        <thead><tr>
          <th class="nome">Produto</th>
          <th class="faixas">Preço por quantidade</th>
          <th class="num">Custo</th>
          <th class="num">Piso</th>
          <th class="num">Marg.</th>
        </tr></thead>
        <tbody>${itens.map(linhaProduto).join("")}</tbody>
      </table>
    </section>`
    )
    .join("");

  const a3 = formato === "A3";
  const hoje = new Date().toLocaleDateString("pt-BR");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Tabela interna ${formato} — ${EMPRESA.nome}</title>
<style>
  @page { size: ${formato} landscape; margin: ${a3 ? "10mm" : "7mm"}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Helvetica Neue", Arial, sans-serif;
         font-size: ${a3 ? "11.5px" : "8.2px"}; color:#15181d; background:#fff; }
  .folha { padding: ${a3 ? "10mm" : "7mm"}; }

  header { display:flex; align-items:flex-end; justify-content:space-between;
           border-bottom:2.5px solid #15181d; padding-bottom:${a3 ? "5px" : "3px"}; margin-bottom:${a3 ? "8px" : "5px"}; }
  h1 { margin:0; font-size:${a3 ? "20px" : "14px"}; letter-spacing:-0.3px; }
  h1 small { font-weight:400; color:#6b7280; font-size:${a3 ? "12px" : "8.5px"}; margin-left:8px; letter-spacing:0; }
  .selo { font-size:${a3 ? "11px" : "7.5px"}; font-weight:700; letter-spacing:1.5px;
          background:#15181d; color:#fff; padding:${a3 ? "3px 9px" : "2px 6px"}; border-radius:3px; }
  .meta { text-align:right; font-size:${a3 ? "10px" : "7px"}; color:#6b7280; line-height:1.5; }

  /* Duas colunas de blocos: tudo tem de caber numa folha so. */
  .grade { column-count:2; column-gap:${a3 ? "9mm" : "5mm"}; }
  .bloco { break-inside:avoid; margin-bottom:${a3 ? "7px" : "4.5px"}; }
  h2 { margin:0 0 2px; font-size:${a3 ? "12px" : "8.5px"}; text-transform:uppercase;
       letter-spacing:1.1px; color:#0f766e; border-bottom:1px solid #99f6e4; padding-bottom:1.5px; }

  table { width:100%; border-collapse:collapse; }
  thead th { font-size:${a3 ? "8.5px" : "6.2px"}; text-transform:uppercase; letter-spacing:0.7px;
             color:#9ca3af; font-weight:700; text-align:left; padding:1.5px 3px; }
  thead th.num { text-align:right; }
  td { padding:${a3 ? "2.5px 3px" : "1.6px 3px"}; border-top:1px solid #eef0f2; vertical-align:middle; }
  tr.prod:nth-child(even) td { background:#fafbfc; }

  td.nome { font-weight:600; width:${a3 ? "31%" : "30%"}; line-height:1.2; }
  .sku { display:block; font-family:ui-monospace,Menlo,monospace; font-weight:400;
         font-size:${a3 ? "8px" : "5.8px"}; color:#9ca3af; letter-spacing:0.2px; }

  td.faixas { width:${a3 ? "40%" : "40%"}; }
  .chip { display:inline-block; background:#f1f5f9; border-radius:3px;
          padding:${a3 ? "1px 5px" : "0.5px 3px"}; margin:0.5px 2px 0.5px 0;
          font-family:ui-monospace,Menlo,monospace; font-size:${a3 ? "9.5px" : "6.6px"}; white-space:nowrap; }
  .chip b { color:#0f766e; margin-right:3px; font-weight:700; }

  td.num { text-align:right; font-family:ui-monospace,Menlo,monospace;
           font-size:${a3 ? "10px" : "7px"}; white-space:nowrap; }
  td.custo { color:#9ca3af; }
  td.piso  { color:#b45309; font-weight:700; }
  td.marg  { font-weight:700; }
  tr.linha-alerta td.marg { color:#dc2626; }

  footer { margin-top:${a3 ? "8px" : "5px"}; border-top:1.5px solid #15181d;
           padding-top:${a3 ? "5px" : "3px"}; display:flex; justify-content:space-between;
           font-size:${a3 ? "9.5px" : "6.6px"}; color:#4b5563; }
  .legenda b { color:#b45309; }
  @media print { .folha { padding:0; } }
</style></head>
<body><div class="folha">
  <header>
    <div>
      <h1>Tabela de Preços <small>${EMPRESA.nome}</small></h1>
      <span class="selo">USO INTERNO — NÃO ENTREGAR AO CLIENTE</span>
    </div>
    <div class="meta">${formato} deitado · ${hoje}<br>${EMPRESA.fone}</div>
  </header>

  <div class="grade">${secoes}</div>

  <footer>
    <div class="legenda">
      <b>Piso</b> = menor preço que ainda deixa ${MARGEM_MINIMA * 100}% de margem. Abaixo disso, só com autorização.
      &nbsp;·&nbsp; <b>Custo</b> já inclui papel, clique, acabamento e perda.
      &nbsp;·&nbsp; Margem em vermelho = abaixo de 40%.
    </div>
    <div>Gerado pelo sistema · confira antes de fechar desconto grande</div>
  </footer>
</div></body></html>`;
}

const rows = await carregar();
const grupos = agrupar(rows);
const dir = path.join(process.cwd(), "tabelas");
fs.mkdirSync(dir, { recursive: true });

for (const fmt of ["A4", "A3"]) {
  const arquivo = path.join(dir, `tabela-interna-${fmt.toLowerCase()}.html`);
  fs.writeFileSync(arquivo, render(grupos, fmt));
  console.log(`  ✔ ${path.relative(process.cwd(), arquivo)}`);
}
console.log(`\n  ${rows.length} produtos em ${grupos.length} categorias.`);
const criticos = rows.filter((r) => margem(r.venda, r.custo) < 40);
if (criticos.length) {
  console.log(`  ⚠ ${criticos.length} com margem abaixo de 40%:`);
  for (const r of criticos) console.log(`      ${r.sku} — ${margem(r.venda, r.custo).toFixed(0)}%`);
}
