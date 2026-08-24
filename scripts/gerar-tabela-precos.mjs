#!/usr/bin/env node
/**
 * Gera a TABELA DE PRECOS INTERNA em A4 e A3 deitado.
 *
 *   node scripts/gerar-tabela-precos.mjs
 *
 * Saida: tabelas/tabela-interna-a4.html e tabelas/tabela-interna-a3.html
 * Abrir no navegador, Ctrl+P, salvar em PDF. O @page ja fixa o formato.
 *
 * LAYOUT — 3a versao, copiando a estrutura do PDF da Parede Print que o
 * dono mandou como referencia ("teria que ser assim"):
 *
 *   - faixa azul escura no topo, titulo centralizado em caixa alta
 *   - TRES colunas de blocos independentes
 *   - cada bloco com cabecalho azul solido e texto branco centralizado
 *   - tabelas com borda fina em toda celula (grade fechada, nao zebrada)
 *   - coluna do meio com o "cardapio" de servicos: lista centralizada,
 *     em azul, sem preco — e o que a Parede Print usa para mostrar tudo
 *     que a grafica faz sem se comprometer com valor
 *   - rodape com recado em faixa azul
 *
 * O que NAO copiei: os "R$ 0,00" (aquilo e um template em branco) e o
 * bloco de bandeiras de cartao. No lugar entram custo/piso/margem, que
 * e o motivo desta folha existir — ela e interna.
 *
 * As duas versoes anteriores foram reprovadas: a 1a jogava as faixas
 * como chips soltos em 8,2px, a 2a virou grade alinhada mas continuou
 * "cinza demais", sem a cara de tabela de parede.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MARGEM_MINIMA = 0.5; // piso de desconto: nunca vender abaixo disso

const EMPRESA = {
  nome: "VTDIGITAL ART STUDIO",
  fone: "(21) 2038-3504 · (21) 97886-9414",
  endereco: "Rua Araquém 910 · Bangu · RJ",
};

const AZUL = "#0b5c9e";
const AZUL_ESCURO = "#084a80";

/** Distribuicao dos blocos nas tres colunas, como no modelo. */
const COLUNA_1 = ["Cópias e Impressões", "Encadernação", "Fotos"];
const COLUNA_3 = ["Cartões e Panfletos", "Adesivos", "Copos e Acrílicos", "Agendas e Cadernos"];

/**
 * Cardapio central: tudo que a grafica faz. Sai dos SERVICOS e das
 * TABELAS DE TERCEIROS cadastrados, mais os nomes das categorias de
 * produto — assim a lista acompanha o sistema em vez de ser fixa.
 */
const CARDAPIO_EXTRA = [
  "Apostilas",
  "Banners e lonas",
  "Blocos e talões",
  "Calendários",
  "Cardápios",
  "Certificados",
  "Convites",
  "Crachás",
  "Etiquetas",
  "Folders",
  "Imãs de geladeira",
  "Ingressos",
  "Marcadores de livro",
  "Papel timbrado",
  "Pastas",
  "Placas e PVC",
  "Plastificação",
  "Receituários",
  "Tags e rótulos",
];

const val = (n) =>
  Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function piso(custo) {
  return Math.ceil((Number(custo) / (1 - MARGEM_MINIMA)) * 20) / 20;
}

function margem(venda, custo) {
  const v = Number(venda);
  return v ? ((v - Number(custo)) / v) * 100 : 0;
}

