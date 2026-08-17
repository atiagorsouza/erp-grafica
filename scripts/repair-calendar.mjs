// PrintFlow ERP · reparo do módulo Calendário Comemorativo
// - Preenche month_day/date
// - Normaliza tipos/relevância/ícones
// - Desativa duplicatas exatas preservando histórico
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const VALID_TYPES = new Set(["feriado_nacional", "data_comercial", "data_comemorativa", "interno"]);
const VALID_RELEVANCE = new Set(["alta", "media", "baixa"]);
const md = (m, d) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const isValid = (m, d) => {
  const dt = new Date(Date.UTC(2000, Number(m) - 1, Number(d)));
  return dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d);
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM commemorative_dates ORDER BY month, day, title, id`);
    let normalized = 0;
    let invalidFixed = 0;
    let duplicates = 0;
    const seen = new Set();

    for (const r of rows) {
      let month = Number(r.month || 1);
      let day = Number(r.day || 1);
      if (month < 1 || month > 12) month = 1;
      if (!isValid(month, day)) {
        day = 1;
        invalidFixed++;
      }
      const monthDay = md(month, day);
      const type = VALID_TYPES.has(r.type) ? r.type : "data_comemorativa";
      const relevance = VALID_RELEVANCE.has(r.relevance) ? r.relevance : "media";
      const icon = r.icon || "📅";
      const category = r.category || "comercial";
      const recurring = r.recurring !== false;
      const date = recurring ? `2000-${monthDay}` : (r.date || `2000-${monthDay}`);
      const key = `${monthDay}|${String(r.title || '').trim().toLowerCase()}`;
      const active = seen.has(key) ? false : (r.active !== false);
      if (seen.has(key)) duplicates++;
      seen.add(key);

      const res = await client.query(
        `UPDATE commemorative_dates
            SET month=$2, day=$3, month_day=$4, type=$5, relevance=$6, icon=$7, category=$8, recurring=$9, date=$10, active=$11, updated_at=NOW()
          WHERE id=$1
            AND (month IS DISTINCT FROM $2 OR day IS DISTINCT FROM $3 OR month_day IS DISTINCT FROM $4 OR type IS DISTINCT FROM $5 OR relevance IS DISTINCT FROM $6 OR icon IS DISTINCT FROM $7 OR category IS DISTINCT FROM $8 OR recurring IS DISTINCT FROM $9 OR date IS DISTINCT FROM $10 OR active IS DISTINCT FROM $11)`,
        [r.id, month, day, monthDay, type, relevance, icon, category, recurring, date, active]
      );
      normalized += res.rowCount || 0;
    }

    await client.query("COMMIT");
    console.log(`✅ Calendário reparado: ${normalized} datas normalizadas, ${invalidFixed} inválidas corrigidas, ${duplicates} duplicatas desativadas.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-calendar falhou:", e.message);
  process.exit(1);
});
