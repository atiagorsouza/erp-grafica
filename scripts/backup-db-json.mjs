// PrintFlow ERP · backup JSON de emergência do PostgreSQL
// Uso: node scripts/backup-db-json.mjs <arquivo-saida.json>
import fs from "node:fs";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const out = process.argv[2];
if (!out) {
  console.error("Uso: node scripts/backup-db-json.mjs <arquivo-saida.json>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const tablesRes = await client.query(`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name
    `);
    const backup = {
      createdAt: new Date().toISOString(),
      format: "printflow-json-fallback-v1",
      tables: {},
    };
    for (const { table_name: table } of tablesRes.rows) {
      const rows = await client.query(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
      backup.tables[table] = rows.rows;
    }
    fs.writeFileSync(out, JSON.stringify(backup, null, 2));
    console.log(`✅ Backup JSON salvo em ${out}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Backup JSON falhou:", e.message);
  process.exit(1);
});
