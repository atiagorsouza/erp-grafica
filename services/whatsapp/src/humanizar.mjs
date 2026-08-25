/* ──────────────────────────────────────────────────────────────────
   ENVIO HUMANIZADO

   Por que existe: o serviço respondia instantaneamente. Do outro lado
   aparece uma mensagem que surge do nada, sem "digitando", às vezes em
   menos de 200 ms depois da pergunta. Isso é assinatura de robô — e é
   um dos sinais que o WhatsApp usa para derrubar número.

   Havia uma função com pausa em `pre-cadastro.mjs`, mas só o bot de
   pré-cadastro a usava. Tudo o que sai do ERP — aviso de pedido,
   orçamento, campanha — saía cru.

   O que se imita aqui:

     1. LER a mensagem antes de responder (pausa curta)
     2. mostrar "digitando…" enquanto "escreve"
     3. levar mais tempo em texto longo, como alguém digitando de fato
     4. parar de "digitar" ao enviar

   Nada disso é enfeite: é o que separa uma conta que dura de uma que
   é bloqueada em duas semanas.
   ────────────────────────────────────────────────────────────────── */

const dorme = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Aleatório entre dois valores. Ritmo constante também denuncia robô. */
const entre = (min, max) => min + Math.random() * (max - min);

/* Ajustáveis por variável de ambiente, para o dono afrouxar ou apertar
   sem mexer no código. */
const LEITURA_MIN = Number(process.env.WA_LEITURA_MIN || 700);
const LEITURA_MAX = Number(process.env.WA_LEITURA_MAX || 1800);

/** Caracteres por segundo de "digitação". 18 cps ≈ 210 ppm — rápido,
    mas plausível para quem usa atalho ou copia texto pronto. */
const CPS = Number(process.env.WA_CPS || 18);

/** Teto: ninguém espera 40 s por uma mensagem. */
const DIGITANDO_MAX = Number(process.env.WA_DIGITANDO_MAX || 8000);
const DIGITANDO_MIN = Number(process.env.WA_DIGITANDO_MIN || 600);

/** Desligar por completo — útil em teste automatizado. */
const LIGADO = process.env.WA_HUMANIZAR !== "0";

/**
 * Quanto tempo alguém levaria para digitar este texto.
 *
 * Proporcional ao tamanho, com teto: uma mensagem de 500 caracteres
 * levaria 28 s em 18 cps, o que faria o cliente desistir. O teto
 * mantém a impressão de digitação sem testar a paciência de ninguém.
 */
export function tempoDeDigitacao(texto) {
  const n = String(texto || "").length;
  const bruto = (n / CPS) * 1000;
  return Math.min(DIGITANDO_MAX, Math.max(DIGITANDO_MIN, bruto));
}

/**
 * Envia imitando gente: lê, digita, envia.
 *
 * `enviar` é a função que de fato manda — recebida de fora para este
 * módulo servir tanto ao texto simples quanto à mensagem com botões.
 */
export async function enviarHumanizado(sock, jid, texto, enviar) {
  if (!LIGADO) return enviar();

  /* 1. Leu a mensagem. */
  await dorme(entre(LEITURA_MIN, LEITURA_MAX));

  /* 2. Começou a digitar. Se o WhatsApp recusar o aviso de presença,
        segue mesmo assim: o envio importa mais que o enfeite. */
  try {
    await sock.sendPresenceUpdate("composing", jid);
  } catch {
    /* sem presença, ainda vale a pausa */
  }

  /* 3. Digitando — tempo conforme o tamanho do texto.

        Em texto longo o WhatsApp derruba o "digitando" depois de uns
        segundos; reenviar mantém o aviso vivo do lado do cliente. */
  const total = tempoDeDigitacao(texto);
  let restante = total;
  while (restante > 0) {
    const fatia = Math.min(restante, 4000);
    await dorme(fatia);
    restante -= fatia;
    if (restante > 0) {
      try {
        await sock.sendPresenceUpdate("composing", jid);
      } catch {
        /* ignora */
      }
    }
  }

  /* 4. Enviou e parou de digitar. */
  const r = await enviar();
  try {
    await sock.sendPresenceUpdate("paused", jid);
  } catch {
    /* ignora */
  }
  return r;
}

/**
 * Intervalo entre mensagens de uma mesma rodada de disparo.
 *
 * Campanha que dispara 50 mensagens em 50 segundos é o padrão clássico
 * de conta derrubada. Espaçar de forma irregular custa tempo, mas é o
 * que mantém o número vivo.
 */
export function intervaloEntreEnvios() {
  return entre(
    Number(process.env.WA_INTERVALO_MIN || 8000),
    Number(process.env.WA_INTERVALO_MAX || 25000)
  );
}

export { dorme };
