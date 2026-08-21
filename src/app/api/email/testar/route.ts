/* Botão "Enviar e-mail de teste" do Painel.

   Duas etapas: primeiro `verify()` (conversa com o servidor sem
   mandar nada), depois o envio. Assim, quando falha, dá para dizer se
   o problema é a configuração ou o envio em si. */
import { enviarEmail, lerConfigEmail, verificarConexao } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* Sem corpo: usa o destino configurado no Painel. */
  }

  const cfg = await lerConfigEmail();
  const destino = String(body.para || cfg.testTo || cfg.replyTo || cfg.user || "").trim();
  if (!destino) {
    return Response.json(
      { error: "Preencha o campo \"Enviar teste para\" antes de testar." },
      { status: 422 }
    );
  }

  const conexao = await verificarConexao();
  if ("error" in conexao) return Response.json(conexao, { status: conexao.status });

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const resultado = await enviarEmail({
    para: destino,
    assunto: "Teste de e-mail — sistema VTDIGITAL",
    texto:
      `Deu certo!\n\n` +
      `Se você está lendo isto, o sistema já consegue enviar e-mails.\n\n` +
      `Servidor: ${cfg.host}:${cfg.port}\n` +
      `Enviado por: ${cfg.user}\n` +
      `Respostas vão para: ${cfg.replyTo || "(não configurado)"}\n` +
      `Data do teste: ${agora}\n`,
    html:
      `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">` +
      `<h2 style="color:#0891b2;margin:0 0 12px">Deu certo! ✅</h2>` +
      `<p style="margin:0 0 16px;color:#334155">Se você está lendo isto, o sistema já consegue enviar e-mails.</p>` +
      `<table style="font-size:13px;color:#475569;border-collapse:collapse">` +
      `<tr><td style="padding:3px 12px 3px 0">Servidor</td><td><code>${cfg.host}:${cfg.port}</code></td></tr>` +
      `<tr><td style="padding:3px 12px 3px 0">Enviado por</td><td>${cfg.user}</td></tr>` +
      `<tr><td style="padding:3px 12px 3px 0">Respostas para</td><td>${cfg.replyTo || "(não configurado)"}</td></tr>` +
      `<tr><td style="padding:3px 12px 3px 0">Data do teste</td><td>${agora}</td></tr>` +
      `</table></div>`,
  });

  if ("error" in resultado) return Response.json(resultado, { status: resultado.status });

  return Response.json({
    ok: true,
    mensagem: `E-mail enviado para ${destino}. Confira a caixa de entrada (e o spam, na primeira vez).`,
  });
}
