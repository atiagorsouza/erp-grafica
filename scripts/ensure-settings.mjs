// PrintFlow ERP · garante configurações canônicas sem sobrescrever produção
// Uso: node scripts/ensure-settings.mjs
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "control-panel-settings.json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function canonicalSettings() {
  const cfg = readConfig();
  const rows = [];
  for (const group of cfg.groups || []) {
    for (const field of group.fields || []) {
      rows.push([
        String(field.key),
        String(field.defaultValue ?? ""),
        String(group.id || "geral"),
      ]);
    }
  }
  return rows;
}

async function main() {
  const settings = canonicalSettings();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    let categoryFixed = 0;

    for (const [key, value, category] of settings) {
      const res = await client.query(
        `INSERT INTO settings (key, value, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, value, category]
      );
      inserted += res.rowCount || 0;

      // Corrige categoria vazia/geral e também categorias legadas erradas.
      const upd = await client.query(
        `UPDATE settings
            SET category = $2
          WHERE key = $1
            AND (category IS NULL OR category = '' OR category = 'geral' OR category <> $2)`,
        [key, category]
      );
      categoryFixed += upd.rowCount || 0;
    }

    // Remove sobras antigas do motor de comunicação, mantendo apenas dados cadastrais.
    await client.query(`DELETE FROM settings WHERE key LIKE 'communication_%' OR category = 'comunicacao'`);

    await client.query("COMMIT");
    console.log(`✅ Painel de Controle reparado: ${settings.length} chaves canônicas, ${inserted} novas, ${categoryFixed} categorias ajustadas.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ ensure-settings falhou:", e.message);
  process.exit(1);
});
