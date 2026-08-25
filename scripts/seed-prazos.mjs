#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Prazos sugeridos por tipo de trabalho.

     node scripts/seed-prazos.mjs            (mostra o que faria)
     node scripts/seed-prazos.mjs --aplicar

   São SUGESTÕES, não verdades. O usuário disse que hoje calcula o
   prazo de cabeça e aceita propostas — é mais fácil corrigir número
   errado na tela do que preencher planilha em branco.

   Só toca em produto que ainda está no padrão (criação 0, produção 1,
   acabamento 0). Se você já ajustou algum, ele fica como está.

   As três parcelas:
     criação     arte/modelagem — depende do cliente aprovar
     produção    máquina rodando
     acabamento  cura, montagem, secagem — tempo físico
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* Casamento por palavra no nome do produto. Ordem importa: a primeira
   regra que casar vence, então o específico vem antes do genérico. */
/* Prazos REAIS, ditados pelo dono em 19/08/2026. Onde ele deu faixa
   ("1 a 2 dias"), fica o MAIOR: prometer o melhor caso é combinar
   atraso. Entregar antes é presente; prometer antes é dívida.

   As três parcelas: criação (arte/modelagem) · produção (máquina) ·
   acabamento (cura, montagem, recorte). Terceirizado entra em
   "produção" porque é tempo de espera do fornecedor. */
