#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Auditoria: Serviços · Calendário · Configurações

     node scripts/auditar-3-modulos.mjs

   Os três módulos que nunca tinham sido auditados. O foco é o que
   pode dar prejuízo ou vergonha: preço errado, data errada,
   configuração que não salva.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let ok = 0, prob = 0, avisos = 0;
const T = (c, d) => { console.log(`  ${c ? "✔" : "✖"} ${d}`); c ? ok++ : prob++; };
const A = (d) => { console.log(`  ⚠ ${d}`); avisos++; };
const q = async (s, p = []) => (await pool.query(s, p)).rows;
const J = async (u, o) => {
  const r = await fetch(`${BASE}${u}`, o);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

try {
  /* ══════════════ SERVIÇOS ══════════════ */
  console.log("\n═══ SERVIÇOS ═══");

  const svc = await q(`SELECT id,name,base_cost,estimated_hours,type FROM services ORDER BY id LIMIT 20`);
  console.log(`  (${svc.length} serviço(s) cadastrado(s))`);

  const [{ rate }] = await q(
    `SELECT coalesce((SELECT value FROM settings WHERE key='labor_hourly_rate'),'0') rate`
  );
  const valorHora = Number(rate) || 0;

  /* O campo "horas estimadas" só vira dinheiro se o valor-hora
     estiver preenchido. Com 0, cadastrar "2h" não cobra nada. */
  const comHoras = svc.filter((s) => Number(s.estimated_hours) > 0);
  if (valorHora === 0 && comHoras.length > 0) {
    A(`${comHoras.length} serviço(s) têm horas estimadas, mas o valor-hora é R$ 0 —`);
    console.log(`     as horas não estão sendo cobradas. Painel → Precificação.`);
  } else if (valorHora === 0) {
    A("valor-hora em R$ 0 (só importa quando algum serviço usar horas)");
  } else {
    T(true, `valor-hora configurado: R$ ${valorHora.toFixed(2)}`);
  }

  const negativos = svc.filter((s) => Number(s.base_cost) < 0 || Number(s.estimated_hours) < 0);
  T(negativos.length === 0, "nenhum serviço com custo ou horas negativas");

  const semCusto = svc.filter((s) => Number(s.base_cost) === 0 && Number(s.estimated_hours) === 0);
  if (semCusto.length) {
    A(`${semCusto.length} serviço(s) com custo zero e sem horas: ${semCusto.slice(0, 3).map((s) => s.name).join(", ")}`);
  }

  /* Terceirizado sem parceiro é pedido esperando para dar errado. */
  const terc = await q(
    `SELECT name FROM services WHERE type='terceirizado' AND coalesce(partner,'')='' LIMIT 5`
  );
  if (terc.length) A(`${terc.length} serviço(s) terceirizados sem parceiro definido`);
  else T(true, "todo serviço terceirizado tem parceiro");

  /* ══════════════ CALENDÁRIO ══════════════ */
  console.log("\n═══ CALENDÁRIO ═══");

  const datas = await q(
    `SELECT id,title AS name,month,day,recurring,active FROM commemorative_dates ORDER BY month,day`
  );
  console.log(`  (${datas.length} data(s) cadastrada(s))`);

  const invalidas = datas.filter((d) => {
    const m = Number(d.month), dd = Number(d.day);
    if (m < 1 || m > 12 || dd < 1 || dd > 31) return true;
    const t = new Date(Date.UTC(2000, m - 1, dd));
    return t.getUTCMonth() !== m - 1 || t.getUTCDate() !== dd;
  });
  T(invalidas.length === 0, "nenhuma data com mês/dia impossível");

  /* O bug corrigido na 3.55.0: 29/02 em ano não bissexto virava
     1º de março silenciosamente. */
  const bissexto = datas.filter((d) => Number(d.month) === 2 && Number(d.day) === 29);
  if (bissexto.length) {
    console.log(`  ℹ ${bissexto.length} data(s) em 29/02 — em ano não bissexto o sistema usa 28/02`);
  }

  const dup = await q(`
    SELECT month, day, count(*) n FROM commemorative_dates
     WHERE active = true GROUP BY month, day HAVING count(*) > 1`);
  T(dup.length === 0, "nenhuma data comemorativa duplicada no mesmo dia");

  const semNome = datas.filter((d) => !String(d.name || "").trim());
  T(semNome.length === 0, "toda data tem nome");

  /* ══════════════ CONFIGURAÇÕES ══════════════ */
  console.log("\n═══ CONFIGURAÇÕES (Painel) ═══");

  const cfg = JSON.parse(
    await (await import("node:fs/promises")).readFile("config/control-panel-settings.json", "utf8")
  );
  const campos = cfg.groups.flatMap((g) => g.fields.map((f) => ({ ...f, grupo: g.id })));
  const doCatalogo = new Set(campos.map((f) => f.key));

  const noBanco = new Set((await q(`SELECT key FROM settings`)).map((r) => r.key));

  const faltando = [...doCatalogo].filter((k) => !noBanco.has(k));
  T(faltando.length === 0, `todas as ${doCatalogo.size} chaves do catálogo existem no banco`);
  if (faltando.length) console.log(`     faltam: ${faltando.slice(0, 6).join(", ")}`);

  /* Chave no banco que o catálogo não conhece não aparece na tela e
     é ignorada ao salvar. Foi exatamente isso que quebrou o servidor
     do dono: banco na 3.54.0, código na 3.47.1. */
  const orfas = [...noBanco].filter(
    (k) => !doCatalogo.has(k) && !/^(wa_bot_|_)/.test(k)
  );
  if (orfas.length) {
    A(`${orfas.length} chave(s) no banco fora do catálogo — invisíveis na tela`);
    console.log(`     ${orfas.slice(0, 8).join(", ")}`);
  } else {
    T(true, "nenhuma chave órfã no banco");
  }

  /* A tela só sabe desenhar estes tipos. Qualquer outro vira input
     de texto — e um booleano como texto livre é bug esperando. */
  const conhecidos = new Set(["text", "number", "select", "textarea", "logo"]);
  const tipoRuim = campos.filter((f) => f.type && !conhecidos.has(f.type));
  T(tipoRuim.length === 0, "todo campo usa um tipo que a tela sabe desenhar");
  if (tipoRuim.length) console.log(`     ${tipoRuim.map((f) => `${f.key}:${f.type}`).join(", ")}`);

  /* Select sem opções é uma caixa vazia. */
  const selectVazio = campos.filter((f) => f.type === "select" && !(f.options || []).length);
  T(selectVazio.length === 0, "todo campo de escolha tem opções");

  /* Valor no banco fora das opções do select: a tela mostra a
     primeira opção, e salvar troca o valor sem o usuário pedir. */
  const linhas = await q(`SELECT key, value FROM settings`);
  const mapa = new Map(linhas.map((r) => [r.key, String(r.value ?? "")]));
  const foraDasOpcoes = campos
    .filter((f) => f.type === "select" && (f.options || []).length)
    .filter((f) => {
      const v = mapa.get(f.key);
      if (v === undefined || v === "") return false;
      return !f.options.some((o) => String(o.value) === v);
    });
  T(foraDasOpcoes.length === 0, "nenhum select com valor fora das opções");
  if (foraDasOpcoes.length) {
    console.log(`     ${foraDasOpcoes.map((f) => `${f.key}="${mapa.get(f.key)}"`).join(", ")}`);
  }

  console.log("\n  — salvamento —");

  /* Salvar de verdade e conferir que persistiu. */
  const alvo = "quote_default_notes";
  const antes = mapa.get(alvo) ?? "";
  const novo = `auditoria ${Date.now()}`;
  const sv = await J("/api/crud/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "save", data: { key: alvo, value: novo, category: "orcamentos" } }),
  });
  const [dep] = await q(`SELECT value FROM settings WHERE key=$1`, [alvo]);
  T(sv.status === 200 && dep?.value === novo, "salvar uma configuração persiste no banco");
  await pool.query(`UPDATE settings SET value=$1 WHERE key=$2`, [antes, alvo]);

  /* A trava da 3.53.1: o marcador da logo nunca pode ser gravado
     como se fosse a imagem. */
  const ph = await J("/api/crud/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "save", data: { key: "company_logo", value: "__SET__" } }),
  });
  T(ph.status === 422, "servidor recusa gravar o marcador da logo (__SET__)");

  /* Chave inventada não pode criar linha nova. */
  const inv = await J("/api/crud/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "save", data: { key: `chave_inventada_${Date.now()}`, value: "x" } }),
  });
  const criou = await q(`SELECT key FROM settings WHERE key LIKE 'chave_inventada_%'`);
  T(criou.length === 0, `chave fora do catálogo não é criada (HTTP ${inv.status})`);
  if (criou.length) await pool.query(`DELETE FROM settings WHERE key LIKE 'chave_inventada_%'`);

  /* As logos não podem trafegar inteiras para o navegador — foi o
     que derrubou a tela do dono. */
  const lst = await J("/api/crud/settings");
  const grandes = (lst.body.rows || []).filter((r) => String(r.value || "").length > 5000);
  T(grandes.length === 0, "nenhum valor gigante trafega para o navegador");
  if (grandes.length) {
    console.log(`     ${grandes.map((r) => `${r.key}: ${Math.round(r.value.length / 1024)}KB`).join(", ")}`);
  }

  const pag = await fetch(`${BASE}/configuracoes`);
  const html = await pag.text();
  const kb = Math.round(html.length / 1024);
  T(kb < 900, `página /configuracoes tem ${kb} KB (limite 900)`);
} catch (e) {
  console.error("\n✖ erro na auditoria:", e.message);
  prob++;
} finally {
  console.log("\n" + "═".repeat(58));
  console.log(`  ${ok} ok · ${prob} problema(s) · ${avisos} aviso(s)`);
  console.log("═".repeat(58) + "\n");
  await pool.end();
  process.exitCode = prob ? 1 : 0;
}
