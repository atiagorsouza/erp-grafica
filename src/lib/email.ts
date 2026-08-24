import "server-only";
/* ──────────────────────────────────────────────────────────────────
   Envio de e-mail.

   Toda a configuração mora no Painel de Controle (grupo "E-mail"),
   não no .env: regra do dono — quanto mais configuração sem
   programação, melhor.

   A senha é lida direto do banco. Ela nunca trafega para o navegador:
   `/api/crud/settings` devolve "__SET__" no lugar (v3.63.0).
   ────────────────────────────────────────────────────────────────── */
import nodemailer from "nodemailer";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { inArray } from "drizzle-orm";

export interface ConfigEmail {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  replyTo: string;
  testTo: string;
}

const CHAVES = [
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_password",
  "smtp_from_name",
  "smtp_reply_to",
  "smtp_test_to",
] as const;

export async function lerConfigEmail(): Promise<ConfigEmail> {
  const linhas = await db.select().from(settings).where(inArray(settings.key, [...CHAVES]));
  const v = new Map(linhas.map((l) => [l.key, String(l.value ?? "")]));
  const porta = Number(v.get("smtp_port")) || 465;
  return {
    host: v.get("smtp_host") || "",
    port: porta,
    /* SSL implícito é 465; 587 usa STARTTLS, que o nodemailer chama de
       `secure: false` + upgrade automático. */
    secure: (v.get("smtp_secure") || "ssl") === "ssl",
    user: v.get("smtp_user") || "",
    password: v.get("smtp_password") || "",
    fromName: v.get("smtp_from_name") || "",
    replyTo: v.get("smtp_reply_to") || "",
    testTo: v.get("smtp_test_to") || "",
  };
}

export type ErroEmail = { error: string; status: number; details?: Record<string, unknown> };

/** Traduz a falha do servidor de e-mail para algo que o operador entenda. */
export function explicarErro(e: unknown, cfg: ConfigEmail): string {
  const bruto = `${String((e as { code?: string })?.code ?? "")} ${String(e)}`.toLowerCase();

  if (bruto.includes("eauth") || bruto.includes("535") || bruto.includes("authentication")) {
    return "O servidor recusou o usuário ou a senha. Confira os dois — e lembre que a senha é a da caixa de e-mail, não a do painel da Hostinger.";
  }
  if (bruto.includes("econnrefused")) {
    return `Não consegui falar com ${cfg.host} na porta ${cfg.port}. Se está usando 465, tente 587 com TLS (ou o contrário).`;
  }
  if (bruto.includes("etimedout") || bruto.includes("timeout")) {
    return `O servidor ${cfg.host} não respondeu a tempo. Confira o endereço e se o servidor tem saída para a internet.`;
  }
  if (bruto.includes("enotfound") || bruto.includes("edns")) {
    return `O endereço ${cfg.host} não existe. Confira se não faltou uma letra (o certo costuma ser smtp.hostinger.com).`;
  }
  if (bruto.includes("self-signed") || bruto.includes("certificate")) {
    return "O certificado do servidor não foi aceito. Confira se a porta combina com o tipo de segurança escolhido.";
  }
  if (bruto.includes("450") || bruto.includes("451") || bruto.includes("421")) {
    return "O servidor pediu para tentar mais tarde (limite temporário). Espere alguns minutos.";
  }
  return "Não consegui enviar. Confira servidor, porta, usuário e senha.";
}

/** Falta algo essencial? Devolve a mensagem; senão, null. */
export function faltaConfig(cfg: ConfigEmail): string | null {
  if (!cfg.host) return "Preencha o servidor de saída antes de testar.";
  if (!cfg.user) return "Preencha o usuário (e-mail de envio) antes de testar.";
  if (!cfg.password) return "Preencha a senha antes de testar.";
  return null;
}

function criarTransporte(cfg: ConfigEmail) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    /* Sem isto, uma configuração errada trava a tela por minutos. */
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

export interface Anexo {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

/**
 * Envia um e-mail com a configuração do Painel.
 *
 * Devolve `{ ok: true }` ou um erro já em português — quem chama não
 * precisa saber traduzir código de SMTP.
 */
export async function enviarEmail(opcoes: {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
  anexos?: Anexo[];
}): Promise<{ ok: true; messageId: string } | ErroEmail> {
  const cfg = await lerConfigEmail();

  const falta = faltaConfig(cfg);
  if (falta) return { error: falta, status: 422, details: { code: "SMTP_INCOMPLETO" } };

  const destino = String(opcoes.para || "").trim();
  if (!destino || !destino.includes("@")) {
    return { error: "Endereço de destino inválido.", status: 422 };
  }

  try {
    const info = await criarTransporte(cfg).sendMail({
      from: cfg.fromName ? `"${cfg.fromName}" <${cfg.user}>` : cfg.user,
      /* O cliente responde para a caixa de atendimento, não para o
         noreply — senão a resposta dele cai num buraco. */
      replyTo: cfg.replyTo || undefined,
      to: destino,
      subject: opcoes.assunto,
      text: opcoes.texto,
      html: opcoes.html,
      attachments: opcoes.anexos,
    });
    return { ok: true as const, messageId: String(info.messageId || "") };
  } catch (e) {
    console.error("[email] falha no envio", e);
    return { error: explicarErro(e, cfg), status: 502, details: { code: "SMTP_FALHOU" } };
  }
}

/** Confere a configuração sem enviar nada (usado antes do teste). */
export async function verificarConexao(): Promise<{ ok: true } | ErroEmail> {
  const cfg = await lerConfigEmail();
  const falta = faltaConfig(cfg);
  if (falta) return { error: falta, status: 422, details: { code: "SMTP_INCOMPLETO" } };
  try {
    await criarTransporte(cfg).verify();
    return { ok: true as const };
  } catch (e) {
    return { error: explicarErro(e, cfg), status: 502, details: { code: "SMTP_FALHOU" } };
  }
}
