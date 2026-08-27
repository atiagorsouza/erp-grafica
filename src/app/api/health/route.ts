import { db } from "@/db";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * ====================================================================
 *  HEALTHCHECK — /api/health
 * ====================================================================
 *
 * Antes esta rota era `select 1` → `{ok:true}`. Funcionava como sinal
 * de vida, mas não ajudava em nada no momento que mais importa: o
 * incidente.
 *
 * Nos dois incidentes documentados (24/08 e 25/08) o diagnóstico
 * demorou justamente por perguntas que o healthcheck poderia ter
 * respondido de graça:
 *
 *  - 25/08: o ERP lia `app_db_recuperado` e o motor do WhatsApp
 *    escrevia no banco antigo. Ninguém percebeu porque nada na tela
 *    dizia EM QUAL BANCO o ERP estava conectado.
 *  - 24/08 e 25/08: código numa versão, banco carimbado em outra
 *    (`upToDate: false`) — a divergência existia mas só aparecia se
 *    alguém pensasse em bater `/api/version`.
 *  - Build sem `BUILD_ID` derrubou o site duas vezes (regra 1.3 do
 *    manual): o pm2 entra em loop e a mensagem de erro não é óbvia.
 *
 * Agora tudo isso vem numa chamada só. O contrato antigo é preservado:
 * `{ ok: true }` continua no corpo e o status continua 200/500, então
 * monitor externo e `scripts/healthcheck.sh` não quebram.
 *
 * IMPORTANTE — esta rota é PÚBLICA (sem autenticação, para o monitor
 * conseguir bater). Por isso ela nunca expõe segredo: do banco sai
 * apenas HOST e NOME, nunca usuário, senha ou a URL completa.
 * ==================================================================== */

/* Extrai host/porta/base do DATABASE_URL SEM vazar credencial.
   `postgresql://user:senha@127.0.0.1:5432/app_db` → `127.0.0.1:5432/app_db` */
function bancoIdentidade(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    const porta = u.port || "5432";
    const base = u.pathname.replace(/^\//, "") || "(sem nome)";
    return `${u.hostname}:${porta}/${base}`;
  } catch {
    return "(DATABASE_URL ilegível)";
  }
}

function lerVersaoArquivo(): string | null {
  try {
    return readFileSync(join(process.cwd(), "VERSION"), "utf8").trim().split("\n")[0].trim();
  } catch {
    return null;
  }
}

function lerBuildId(): string | null {
  try {
    const p = join(process.cwd(), ".next", "BUILD_ID");
    return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const inicio = Date.now();

  const codigo = lerVersaoArquivo();
  const buildId = lerBuildId();
  const banco = bancoIdentidade();

  let dbOk = false;
  let dbMs: number | null = null;
  let instalada: string | null = null;

  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    dbMs = Date.now() - t0;
    dbOk = true;

    /* Versão carimbada no banco. Se a tabela ainda não existe (base
       nova), não é falha de saúde — segue como null. */
    try {
      const r = await db.execute<{ value: string }>(
        sql`select value from settings where key = 'app_version' limit 1`
      );
      const linhas = (r as unknown as { rows?: { value?: string }[] }).rows ?? [];
      instalada = linhas[0]?.value?.trim() || null;
    } catch {
      instalada = null;
    }
  } catch {
    dbOk = false;
  }

  /* `ok` = o que decide o status HTTP. Só o essencial entra aqui: banco
     de pé e build presente. Divergência de versão é AVISO, não queda —
     o sistema funciona, só precisa do `check-version.mjs --fix`. */
  const ok = dbOk && buildId !== null;

  const avisos: string[] = [];
  if (!dbOk) avisos.push("banco não respondeu");
  if (buildId === null)
    avisos.push("BUILD_ID ausente — build falhou ou não rodou (regra 1.3 do manual)");
  if (dbOk && instalada && codigo && instalada !== codigo)
    avisos.push(
      `versão divergente: código ${codigo}, banco ${instalada} — rode node scripts/check-version.mjs --fix`
    );
  if (dbMs !== null && dbMs > 1000) avisos.push(`banco lento: ${dbMs}ms para um select 1`);

  return Response.json(
    {
      ok,
      versao: { codigo, banco: instalada, emDia: Boolean(codigo && instalada && codigo === instalada) },
      build: { id: buildId },
      banco: { conectado: dbOk, alvo: banco, latenciaMs: dbMs },
      node: process.version,
      uptimeSegundos: Math.round(process.uptime()),
      avisos,
      medidoEm: new Date().toISOString(),
      levouMs: Date.now() - inicio,
    },
    { status: ok ? 200 : 500 }
  );
}