const REGRAS = [
  // ── 3D ── "Peças 3D 1 a 2 dias" ────────────────────────────────
  { re: /\b(3d|impress[aã]o 3d|pla|filamento)\b.*\b(model|projeto|desenh)/i,
    c: 2, p: 2, a: 0, nota: "3D com modelagem (arte + 2d)" },
  { re: /\b(3d|pla|filamento)\b/i,
    c: 0, p: 2, a: 0, nota: "3D com arte pronta (1 a 2d → 2)" },

  // ── Agenda ── "depende do volume; 1 und 1 a 2 dias" ────────────
  /* Em série: encadernação só começa com capa e miolo prontos. O
     volume o operador ajusta na tela — o seeder não adivinha
     tiragem. */
  { re: /\b(agenda|caderno|encaderna|planner)\b/i,
    c: 0, p: 2, a: 0, nota: "agenda avulsa (revisar p/ volume)", serie: true },
  { re: /\b(bloco)\b/i,
    c: 0, p: 1, a: 0, nota: "bloco" },

  // ── Papelaria personalizada ── "3 dias" ────────────────────────
  { re: /\b(papelaria|kit festa|convite|lembrancinha)\b/i,
    c: 1, p: 2, a: 0, nota: "papelaria personalizada (3d)" },

  // ── Brindes: prensa depois da impressão ────────────────────────
  { re: /\b(copo|caneca|ta[çc]a|squeeze|garrafa|chaveiro|brinde|eco ?copo|long ?drink)\b/i,
    c: 0, p: 1, a: 1, nota: "brinde com transfer + prensa" },

  /* ── Adesivo/vinil: O QUE MAIS SAI ──────────────────────────────
     "quando o cliente me dá a arte, 1 dia". Produção da casa, o
     recorte entra no mesmo dia — não é etapa separada de espera. */
  { re: /\b(recorte|vinil|adesiv|m[aá]scara|silhouette|cameo|plotter)\b/i,
    c: 0, p: 1, a: 0, nota: "adesivo/vinil, arte do cliente (1d)" },

  /* ── Banner e lona: TERCEIRIZADO ────────────────────────────────
     "da empresa que terceirizo, geralmente de um dia para o outro,
     e do 2 a 3 dias para o cliente". O fornecedor entrega em 1 dia;
     o que o cliente ouve é 3, porque entre receber e entregar tem
     conferência, acabamento e a viagem. Prometemos 3. */
  { re: /\b(lona|banner|faixa|backdrop|wind|painel)\b/i,
    c: 0, p: 2, a: 1, nota: "banner/lona terceirizado (3d ao cliente)" },

  { re: /\b(dtf|camisa|camiseta|t[êe]xtil|tecido|uniforme)\b/i,
    c: 0, p: 2, a: 1, nota: "DTF/têxtil (fornecedor + prensa)" },

  /* ── Cartão de visita ── "1 dia, para 100 a 200 und" ────────────
     Vale para a tiragem pequena feita na casa. Milheiro é compra na
     Atual Card e tem outro prazo — cadastre como produto separado,
     de fornecedor. */
  { re: /\b(cart[aã]o de visita|cart[aã]o)\b/i,
    c: 0, p: 1, a: 0, nota: "cartão 100-200un, arte pronta (1d)" },

  { re: /\b(etiqueta|adesivo r[oó]tulo|r[oó]tulo)\b/i,
    c: 0, p: 1, a: 0, nota: "etiqueta" },
  { re: /\b(panfleto|flyer|folder|folheto|c[oó]pia|impress[aã]o|xerox|a4|a3)\b/i,
    c: 0, p: 1, a: 0, nota: "impressão simples" },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const col = await client.query(`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'products' AND column_name = 'lead_time_production'`);
  if (!col.rowCount) {
    console.error("✖ Colunas de prazo não existem. Rode antes: npx drizzle-kit push");
    process.exit(1);
  }

  const { rows } = await client.query(`
    SELECT id, name, lead_time_creation c, lead_time_production p,
           lead_time_finishing a, lead_time_serial s
      FROM products WHERE active IS NOT false ORDER BY name`);

  if (!rows.length) {
    console.log("Nenhum produto cadastrado ainda.");
    console.log("Cadastre os produtos e rode de novo — os prazos entram sozinhos.\n");
    console.log("Sugestões que serão aplicadas quando houver produtos:\n");
    console.log("  trabalho                        criação  produção  acabamento");
    console.log("  " + "─".repeat(60));
    for (const r of REGRAS) {
      console.log(`  ${r.nota.padEnd(32)}${String(r.c).padStart(5)}${String(r.p).padStart(10)}${String(r.a).padStart(12)}`);
    }
    process.exit(0);
  }

  const noPadrao = (r) => Number(r.c) === 0 && Number(r.p) === 1 && Number(r.a) === 0 && !r.s;
  const planos = [];
  const jaAjustados = [];
  const semRegra = [];

  for (const r of rows) {
    if (!noPadrao(r)) { jaAjustados.push(r); continue; }
    const regra = REGRAS.find((x) => x.re.test(r.name));
    if (!regra) { semRegra.push(r); continue; }
    if (regra.c === 0 && regra.p === 1 && regra.a === 0 && !regra.serie) continue; // já bate
    planos.push({ r, regra });
  }

  console.log("═".repeat(64));
  console.log(`  PRAZOS SUGERIDOS  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(64));
  console.log(`  produtos ............. ${rows.length}`);
  console.log(`  a ajustar ............ ${planos.length}`);
  console.log(`  já personalizados .... ${jaAjustados.length}  (não serão tocados)`);
  console.log(`  sem regra ............ ${semRegra.length}  (ficam em 1 dia)`);

  if (planos.length) {
    console.log("\n  produto                          cri  pro  aca   total  motivo");
    console.log("  " + "─".repeat(70));
    for (const { r, regra } of planos) {
      const tot = regra.c + regra.p + regra.a;
      console.log(
        `  ${String(r.name).slice(0, 30).padEnd(32)}` +
        `${String(regra.c).padStart(3)}${String(regra.p).padStart(5)}${String(regra.a).padStart(5)}` +
        `${String(tot).padStart(8)}   ${regra.nota}`
      );
      if (!APLICAR) continue;
      await client.query(
        `UPDATE products SET lead_time_creation=$2, lead_time_production=$3,
                             lead_time_finishing=$4, lead_time_serial=$5
          WHERE id=$1`,
        [r.id, regra.c, regra.p, regra.a, !!regra.serie]
      );
    }
  }

  if (semRegra.length) {
    console.log("\n  Sem regra (revise na tela do produto):");
    for (const r of semRegra.slice(0, 12)) console.log(`    · ${r.name}`);
    if (semRegra.length > 12) console.log(`    ... e mais ${semRegra.length - 12}`);
  }

  console.log();
  if (APLICAR) {
    console.log(`✅ ${planos.length} produto(s) com prazo sugerido.`);
    console.log("   Confira na tela de Produtos e ajuste o que não bater com a sua rotina.");
  } else {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/seed-prazos.mjs --aplicar");
  }
} catch (e) {
  console.error("✖ Falhou:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
