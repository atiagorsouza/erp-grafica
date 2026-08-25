#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Migração pontual (v3.51.0): horário de corte 15:00 → 17:00.

     node scripts/migrar-expediente-17h.mjs            (simula)
     node scripts/migrar-expediente-17h.mjs --aplicar

   Por que um script e não `ensure-settings`: aquele só CRIA chaves que
   faltam, nunca sobrescreve valor existente — e está certo, senão
   todo deploy apagaria a configuração de quem já ajustou.

   Aqui a mudança é deliberada: o dono informou que o corte real é 17h,
   e o 15:00 que está gravado é o palpite que eu tinha colocado como
   padrão. Só troca se o valor for EXATAMENTE o padrão antigo. Se
   alguém já ajustou para outra coisa, não encostamos.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/* chave, valor antigo que pode ser trocado, valor novo, explicação */
const TROCAS = [
  ["prazo_horario_corte", "15:00", "17:00", "corte informado pelo dono"],
  ["prazo_dias_atendimento", null, "1,2,3,4,5,6", "atende sábado (não produz)"],
  ["prazo_sabado_ate", null, "13:00", "sábado até 13h"],
];

try {
  const { rows } = await client.query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [TROCAS.map((t) => t[0])]
  );
  const atual = new Map(rows.map((r) => [r.key, r.value]));

  console.log("═".repeat(62));
  console.log(`  EXPEDIENTE  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(62));

  let mexidos = 0;
  for (const [key, deQual, para, motivo] of TROCAS) {
    const tem = atual.get(key);

    if (tem === undefined) {
      console.log(`  + ${key.padEnd(24)} criando "${para}"  · ${motivo}`);
      if (APLICAR) {
        await client.query(
          `INSERT INTO settings (key, value, category) VALUES ($1,$2,'prazos')
           ON CONFLICT (key) DO NOTHING`,
          [key, para]
        );
      }
      mexidos++;
      continue;
    }

    if (tem === para) {
      console.log(`  = ${key.padEnd(24)} já está em "${para}"`);
      continue;
    }

    /* deQual null = só cria, nunca sobrescreve. */
    if (deQual === null || tem !== deQual) {
      console.log(`  ! ${key.padEnd(24)} está "${tem}" — personalizado, não mexo`);
      continue;
    }

    console.log(`  → ${key.padEnd(24)} "${tem}" vira "${para}"  · ${motivo}`);
    if (APLICAR) {
      await client.query(
        `UPDATE settings SET value=$2, updated_at=now() WHERE key=$1`,
        [key, para]
      );
    }
    mexidos++;
  }

  console.log();
  if (!APLICAR) {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/migrar-expediente-17h.mjs --aplicar");
  } else {
    console.log(`✅ ${mexidos} ajuste(s) no expediente.`);
    console.log("   Confira em Painel → Prazos & Expediente.");
  }
} catch (e) {
  console.error("✖ Falhou:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