/** O prefixo da categoria ja esta no cabecalho do bloco. */
function encurtar(nome, categoria) {
  const cortes = {
    Adesivos: /^Adesivo\s+/i,
    "Cópias e Impressões": /^Cópia \/ Impressão\s+/i,
    Encadernação: /^Encadernação\s+/i,
    Fotos: /^Fotos?\s+/i,
    "Copos e Acrílicos": /^Copo\s+/i,
  };
  let n = cortes[categoria] ? nome.replace(cortes[categoria], "") : nome;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

async function carregar() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const produtos = await client.query(`
    select coalesce(c.name,'Outros') as cat, p.sku, p.name,
           p.final_price::numeric(12,4) as venda,
           p.cost_snapshot::numeric(12,4) as custo,
           coalesce((
             select json_agg(json_build_object('q', t.min_quantity::numeric(12,0), 'p', t.unit_price::numeric(12,4))
                             order by t.min_quantity)
             from product_price_tiers t where t.product_id = p.id
           ), '[]'::json) as faixas
    from products p
    left join item_categories c on c.id = p.product_category_id
    where p.active order by 1, 2`);
  const servicos = await client.query(
    `select name from services where archived_at is null order by name`
  );
  const terceiros = await client.query(
    `select label, unit, unit_cost::numeric(12,2) as custo from pricing_tables order by label`
  );
  await client.end();
  return { produtos: produtos.rows, servicos: servicos.rows, terceiros: terceiros.rows };
}

function agruparCategorias(rows) {
  const porCat = new Map();
  for (const r of rows) {
    if (!porCat.has(r.cat)) porCat.set(r.cat, []);
    porCat.get(r.cat).push(r);
  }
  const out = new Map();
  for (const [cat, itens] of porCat) {
    const grades = new Map();
    for (const r of itens) {
      const escada = (r.faixas || []).map((f) => Number(f.q));
      const chave = escada.join("|") || "balcao";
      if (!grades.has(chave)) grades.set(chave, { escada, itens: [] });
      grades.get(chave).itens.push(r);
    }
    out.set(cat, [...grades.values()].sort((a, b) => b.escada.length - a.escada.length));
  }
  return out;
}

