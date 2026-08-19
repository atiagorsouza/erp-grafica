#!/usr/bin/env node
/* Simula conversas inteiras contra o banco real, sem WhatsApp.
   Um sock falso registra o que "seria enviado".

   Rode: node testar-fluxo.mjs */
import "dotenv/config";
import pg from "pg";
import { criarPreCadastro } from "./src/pre-cadastro.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pc = criarPreCadastro({ pool, empresa: "VTDIGITAL" });
await pc.garantirTabela();

let ok = 0, falhas = 0;
const checar = (cond, desc) => {
  console.log(`  ${cond ? "✔" : "✖"} ${desc}`);
  cond ? ok++ : falhas++;
};

function sockFalso() {
  const enviadas = [];
  return {
    enviadas,
    sendMessage: async (jid, c) => { enviadas.push(c.text); return { key: { id: "x" + enviadas.length } }; },
    sendPresenceUpdate: async () => {},
  };
}

async function conversar(jid, textos) {
  const sock = sockFalso();
  for (const t of textos) {
    await pc.tratar({ sock, msg: { key: { id: "m" + Math.random() } }, jid, texto: t });
  }
  return sock.enviadas;
}

const limpar = async (fone) => {
  await pool.query(`DELETE FROM whatsapp_mensagens WHERE phone_e164=$1`, [fone]);
  await pool.query(`DELETE FROM whatsapp_conversas WHERE phone_e164=$1`, [fone]);
  await pool.query(`DELETE FROM customers WHERE phone_e164=$1`, [fone]);
};

console.log("\n═══ 1. Fluxo completo de pré-cadastro ═══");
await limpar("5521970001111");
let r = await conversar("5521970001111@s.whatsapp.net", [
  "oi", "meu nome é maria da silva", "2", "preciso de 500 cartões",
]);
r.forEach((m, i) => console.log(`   [${i + 1}] ${m.replace(/\n/g, " / ").slice(0, 68)}`));
checar(r[0]?.includes("como posso te chamar"), "pergunta o nome");
checar(r[1]?.includes("Maria"), "cumprimenta usando o nome");
checar(r[2]?.includes("anotado"), "confirma o tipo");

let { rows } = await pool.query(
  `SELECT name, type, status, origin FROM customers WHERE phone_e164='5521970001111'`
);
console.log(`   → cadastro: ${JSON.stringify(rows[0])}`);
// "da/de/dos" ficam minúsculos por desenho — é como se escreve nome.
checar(rows[0]?.name === "Maria da Silva", "nome limpo e capitalizado");
checar(rows[0]?.type === "pj", "identificou empresa");
checar(rows[0]?.status === "lead", "gravado como lead");
checar(rows[0]?.origin === "whatsapp", "origem registrada");

console.log("\n═══ 2. Nome no meio da frase ═══");
for (const [ent, esp] of [
  ["me chamo joão pedro", "João Pedro"],
  ["sou o carlos", "Carlos"],
  ["ANA MARIA", "Ana Maria"],
]) {
  const f = "552197000" + Math.floor(1000 + Math.random() * 8999);
  await limpar(f);
  await conversar(`${f}@s.whatsapp.net`, ["oi", ent]);
  const { rows: x } = await pool.query(`SELECT name FROM customers WHERE phone_e164=$1`, [f]);
  checar(x[0]?.name === esp, `"${ent}" → "${esp}" (veio "${x[0]?.name}")`);
  await limpar(f);
}

console.log("\n═══ 3. Pedido de atendente interrompe o bot ═══");
await limpar("5521970002222");
r = await conversar("5521970002222@s.whatsapp.net", ["oi", "quero falar com um atendente", "alô?"]);
checar(r.some((m) => m.includes("chamando alguém")), "aciona humano");
checar(r.length === 2, `bot silencia depois (enviou ${r.length})`);

console.log("\n═══ 4. Opt-out ═══");
await limpar("5521970003333");
r = await conversar("5521970003333@s.whatsapp.net", ["oi", "sair"]);
const { rows: o } = await pool.query(
  `SELECT whatsapp_opt_out FROM customers WHERE phone_e164='5521970003333'`
);
checar(o[0]?.whatsapp_opt_out === true, "marca opt-out no cadastro");
checar(r[1]?.includes("não envio mais"), "confirma para a pessoa");

console.log("\n═══ 5. Cliente existente NÃO entra no funil ═══");
await limpar("5521970004444");
await pool.query(
  `INSERT INTO customers (type,name,whatsapp,phone_e164,status)
   VALUES ('pf','Roberto Antigo','(21) 97000-4444','5521970004444','ativo')`
);
r = await conversar("5521970004444@s.whatsapp.net", ["bom dia, preciso de banner"]);
checar(r[0]?.includes("Roberto"), "reconhece pelo nome");
checar(!r[0]?.includes("como posso te chamar"), "não pergunta o nome de novo");

console.log("\n═══ 6. Cadastro antigo SEM o nono dígito ═══");
await limpar("552170005555");
await pool.query(
  `INSERT INTO customers (type,name,whatsapp,phone_e164,status)
   VALUES ('pf','Cliente Antigo','(21) 7000-5555','552170005555','ativo')`
);
// JID chega COM o nono dígito
r = await conversar("5521970005555@s.whatsapp.net", ["oi"]);
const { rows: dup } = await pool.query(
  `SELECT count(*)::int n FROM customers WHERE name IN ('Cliente Antigo') OR phone_e164 LIKE '%70005555'`
);
checar(r[0]?.includes("Cliente") || r[0]?.includes("Antigo"), "achou o cadastro antigo");
checar(dup[0].n === 1, `NÃO duplicou o cliente (${dup[0].n} registro)`);

console.log("\n═══ 7. Duas mensagens simultâneas do mesmo número ═══");
await limpar("5521970006666");
const s1 = sockFalso(), s2 = sockFalso();
await Promise.all([
  pc.tratar({ sock: s1, msg: { key: { id: "a" } }, jid: "5521970006666@s.whatsapp.net", texto: "oi" }),
  pc.tratar({ sock: s2, msg: { key: { id: "b" } }, jid: "5521970006666@s.whatsapp.net", texto: "olá" }),
]);
const { rows: corrida } = await pool.query(
  `SELECT count(*)::int n FROM customers WHERE phone_e164='5521970006666'`
);
checar(corrida[0].n === 1, `corrida criou 1 cliente só (${corrida[0].n})`);

console.log("\n═══ 8. Grupo e status são ignorados ═══");
const sg = sockFalso();
await pc.tratar({ sock: sg, msg: { key: { id: "g" } }, jid: "12345-67890@g.us", texto: "oi" })
  .catch(() => {});
checar(sg.enviadas.length === 0, "não responde em grupo");

for (const f of ["5521970001111","5521970002222","5521970003333","5521970004444","552170005555","5521970005555","5521970006666"]) {
  await limpar(f);
}

console.log(`\n${"═".repeat(46)}`);
console.log(`  ${ok} passaram · ${falhas} falharam`);
console.log("═".repeat(46));
await pool.end();
process.exit(falhas ? 1 : 0);
