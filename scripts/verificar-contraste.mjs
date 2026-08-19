#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Verifica CONTRASTE de campos de formulário nas páginas renderizadas.

   Por que este script existe
   ──────────────────────────
   O bug da v3.46.3 era um campo com fundo escuro e texto escuro —
   invisível. A checagem improvisada na época contava ocorrências de
   "bg-white" no HTML, e isso gera alarme falso: um PDV tem campos
   claros (busca de produto) e escuros (Recebido R$) convivendo. Ver
   "bg-white" no HTML não é defeito nenhum.

   O defeito real é fundo e texto na MESMA FAIXA DE LUMINÂNCIA no
   MESMO elemento. É isso que medimos aqui: resolvemos cada classe
   para uma cor, calculamos a razão de contraste (WCAG 2.1) e
   reprovamos o que ninguém conseguiria ler.

   Uso:
     node scripts/verificar-contraste.mjs
     node scripts/verificar-contraste.mjs --url https://app.vtdigital.site
     node scripts/verificar-contraste.mjs --min 4.5     (padrão 3.0)
     node scripts/verificar-contraste.mjs --json

   Sai com código 1 se achar campo ilegível. Serve em CI e em deploy.
   ────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const BASE = (opt("url", process.env.BASE_URL || "http://127.0.0.1:3000")).replace(/\/+$/, "");
const MIN = Number(opt("min", "3.0"));
const JSON_OUT = args.includes("--json");
const VERBOSE = args.includes("--verbose") || args.includes("-v");

/* Paleta do design system (tailwind.config + tokens do projeto).
   Só o que aparece em campos; o resto cai no fallback. */
const PALETA = {
  white: "#ffffff",
  black: "#000000",
  transparent: null,
  "ink-50": "#f6f7f9", "ink-100": "#eceef2", "ink-200": "#d5d9e2",
  "ink-300": "#b0b7c6", "ink-400": "#8590a5", "ink-500": "#66718a",
  "ink-600": "#505a70", "ink-700": "#414959", "ink-800": "#373d4b",
  "ink-900": "#0e1420", "ink-950": "#080c14",
  "paper-50": "#ffffff", "paper-100": "#f7f8fa", "paper-200": "#eef0f4",
  "paper-300": "#e2e6ec", "paper-400": "#cbd2dc",
  "proc-a": "#7c3aed", "proc-b": "#2563eb", "proc-c": "#0ea5e9",
  "danger-500": "#ef4444", "danger-600": "#dc2626",
  "ok-500": "#10b981", "ok-600": "#059669",
  "warn-500": "#f59e0b",
  "magenta-500": "#ec4899", "magenta-600": "#db2777",
};

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

/* Luminância relativa — WCAG 2.1 */
function luminancia(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(fg, bg) {
  const a = luminancia(fg), b = luminancia(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* Extrai a última ocorrência de cada tipo — em Tailwind, a classe que
   aparece depois é a que vence quando a especificidade empata. */
function resolverCor(classes, prefixo) {
  const re = new RegExp(`(?:^|\\s)${prefixo}-([a-z]+-?[0-9]*)`, "g");
  let achado = null, m;
  while ((m = re.exec(classes)) !== null) {
    // Ignora variantes condicionais (hover:, focus:, disabled:...).
    const antes = classes.slice(0, m.index + 1);
    const ultimoEspaco = antes.lastIndexOf(" ");
    const token = classes.slice(ultimoEspaco + 1, m.index + m[0].length).trim();
    if (token.includes(":")) continue;
    if (Object.prototype.hasOwnProperty.call(PALETA, m[1])) achado = m[1];
  }
  return achado;
}

const PAGINAS = [
  "/pdv", "/clientes", "/pedidos", "/orcamentos", "/produtos",
  "/estoque", "/financeiro", "/servicos", "/impressoras", "/painel",
];

async function baixar(rota) {
  try {
    const r = await fetch(BASE + rota, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    return { html: await r.text() };
  } catch (e) {
    return { erro: e.message };
  }
}

const problemas = [];
const avisos = [];
let camposLidos = 0;
const paginasVistas = [];

for (const rota of PAGINAS) {
  const { html, erro } = await baixar(rota);
  if (erro) { avisos.push({ rota, motivo: erro }); continue; }
  paginasVistas.push(rota);

  const tags = html.match(/<(?:input|textarea|select)\b[^>]{0,900}/g) || [];
  for (const tag of tags) {
    const cls = (tag.match(/class="([^"]*)"/) || [])[1];
    if (!cls) continue;

    const bgNome = resolverCor(cls, "bg");
    const fgNome = resolverCor(cls, "text");
    if (!bgNome || !fgNome) continue;

    const bg = PALETA[bgNome], fg = PALETA[fgNome];
    if (!bg || !fg) continue;

    camposLidos++;
    const razao = contraste(fg, bg);
    if (razao < MIN) {
      const rotulo =
        (tag.match(/placeholder="([^"]{0,60})"/) || [])[1] ||
        (tag.match(/name="([^"]{0,40})"/) || [])[1] ||
        (tag.match(/aria-label="([^"]{0,40})"/) || [])[1] ||
        "(sem rótulo)";
      problemas.push({
        rota, rotulo,
        fundo: `bg-${bgNome}`, texto: `text-${fgNome}`,
        contraste: Number(razao.toFixed(2)),
      });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: problemas.length === 0,
    base: BASE, minimo: MIN,
    camposLidos, paginas: paginasVistas.length,
    problemas, avisos,
  }, null, 2));
  process.exit(problemas.length ? 1 : 0);
}

const linha = "─".repeat(64);
console.log(linha);
console.log(`  CONTRASTE DE CAMPOS — ${BASE}`);
console.log(linha);
console.log(`  páginas lidas ..... ${paginasVistas.length}/${PAGINAS.length}`);
console.log(`  campos medidos .... ${camposLidos}`);
console.log(`  mínimo exigido .... ${MIN}:1`);

if (avisos.length && VERBOSE) {
  console.log("\n  Páginas não lidas (normal se exigem login):");
  for (const a of avisos) console.log(`    ${a.rota} — ${a.motivo}`);
}

if (!camposLidos) {
  console.log("\n⚠️  Nenhum campo medido. O servidor está no ar em " + BASE + "?");
  process.exit(1);
}

if (problemas.length === 0) {
  console.log(`\n✅ Nenhum campo ilegível. Todos acima de ${MIN}:1.`);
  console.log("\n   Observação: encontrar 'bg-white' no HTML NÃO é defeito.");
  console.log("   Campos claros e escuros convivem por design. O que importa");
  console.log("   é o contraste entre fundo e texto do MESMO campo.");
  process.exit(0);
}

console.log(`\n❌ ${problemas.length} campo(s) ilegível(is):\n`);
for (const p of problemas) {
  console.log(`   ${p.rota}  "${p.rotulo}"`);
  console.log(`      ${p.fundo} + ${p.texto} → contraste ${p.contraste}:1`);
}
console.log(`\n   Corrija em src/components/ui.tsx (fieldLight/fieldDark)`);
console.log(`   ou passe tone="dark" no campo.`);
process.exit(1);