/** Uma tabela para cada escada de quantidade dentro da categoria. */
function tabelaGrade({ escada, itens }, cat) {
  const temFaixa = escada.length > 0;
  const colunas = temFaixa ? escada : [1];

  const th = colunas
    .map(
      (q) =>
        `<th class="q">${temFaixa ? q : "un"}${temFaixa ? '<i>un</i>' : ""}</th>`
    )
    .join("");

  const linhas = itens
    .map((r) => {
      const m = margem(r.venda, r.custo);
      const mapa = new Map((r.faixas || []).map((f) => [Number(f.q), Number(f.p)]));
      const tds = colunas
        .map((q) => {
          const p = temFaixa ? mapa.get(q) : Number(r.venda);
          if (p == null) return `<td class="p vazio">—</td>`;
          return `<td class="p${q === colunas[0] ? " forte" : ""}">${val(p)}</td>`;
        })
        .join("");
      return `<tr>
        <td class="nome">${esc(encurtar(r.name, cat))}</td>
        ${tds}
        <td class="g custo">${val(r.custo)}</td>
        <td class="g piso">${val(piso(r.custo))}</td>
        <td class="g marg${m < 40 ? " ruim" : ""}">${m.toFixed(0)}%</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr>
      <th class="nome">${temFaixa ? "Produto · preço por unidade" : "Produto"}</th>
      ${th}
      <th class="g">custo</th><th class="g">piso</th><th class="g">marg.</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

function bloco(titulo, conteudo) {
  return `<section class="bloco">
    <h2>${esc(titulo)}</h2>
    ${conteudo}
  </section>`;
}

function blocoCategoria(cat, grades) {
  return bloco(cat, grades.map((g) => tabelaGrade(g, cat)).join(""));
}

function blocoTerceiros(terceiros) {
  const linhas = terceiros
    .map(
      (t) => `<tr>
        <td class="nome">${esc(t.label)}</td>
        <td class="p">${esc(t.unit)}</td>
        <td class="g custo">${val(t.custo)}</td>
        <td class="g piso">${val(piso(t.custo))}</td>
      </tr>`
    )
    .join("");
  return bloco(
    "Terceirizados · custo de compra",
    `<table>
      <thead><tr>
        <th class="nome">Item</th><th class="p">un.</th>
        <th class="g">custo</th><th class="g">piso</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>`
  );
}

function render(dados, formato) {
  const a3 = formato === "A3";
  const f = (a4v, a3v) => (a3 ? a3v : a4v);
  const cats = agruparCategorias(dados.produtos);

  const col = (nomes) =>
    nomes
      .filter((n) => cats.has(n))
      .map((n) => blocoCategoria(n, cats.get(n)))
      .join("");

  // Sobras: qualquer categoria nova entra na coluna 3 sem eu ter de mexer aqui.
  const usadas = new Set([...COLUNA_1, ...COLUNA_3]);
  const sobras = [...cats.keys()].filter((c) => !usadas.has(c));

  const cardapio = [
    ...dados.servicos.map((s) => s.name.replace(/\s*\(terceirizado\)/i, "")),
    ...CARDAPIO_EXTRA,
  ]
    .map((s) => s.trim())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const hoje = new Date().toLocaleDateString("pt-BR");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Tabela interna ${formato} — ${EMPRESA.nome}</title>
<style>
  @page { size: ${formato} landscape; margin: ${f("6mm", "10mm")}; }
  * { box-sizing:border-box; }
  body { margin:0; background:#fff; color:#12161c;
         font-family:"Helvetica Neue",Arial,Helvetica,sans-serif;
         font-size:${f("9px", "12.2px")};
         -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .folha { padding:${f("6mm", "10mm")}; }

  /* ── faixa de titulo, como no modelo ── */
  .topo { background:${AZUL}; color:#fff; text-align:center;
          padding:${f("5.5px", "9px")} 10px; border-radius:2px;
          position:relative; }
  .topo h1 { margin:0; font-size:${f("19px", "28px")}; font-weight:700;
             letter-spacing:${f("1.4px", "2px")}; text-transform:uppercase; }
  .topo .sub { position:absolute; right:${f("10px", "16px")}; bottom:${f("6px", "10px")};
               font-size:${f("8.4px", "11px")}; opacity:.9; }
  .barrinha { height:${f("3px", "4px")}; background:#7fc241; margin-bottom:${f("6px", "9px")}; }

  .aviso { text-align:center; font-size:${f("8.6px", "11.2px")}; font-weight:700;
           color:#b91c1c; letter-spacing:.8px; text-transform:uppercase;
           margin:${f("3px", "5px")} 0 ${f("4.5px", "7px")}; }

  /* ── tres colunas ── */
  .colunas { display:grid; grid-template-columns:1fr ${f("150px", "210px")} 1fr;
             gap:${f("6px", "10px")}; align-items:start; }

  .bloco { margin-bottom:${f("4.5px", "7px")}; break-inside:avoid; }
  .bloco h2 { margin:0; background:${AZUL}; color:#fff; text-align:center;
              font-size:${f("10.2px", "13.5px")}; font-weight:700;
              padding:${f("3px", "5px")} 6px; letter-spacing:.4px; }

  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #b9c6d4; padding:${f("1.5px 3px", "2.6px 5px")}; }
  thead th { background:#eef4f9; font-size:${f("7.8px", "10.2px")}; font-weight:700;
             color:#33506b; text-align:center; }
  thead th.nome { text-align:left; }
  thead th.q i { display:block; font-style:normal; font-weight:400;
                 font-size:${f("6.2px", "8px")}; color:#7b8ea1; letter-spacing:.3px; }

  td.nome { font-size:${f("8.9px", "11.8px")}; line-height:1.15; }
  td.p { text-align:right; white-space:nowrap;
         font-family:ui-monospace,Menlo,monospace; font-size:${f("9px", "12px")}; }
  td.p.forte { font-weight:700; }
  td.p.vazio { color:#c8d2dc; text-align:center; }

  /* bloco de gestao: fundo levemente quente, so existe na via interna */
  td.g, th.g { background:#fdf8ef; text-align:right; white-space:nowrap;
               font-family:ui-monospace,Menlo,monospace; font-size:${f("8.2px", "10.8px")}; }
  th.g { background:#f7edda; font-family:inherit; font-size:${f("7.4px", "9.6px")}; }
  td.custo { color:#8a94a0; }
  td.piso { color:#b45309; font-weight:700; }
  td.marg { color:#046c4e; font-weight:700; }
  td.marg.ruim { color:#dc2626; }

  /* ── cardapio central ── */
  .cardapio { text-align:center; }
  .cardapio ul { list-style:none; margin:0; padding:${f("4px", "7px")} 2px; }
  .cardapio li { color:${AZUL_ESCURO}; font-size:${f("9.2px", "12.4px")};
                 line-height:${f("1.32", "1.4")}; font-weight:600; }
  .consulte { background:${AZUL}; color:#fff; text-align:center; font-weight:700;
              padding:${f("3px", "5px")}; font-size:${f("9.6px", "12.6px")};
              letter-spacing:.5px; }
  .destaque { border:1px solid #b9c6d4; border-top:0; text-align:center;
              padding:${f("5px", "8px")} 4px; }
  .destaque b { display:block; color:${AZUL_ESCURO}; font-size:${f("11px", "15px")};
                letter-spacing:.4px; line-height:1.15; }
  .destaque span { font-size:${f("8px", "10.5px")}; color:#5b6b7c; }

  /* ── rodape ── */
  footer { margin-top:${f("4px", "7px")}; }
  .legenda { display:flex; gap:${f("10px", "16px")}; justify-content:space-between;
             font-size:${f("8.2px", "10.8px")}; color:#4b5563; line-height:1.45;
             border-top:2px solid ${AZUL}; padding-top:${f("4px", "6px")}; }
  .legenda b { color:#12161c; }
  .rodape-azul { margin-top:${f("4px", "6px")}; background:${AZUL}; color:#fff;
                 text-align:center; font-size:${f("9.4px", "12.4px")}; font-weight:700;
                 padding:${f("3.5px", "6px")}; letter-spacing:.5px; }
  @media print { .folha { padding:0; } }
</style></head>
<body><div class="folha">

  <div class="topo">
    <h1>Tabela de Preços</h1>
    <div class="sub">${formato} deitado · ${hoje}</div>
  </div>
  <div class="barrinha"></div>

  <div class="aviso">Uso interno — não entregar ao cliente · valores em R$</div>

  <div class="colunas">
    <div>${col(COLUNA_1)}</div>

    <div>
      <section class="bloco cardapio">
        <h2>Serviços</h2>
        <ul>${cardapio.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      </section>
      <section class="bloco">
        <div class="consulte">Consulte-nos</div>
        <div class="destaque">
          <b>IMPRESSÃO FOTOGRÁFICA<br>NA HORA</b>
          <span>10x15 cm a partir de R$ 2,49</span>
        </div>
      </section>
    </div>

    <div>${col([...COLUNA_3, ...sobras])}${blocoTerceiros(dados.terceiros)}</div>
  </div>

  <footer>
    <div class="legenda">
      <div>
        Os números sob <b>1, 10, 50…</b> são o preço <b>por unidade</b> naquela quantidade.
        As colunas de fundo creme são de gestão: <b>custo</b> já inclui papel, clique, acabamento e perda.
      </div>
      <div style="text-align:right;white-space:nowrap">
        <b>Piso</b> = menor preço com ${MARGEM_MINIMA * 100}% de margem.<br>
        Abaixo dele, só com autorização. <b>Margem em vermelho = abaixo de 40%.</b>
      </div>
    </div>
    <div class="rodape-azul">${EMPRESA.nome} · ${EMPRESA.fone} · ${EMPRESA.endereco}</div>
  </footer>

</div></body></html>`;
}

const dados = await carregar();
const dir = path.join(process.cwd(), "tabelas");
fs.mkdirSync(dir, { recursive: true });
for (const fmt of ["A4", "A3"]) {
  const arquivo = path.join(dir, `tabela-interna-${fmt.toLowerCase()}.html`);
  fs.writeFileSync(arquivo, render(dados, fmt));
  console.log(`  ✔ ${path.relative(process.cwd(), arquivo)}`);
}
console.log(
  `\n  ${dados.produtos.length} produtos · ${dados.servicos.length} serviços · ${dados.terceiros.length} terceirizados`
);
const criticos = dados.produtos.filter((r) => margem(r.venda, r.custo) < 40);
if (criticos.length) {
  console.log(`  ⚠ ${criticos.length} com margem abaixo de 40%:`);
  for (const r of criticos) console.log(`      ${r.sku} — ${margem(r.venda, r.custo).toFixed(0)}%`);
}
