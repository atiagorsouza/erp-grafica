#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Dados da VTDIGITAL no Painel.

     node scripts/preencher-empresa.mjs            (mostra)
     node scripts/preencher-empresa.mjs --aplicar

   Os valores vieram do cupom impresso pelo sistema antigo, entregue
   pelo dono em 19/08/2026. São dados reais da empresa dele.

   Só preenche o que está VAZIO. Campo já configurado não é tocado —
   quem digitou sabia o que estava fazendo, e um script não deve
   discordar disso. Use --forcar para sobrescrever mesmo assim.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const FORCAR = process.argv.includes("--forcar");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

/* Do cupom:
     VTDIGITAL ART STUDIO · RUA ARAQUEM 910 · BANGU
     RIO DE JANEIRO - RJ · 30.189.224/0001-54
     (21) 2038-3504 · (21) 97886-9414
     contato.vt@vtdigital.com · http://www.vtdigital.com.br
     Vendedor: TIAGO SOUZA                                       */
const DADOS = {
  company_name:        "VTDIGITAL ART STUDIO",
  company_trade_name:  "VTDIGITAL ART STUDIO",
  company_legal_name:  "VTDIGITAL ART STUDIO LTDA",
  company_cnpj:        "30.189.224/0001-54",
  company_street:      "Rua Araquem",
  company_number:      "910",
  company_district:    "Bangu",
  company_city:        "Rio de Janeiro",
  company_state:       "RJ",
  company_cep:         "21810-000",
  company_phone:       "(21) 2038-3504",
  company_phone2:      "(21) 97886-9414",
  company_whatsapp:    "(21) 97886-9414",
  company_email:       "contato.vt@vtdigital.com",
  company_website:     "http://www.vtdigital.com.br",

  /* Vendedor padrão do PDV — é ele quem atende. */
  pdv_seller_default:  "Tiago Souza",

  /* Rodapé do cupom, copiado do que ele já imprime hoje. */
  pdv_receipt_footer:
    "Agradecemos pela preferência, esperamos seu retorno em breve!\n" +
    "Não deixe de aproveitar as nossas promoções!!!",
};

/* Estes NÃO entram: dependem de decisão ou de dado que só o dono tem.
   Listados aqui para o relatório lembrar dele. */
const PENDENTES = {
  app_base_url: "URL pública (ex.: https://app.vtdigital.site) — sem ela o link de cadastro sai errado",
  labor_hourly_rate: "valor-hora da mão de obra — serviços ficam sem custo de trabalho",
  company_ie: "inscrição estadual, se houver",
  pix_key: "chave PIX para cobrança",
};

try {
  const { rows } = await client.query(
    `SELECT key, coalesce(value,'') v FROM settings WHERE key = ANY($1)`,
    [Object.keys(DADOS)]
  );
  const atual = new Map(rows.map((r) => [r.key, r.v]));

  console.log("\n" + "═".repeat(66));
  console.log(`  DADOS DA EMPRESA  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(66));

  let mexidos = 0;
  let mantidos = 0;

  for (const [chave, valor] of Object.entries(DADOS)) {
    const tem = String(atual.get(chave) ?? "").trim();
    const mostra = String(valor).split("\n")[0].slice(0, 40);

    if (tem && !FORCAR) {
      if (tem === valor) {
        console.log(`  = ${chave.padEnd(20)} já está correto`);
      } else {
        console.log(`  ! ${chave.padEnd(20)} tem "${tem.slice(0, 32)}" — não sobrescrevo`);
        mantidos++;
      }
      continue;
    }

    console.log(`  + ${chave.padEnd(20)} ${mostra}`);
    if (APLICAR) {
      await client.query(
        `INSERT INTO settings (key, value, category) VALUES ($1, $2, 'empresa')
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [chave, valor]
      );
    }
    mexidos++;
  }

  console.log("\n  " + "─".repeat(62));
  console.log("  AINDA PRECISAM DE VOCÊ:");
  const { rows: pend } = await client.query(
    `SELECT key, coalesce(value,'') v FROM settings WHERE key = ANY($1)`,
    [Object.keys(PENDENTES)]
  );
  const mapaPend = new Map(pend.map((r) => [r.key, r.v]));
  let faltam = 0;
  for (const [chave, motivo] of Object.entries(PENDENTES)) {
    const v = String(mapaPend.get(chave) ?? "").trim();
    if (!v || v === "0") {
      console.log(`   · ${chave.padEnd(20)} ${motivo}`);
      faltam++;
    }
  }
  if (!faltam) console.log("   (nada — tudo preenchido)");

  console.log();
  if (APLICAR) {
    console.log(`✅ ${mexidos} campo(s) preenchido(s).`);
    if (mantidos) console.log(`   ${mantidos} campo(s) já tinham valor diferente e foram mantidos (use --forcar para trocar).`);
    console.log("   Confira em Painel → Identidade da empresa.");
  } else {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/preencher-empresa.mjs --aplicar");
  }
  console.log();
} catch (e) {
  console.error("✖ Falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
