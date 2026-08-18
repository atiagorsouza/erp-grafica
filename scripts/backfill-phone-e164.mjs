#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Preenche customers.phone_e164 a partir de whatsapp/phone.

   Rode ANTES de criar o índice único. Se dois cadastros tiverem o
   mesmo telefone, o índice falha na criação — e é justamente isso
   que queremos descobrir ANTES, com calma, e não no meio de um
   deploy.

   Por padrão só RELATA (dry-run). Para gravar:
       node scripts/backfill-phone-e164.mjs --aplicar

   Duplicatas nunca são resolvidas automaticamente: fundir cliente é
   decisão de negócio (qual nome vale? qual endereço?). O script
   lista os conflitos e deixa a escolha com você.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* Mesma lógica de src/lib/phone.ts. Duplicada de propósito: scripts
   rodam em node puro, sem o resolvedor de paths "@/" do Next. */
const DDD_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,
]);

function toE164BR(raw) {
  let d = String(raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("0055")) d = d.slice(4);
  else if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length > 11 && d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && /^0\d/.test(d)) d = d.slice(1);
  if (d.length < 10 || d.length > 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!DDD_VALIDOS.has(ddd)) return null;
  let local = d.slice(2);
  if (local.length === 8) {
    if (/^[2-5]/.test(local)) return `55${ddd}${local}`;   // fixo
    if (/^[6-9]/.test(local)) local = "9" + local;
    else return null;
  }
  if (local.length !== 9 || !local.startsWith("9")) return null;
  return `55${ddd}${local}`;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const col = await client.query(`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'customers' AND column_name = 'phone_e164'
  `);
  if (!col.rowCount) {
    console.error("✖ Coluna phone_e164 não existe. Rode antes: npx drizzle-kit push");
    process.exit(1);
  }

  const { rows } = await client.query(`
    SELECT id, name, phone, whatsapp, secondary_phone
      FROM customers
     ORDER BY id
  `);

  const porChave = new Map();
  const semTelefone = [];
  const naoReconhecidos = [];

  for (const r of rows) {
    // whatsapp tem prioridade: é o número que a pessoa de fato usa.
    const bruto = r.whatsapp || r.phone || r.secondary_phone;
    if (!bruto || !String(bruto).trim()) { semTelefone.push(r); continue; }
    const key = toE164BR(bruto);
    if (!key) { naoReconhecidos.push({ ...r, bruto }); continue; }
    if (!porChave.has(key)) porChave.set(key, []);
    porChave.get(key).push(r);
  }

  const conflitos = [...porChave.entries()].filter(([, v]) => v.length > 1);

  console.log("═".repeat(62));
  console.log(`  BACKFILL DE TELEFONE  ${APLICAR ? "(APLICANDO)" : "(simulação)"}`);
  console.log("═".repeat(62));
  console.log(`  clientes ................. ${rows.length}`);
  console.log(`  telefones reconhecidos ... ${porChave.size}`);
  console.log(`  sem telefone ............. ${semTelefone.length}`);
  console.log(`  não reconhecidos ......... ${naoReconhecidos.length}`);
  console.log(`  EM CONFLITO .............. ${conflitos.length}`);

  if (naoReconhecidos.length) {
    console.log("\n── Não reconhecidos (ficam sem chave, nada é perdido) ──");
    for (const r of naoReconhecidos.slice(0, 15)) {
      console.log(`   #${String(r.id).padEnd(5)} ${String(r.name).slice(0, 28).padEnd(30)} "${r.bruto}"`);
    }
    if (naoReconhecidos.length > 15) console.log(`   ... e mais ${naoReconhecidos.length - 15}`);
  }

  if (conflitos.length) {
    console.log("\n── CONFLITOS: mesmo telefone em cadastros diferentes ──");
    console.log("   O índice único vai recusar estes. Decida qual fica.\n");
    for (const [key, lista] of conflitos) {
      console.log(`   ${key}`);
      for (const r of lista) {
        console.log(`      #${String(r.id).padEnd(5)} ${String(r.name).slice(0, 40)}`);
      }
    }
    console.log("\n   Sugestão: manter o cadastro com histórico (pedidos/vendas)");
    console.log("   e apagar ou renomear o telefone do outro.");
  }

  if (!APLICAR) {
    console.log("\n→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/backfill-phone-e164.mjs --aplicar");
    process.exit(conflitos.length ? 2 : 0);
  }

  if (conflitos.length) {
    console.log("\n✖ Não vou gravar com conflitos em aberto — o índice único");
    console.log("  falharia depois e o deploy quebraria no meio.");
    console.log("  Resolva os casos acima e rode de novo.");
    process.exit(2);
  }

  await client.query("BEGIN");
  let n = 0;
  for (const [key, [r]] of porChave) {
    await client.query(`UPDATE customers SET phone_e164 = $1 WHERE id = $2`, [key, r.id]);
    n++;
  }
  await client.query("COMMIT");
  console.log(`\n✅ ${n} clientes com telefone canônico gravado.`);
  console.log("   Agora pode criar o índice único: npx drizzle-kit push");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✖ Falhou:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
