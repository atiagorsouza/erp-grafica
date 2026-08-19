#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Travas de campanha — o que NÃO pode acontecer.

     node scripts/testar-campanhas.mjs

   Cada verificação aqui existe porque a falha correspondente
   custaria o número de WhatsApp da gráfica. Não é teste de
   funcionalidade: é teste de recusa.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();

let ok = 0, falhas = 0;
const checar = (cond, desc) => {
  console.log(`  ${cond ? "✔" : "✖"} ${desc}`);
  cond ? ok++ : falhas++;
};
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
const post = (body) =>
  fetch(`${BASE}/api/campanhas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const FONE = `5521${String(stamp).slice(-9)}`;

function cpf(seed) {
  const base = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  const dv = (arr, s) => { const t = arr.reduce((a, n, i) => a + n * (s - i), 0); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 10), d2 = dv([...base, d1], 11);
  return [...base, d1, d2].join("");
}

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
      id bigserial PRIMARY KEY, phone_e164 text NOT NULL, direcao text NOT NULL,
      texto text, wa_id text, criado_em timestamptz NOT NULL DEFAULT now())`);

  /* Limpeza de execuções anteriores. */
  await pool.query(`DELETE FROM campaigns WHERE name LIKE 'TESTE-CAMP%'`);
  await pool.query(`DELETE FROM whatsapp_mensagens WHERE phone_e164 LIKE '5521%' AND texto = 'TESTE-CAMP'`);
  await pool.query(`DELETE FROM customers WHERE name LIKE 'TESTE-CAMP%'`);

  console.log("\n═══ 1. Validação da mensagem ═══");
  let r = await post({ op: "criar", name: "TESTE-CAMP curta", body: "oi" });
  checar(r.status === 422, "mensagem curta demais é recusada");

  r = await post({ op: "criar", name: "TESTE-CAMP var", body: "Olá {sobrenome}, tudo bem com você?" });
  checar(r.status === 422, "variável inexistente é recusada");

  r = await post({ op: "criar", name: "TESTE-CAMP url", body: "Olá, tudo bem por aí?", ctaUrl: "javascript:alert(1)" });
  checar(r.status === 422, "link que não é http(s) é recusado");

  console.log("\n═══ 2. Quem entra na audiência ═══");
  /* Cinco perfis, um por trava. */
  const perfis = [
    { nome: "TESTE-CAMP Elegivel",  escreveu: "1 day",    optIn: true,  optOut: false, esperado: true },
    { nome: "TESTE-CAMP SemOptIn",  escreveu: "1 day",    optIn: false, optOut: false, esperado: false },
    { nome: "TESTE-CAMP NuncaFalou", escreveu: null,      optIn: true,  optOut: false, esperado: false },
    { nome: "TESTE-CAMP Antigo",    escreveu: "14 months", optIn: true, optOut: false, esperado: false },
    { nome: "TESTE-CAMP OptOut",    escreveu: "1 day",    optIn: true,  optOut: true,  esperado: false },
  ];

  const ids = [];
  for (let i = 0; i < perfis.length; i++) {
    const p = perfis[i];
    const fone = `${FONE.slice(0, 11)}${i}`;
    const [row] = await q(
      `INSERT INTO customers (type,name,document,phone_e164,whatsapp,status,
                              marketing_opt_in,whatsapp_opt_out)
       VALUES ('pf',$1,$2,$3,$4,'ativo',$5,$6) RETURNING id`,
      [p.nome, cpf(stamp + i * 977), fone, fone, p.optIn, p.optOut]
    );
    ids.push({ id: row.id, ...p, fone });
    if (p.escreveu) {
      await pool.query(
        `INSERT INTO whatsapp_mensagens (phone_e164,direcao,texto,criado_em)
         VALUES ($1,'recebida','TESTE-CAMP', now() - $2::interval)`,
        [fone, p.escreveu]
      );
    }
  }

  const aud = await (await fetch(`${BASE}/api/campanhas?audiencia=1`)).json();
  const motivos = Object.fromEntries(aud.motivos.map((m) => [m.motivo, m.total]));
  checar(motivos["nunca escreveu para a gráfica"] >= 1, "quem nunca escreveu é recusado (a trava principal)");
  checar(motivos["sem autorização para marketing"] >= 1, "sem opt-in de marketing é recusado");
  checar(motivos["pediu para não receber mensagens"] >= 1, "opt-out é respeitado");
  checar(motivos["sem contato há mais de 12 meses"] >= 1, "contato antigo é recusado");

  console.log("\n═══ 3. Revalidação no instante do envio ═══");
  const criada = await (await post({
    op: "criar",
    name: `TESTE-CAMP envio ${stamp}`,
    body: "Oi, {nome}! Novidade por aqui, te interessa?",
  })).json();
  const campId = criada.row.id;

  const fila = await (await post({ op: "montar-fila", id: campId })).json();
  checar(fila.ok && fila.total >= 1, `fila montada com ${fila.total} destinatário(s)`);

  /* O cenário perigoso: a pessoa pede opt-out DEPOIS da fila pronta.
     Enviar mesmo assim seria violar a LGPD. */
  const elegivel = ids.find((x) => x.esperado);
  await pool.query(`UPDATE customers SET whatsapp_opt_out = true WHERE id = $1`, [elegivel.id]);

  const lote = await (await post({ op: "enviar-lote", id: campId, quantos: 3 })).json();
  checar(lote.enviados === 0, "não enviou para quem pediu opt-out depois da fila");

  const [alvo] = await q(
    `SELECT status, skip_reason FROM campaign_targets
      WHERE campaign_id = $1 AND customer_id = $2`,
    [campId, elegivel.id]
  );
  checar(alvo?.status === "pulado", `alvo marcado como pulado (${alvo?.skip_reason})`);

  console.log("\n═══ 4. Disjuntor de bloqueios ═══");
  /* Simula 25 envios com 3 bloqueios = 12%, muito acima de 1%. */
  await pool.query(
    `UPDATE campaigns SET sent_count = 25, blocked_count = 3, status = 'enviando' WHERE id = $1`,
    [campId]
  );
  const apos = await (await post({ op: "enviar-lote", id: campId, quantos: 1 })).json();
  const [c] = await q(`SELECT status, paused_reason FROM campaigns WHERE id = $1`, [campId]);
  checar(c?.status === "pausada", "campanha pausou sozinha acima de 1% de bloqueio");
  checar(!!c?.paused_reason, `motivo registrado: ${String(c?.paused_reason || "").slice(0, 48)}`);
  checar(apos.pausada === true || apos.error, "o disparo foi recusado com a campanha pausada");

  console.log("\n═══ 5. Disjuntor não dispara cedo demais ═══");
  /* 1 bloqueio em 5 envios é 20%, mas 5 envios não é amostra. */
  const outra = await (await post({
    op: "criar", name: `TESTE-CAMP cedo ${stamp}`,
    body: "Oi, {nome}! Tudo certo por aí?",
  })).json();
  await pool.query(
    `UPDATE campaigns SET sent_count = 5, blocked_count = 1, status = 'enviando' WHERE id = $1`,
    [outra.row.id]
  );
  await post({ op: "enviar-lote", id: outra.row.id, quantos: 1 });
  const [c2] = await q(`SELECT status FROM campaigns WHERE id = $1`, [outra.row.id]);
  checar(c2?.status !== "pausada", "não pausa com poucos envios (amostra insuficiente)");

  /* Limpeza. */
  await pool.query(`DELETE FROM campaigns WHERE name LIKE 'TESTE-CAMP%'`);
  await pool.query(`DELETE FROM whatsapp_mensagens WHERE texto = 'TESTE-CAMP'`);
  await pool.query(`DELETE FROM customers WHERE name LIKE 'TESTE-CAMP%'`);
} catch (e) {
  console.error("\n✖ erro:", e.message);
  falhas++;
} finally {
  console.log("\n" + "═".repeat(46));
  console.log(`  ${ok} passaram · ${falhas} falharam`);
  console.log("═".repeat(46) + "\n");
  await pool.end();
  process.exitCode = falhas ? 1 : 0;
}
