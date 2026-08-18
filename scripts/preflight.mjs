// PrintFlow ERP · preflight de instalação/update
import { spawnSync } from "node:child_process";
import pg from "pg";
import "dotenv/config";

const { Client } = pg;
const minNode = 20;
const result = { ok: true, checks: [] };

function check(name, ok, detail = "") {
  result.checks.push({ name, ok, detail });
  if (!ok) result.ok = false;
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail = "") {
  result.checks.push({ name, ok: true, warning: true, detail });
  console.log(`⚠️  ${name}${detail ? ` — ${detail}` : ""}`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
check("Node.js", nodeMajor >= minNode, process.version);
const npm = spawnSync("npm", ["-v"], { encoding: "utf8" });
check("npm", npm.status === 0, (npm.stdout || npm.stderr).trim());
check("DATABASE_URL", Boolean(process.env.DATABASE_URL), process.env.DATABASE_URL ? "definido" : "ausente");

if (process.env.DATABASE_URL) {
  try {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const v = await c.query("select version() as version");
    await c.end();
    check("PostgreSQL", true, v.rows[0]?.version?.split(" ").slice(0, 2).join(" ") || "online");
  } catch (e) {
    check("PostgreSQL", false, e.message);
  }
}

const pgDump = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
if (pgDump.status === 0) warn("pg_dump encontrado", pgDump.stdout.trim());
else warn("pg_dump não encontrado no PATH", "update usará fallback JSON se dump nativo falhar");

const audit = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
try {
  const json = JSON.parse(audit.stdout || "{}");
  const vul = json.metadata?.vulnerabilities;
  if (vul?.total) warn("npm audit", `${vul.total} vulnerabilidade(s): low=${vul.low || 0}, moderate=${vul.moderate || 0}, high=${vul.high || 0}, critical=${vul.critical || 0}`);
  else check("npm audit", true, "sem vulnerabilidades reportadas");
} catch {
  warn("npm audit", "não foi possível interpretar saída");
}

if (!result.ok) process.exit(1);
