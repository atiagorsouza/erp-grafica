#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   DEMONSTRAÇÃO ponta a ponta, sem WhatsApp real.

   Roda a jornada inteira contra o banco de verdade e imprime o que
   acontece em cada ponta:

     1. o cliente escreve no WhatsApp        → bot pré-cadastra
     2. o operador clica "Pedir cadastro"    → link gerado
     3. o cliente abre e preenche a página   → ficha completa
     4. o link queima                        → não serve de novo

   Uso: node demo-ponta-a-ponta.mjs
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";
import { criarPreCadastro } from "./src/pre-cadastro.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const FONE = "5521994427557";
const JID = `${FONE}@s.whatsapp.net`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pc = criarPreCadastro({ pool, empresa: "VTDIGITAL" });
await pc.garantirTabela();

const linha = (c = "─") => console.log("  " + c.repeat(66));
const titulo = (t) => {
  console.log();
  linha("═");
  console.log(`  ${t}`);
  linha("═");
};

/* Sock falso: registra o que o bot MANDARIA. */
function sockFalso() {
  const enviadas = [];
  return {
    enviadas,
    sendMessage: async (_jid, c) => {
      enviadas.push(c.text);
      return { key: { id: "x" + enviadas.length } };
    },
    sendPresenceUpdate: async () => {},
  };
}

/* Limpa a demo anterior para poder rodar quantas vezes quiser. */
await pool.query(`DELETE FROM whatsapp_mensagens WHERE phone_e164=$1`, [FONE]);
await pool.query(`DELETE FROM whatsapp_conversas WHERE phone_e164=$1`, [FONE]);
await pool.query(
  `DELETE FROM registration_links WHERE customer_id IN
     (SELECT id FROM customers WHERE phone_e164=$1)`,
  [FONE]
);
await pool.query(`DELETE FROM customers WHERE phone_e164=$1`, [FONE]);

/* ── 1. A conversa ─────────────────────────────────────────────── */
titulo("1. O CLIENTE ESCREVE NO WHATSAPP");

const sock = sockFalso();
const dele = ["oi, bom dia", "meu nome é tiago souza", "1", "queria 100 cartões de visita"];
let iEnviada = 0;

for (const texto of dele) {
  console.log(`\n  cliente ▸ ${texto}`);
  await pc.tratar({ sock, msg: { key: { id: "m" + Math.random() } }, jid: JID, texto });
  while (iEnviada < sock.enviadas.length) {
    const m = sock.enviadas[iEnviada++];
    for (const l of m.split("\n")) console.log(`      bot ◂ ${l}`);
  }
}

const { rows: fichaBot } = await pool.query(
  `SELECT id, name, type, status, phone, phone_e164, origin, document, email, city
     FROM customers WHERE phone_e164=$1`,
  [FONE]
);
const cliente = fichaBot[0];

console.log("\n  O QUE FICOU NO CRM DEPOIS DO BOT:");
linha();
for (const [k, v] of Object.entries(cliente)) {
  const vazio = v === null || v === "";
  console.log(`   ${k.padEnd(12)} ${vazio ? "— (vazio)" : v}`);
}
linha();
console.log("   Note: nome, telefone e tipo preenchidos. Documento, e-mail e");
console.log("   endereço vazios — o bot NÃO pede isso por WhatsApp.");

/* ── 2. O operador pede o cadastro ─────────────────────────────── */
titulo("2. O OPERADOR CLICA \"PEDIR CADASTRO\" NO CRM");

const rCriar = await fetch(`${BASE}/api/crm/registration-link`, {
  method: "POST",
  headers: { "content-type": "application/json", host: "127.0.0.1:3000" },
  body: JSON.stringify({ op: "criar", customerId: cliente.id }),
});
const criado = await rCriar.json();

console.log("\n  LINK GERADO:");
console.log(`   ${criado.url}`);
console.log(`   validade: ${new Date(criado.link.expiresAt).toLocaleDateString("pt-BR")}`);
console.log(`   status:   ${criado.link.status}`);

console.log("\n  PRÉVIA DA MENSAGEM (editável antes de enviar):");
linha();
for (const l of String(criado.mensagem).split("\n")) console.log(`   ${l}`);
linha();

/* ── 3. O cliente abre a página ────────────────────────────────── */
titulo("3. O CLIENTE ABRE O LINK NO CELULAR");

const token = criado.link.token;
const pagina = await fetch(`${BASE}/cadastro/${token}`);
const html = await pagina.text();

console.log(`\n  HTTP ${pagina.status} — página pública, sem login`);
const achou = (t) => (html.includes(t) ? "✔" : "✖");
console.log(`   ${achou("Tiago Souza")} nome já preenchido ("Tiago Souza")`);
console.log(`   ${achou("99442-7557")} telefone já preenchido`);
console.log(`   ${achou("Complete seu cadastro")} título da página`);
console.log(`   ${achou("necessário para emitir a nota fiscal")} explicação do CPF`);

const { rows: aposAbrir } = await pool.query(
  `SELECT status, opened_at FROM registration_links WHERE token=$1`,
  [token]
);
console.log(`\n   no CRM o link virou: ${aposAbrir[0].status} (abertura registrada)`);

/* ── 4. O cliente preenche ─────────────────────────────────────── */
titulo("4. O CLIENTE PREENCHE E ENVIA");

const envio = await fetch(`${BASE}/api/cadastro/${token}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    type: "pf",
    name: "Tiago Souza",
    document: "034.460.327-03",
    email: "tiago@exemplo.com.br",
    whatsapp: "(21) 99442-7557",
    cep: "21810-100",
    street: "Rua Araquem",
    number: "910",
    district: "Bangu",
    city: "Rio de Janeiro",
    state: "RJ",
  }),
});
console.log(`\n  HTTP ${envio.status} — ${JSON.stringify(await envio.json())}`);

const { rows: fichaFinal } = await pool.query(
  `SELECT id, name, type, status, document, email, phone, whatsapp,
          cep, street, number, district, city, state
     FROM customers WHERE id=$1`,
  [cliente.id]
);

console.log("\n  A MESMA FICHA, AGORA COMPLETA:");
linha();
for (const [k, v] of Object.entries(fichaFinal[0])) {
  const vazio = v === null || v === "";
  console.log(`   ${k.padEnd(12)} ${vazio ? "— (vazio)" : v}`);
}
linha();

const { rows: quantos } = await pool.query(
  `SELECT count(*)::int n FROM customers WHERE phone_e164=$1`,
  [FONE]
);
console.log(`   clientes com este telefone: ${quantos[0].n}  ← não duplicou`);
console.log(`   status: lead → ${fichaFinal[0].status}`);

/* ── 5. O link queima ──────────────────────────────────────────── */
titulo("5. ALGUÉM TENTA USAR O LINK DE NOVO");

const reuso = await fetch(`${BASE}/api/cadastro/${token}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "pf", name: "Outra Pessoa", document: "034.460.327-03" }),
});
console.log(`\n  HTTP ${reuso.status} — ${JSON.stringify(await reuso.json())}`);

const paginaMorta = await fetch(`${BASE}/cadastro/${token}`);
const htmlMorto = await paginaMorta.text();
console.log(
  `  a página agora diz: "${
    htmlMorto.includes("já foi concluído") || htmlMorto.includes("já utilizado")
      ? "Link já utilizado ou expirado"
      : "??? (verificar)"
  }"`
);

console.log();
await pool.end();
