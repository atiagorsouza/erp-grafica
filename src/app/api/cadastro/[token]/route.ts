/* ──────────────────────────────────────────────────────────────────
   Rota PÚBLICA de submissão do cadastro.

   É a única rota do sistema que aceita escrita sem operador logado.
   Por isso três travas:
     1. o token precisa estar vivo (resolverToken)
     2. só campos da lista branca são aplicados (salvarCadastroPublico)
     3. o id do cliente vem do LINK, nunca do corpo — quem tem um link
        válido só consegue mexer no próprio cadastro
   ────────────────────────────────────────────────────────────────── */
import {
  concluirLink,
  ipDaRequisicao,
  resolverToken,
} from "@/lib/registration-links";
import { salvarCadastroPublico } from "@/lib/public-registration";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  const resolvido = await resolverToken(token);
  if ("error" in resolvido) {
    return Response.json({ error: resolvido.error }, { status: resolvido.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await salvarCadastroPublico(resolvido.cliente.id, body);
    if ("error" in result) {
      return Response.json(
        { error: result.error, campo: (result as { campo?: string }).campo },
        { status: result.status }
      );
    }

    await concluirLink(
      resolvido.link.id,
      ipDaRequisicao(req),
      req.headers.get("user-agent") || ""
    );

    /* Nada do cadastro volta para o navegador. O cliente já sabe o que
       digitou; devolver a linha inteira expõe campos internos
       (crédito, tags, anotações) que ele não deve ver. */
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[cadastro público]", e);
    return Response.json(
      { error: "Não foi possível salvar agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
