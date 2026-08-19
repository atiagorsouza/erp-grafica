/* ──────────────────────────────────────────────────────────────────
   Campanhas de WhatsApp.

   O disparo acontece em lotes pequenos, comandados pela tela — não há
   worker em background de propósito. Campanha é operação que o dono
   deve acompanhar com o olho, não deixar rodando sozinha a noite
   toda: se algo der errado, ele precisa estar ali para parar.
   ────────────────────────────────────────────────────────────────── */
import { db } from "@/db";
import { campaigns, campaignTargets, customers, settings } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  audiencia,
  campanhaComAlvos,
  criarCampanha,
  listarCampanhas,
  montarFila,
  podeEnviarAgora,
  proximosDaFila,
  registrarEnvio,
  textoParaCliente,
  verificarDisjuntor,
} from "@/lib/campanhas";

export const dynamic = "force-dynamic";

const WA_BASE = process.env.WA_SERVICE_URL || "http://127.0.0.1:3101";
const WA_TOKEN = process.env.WA_TOKEN || "";

async function nomeEmpresa(): Promise<string> {
  const linhas = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, ["wa_empresa_nome", "company_trade_name", "company_name"]));
  const m = new Map(linhas.map((r) => [r.key, String(r.value || "").trim()]));
  return m.get("wa_empresa_nome") || m.get("company_trade_name") || m.get("company_name") || "";
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  try {
    if (searchParams.get("audiencia") === "1") {
      const a = await audiencia();
      return Response.json({
        ok: true,
        elegiveis: a.elegiveis.length,
        inelegiveis: a.inelegiveis.length,
        /* Agrupado por motivo: "43 sem autorização" é acionável,
           uma lista de 43 nomes não é. */
        motivos: Object.entries(
          a.inelegiveis.reduce<Record<string, number>>((acc, x) => {
            acc[x.motivo] = (acc[x.motivo] || 0) + 1;
            return acc;
          }, {})
        )
          .map(([motivo, total]) => ({ motivo, total }))
          .sort((x, y) => y.total - x.total),
        amostra: a.elegiveis.slice(0, 8).map((e) => ({ nome: e.name, ultima: e.ultimaMensagem })),
      });
    }

    if (Number.isFinite(id) && id > 0) {
      const d = await campanhaComAlvos(id);
      if (!d) return Response.json({ error: "Campanha não encontrada" }, { status: 404 });
      return Response.json({ ok: true, ...d });
    }

    return Response.json({ ok: true, campanhas: await listarCampanhas() });
  } catch (e) {
    console.error("[campanhas GET]", e);
    return Response.json({ error: "Não foi possível carregar as campanhas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");
  const id = Number(body.id);

  try {
    if (op === "criar") {
      const r = await criarCampanha(body as never);
      if ("error" in r) return Response.json(r, { status: r.status });
      return Response.json({ ok: true, row: r.row });
    }

    if (!Number.isFinite(id)) {
      return Response.json({ error: "id obrigatório" }, { status: 400 });
    }

    if (op === "montar-fila") {
      const r = await montarFila(id);
      if ("error" in r) return Response.json(r, { status: r.status });
      return Response.json(r);
    }

    if (op === "pausar") {
      await db
        .update(campaigns)
        .set({ status: "pausada", pausedReason: "pausada pelo operador", updatedAt: new Date() })
        .where(eq(campaigns.id, id));
      return Response.json({ ok: true });
    }

    if (op === "cancelar") {
      await db
        .update(campaigns)
        .set({ status: "cancelada", finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(campaigns.id, id));
      return Response.json({ ok: true });
    }

    /* ── Disparo de um lote ──────────────────────────────────────
       `quantos` é pequeno (padrão 5) porque a tela chama de novo. O
       operador vê o progresso acontecer e pode parar no meio. */
    if (op === "enviar-lote") {
      const quantos = Math.min(Math.max(1, Number(body.quantos) || 5), 10);

      const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (!camp) return Response.json({ error: "Campanha não encontrada" }, { status: 404 });
      if (camp.status === "cancelada" || camp.status === "concluida") {
        return Response.json({ error: "Esta campanha já foi encerrada" }, { status: 409 });
      }

      const disj = await verificarDisjuntor(id);
      if (disj.pausar) {
        return Response.json(
          { error: `Campanha pausada automaticamente: ${disj.motivo}`, pausada: true },
          { status: 409 }
        );
      }

      const fila = await proximosDaFila(id, quantos);
      if (!fila.length) {
        /* Fila vazia tem dois significados diferentes: acabou a
           campanha, ou bateu o teto do dia. O operador precisa saber
           qual dos dois. */
        const restantes = await db
          .select({ id: campaignTargets.id })
          .from(campaignTargets)
          .where(and(eq(campaignTargets.campaignId, id), eq(campaignTargets.status, "fila")))
          .limit(1);

        if (!restantes.length) {
          await db
            .update(campaigns)
            .set({ status: "concluida", finishedAt: new Date(), updatedAt: new Date() })
            .where(eq(campaigns.id, id));
          return Response.json({ ok: true, concluida: true, enviados: 0 });
        }
        return Response.json({
          ok: true,
          enviados: 0,
          limiteDiario: true,
          aviso: "O limite de envios de hoje foi atingido. Continue amanhã.",
        });
      }

      if (camp.status === "rascunho") {
        await db
          .update(campaigns)
          .set({ status: "enviando", startedAt: new Date(), updatedAt: new Date() })
          .where(eq(campaigns.id, id));
      }

      const empresa = await nomeEmpresa();
      const resultados: { nome: string; ok: boolean; motivo?: string }[] = [];

      for (const alvo of fila) {
        /* Revalidação no instante do envio: a fila pode ser de ontem
           e a pessoa pode ter pedido opt-out desde então. */
        const pode = await podeEnviarAgora(alvo.customerId);
        if (!pode.ok) {
          await db
            .update(campaignTargets)
            .set({ status: "pulado", skipReason: pode.motivo })
            .where(eq(campaignTargets.id, alvo.id));
          resultados.push({ nome: `#${alvo.customerId}`, ok: false, motivo: pode.motivo });
          continue;
        }

        const [cli] = await db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, alvo.customerId))
          .limit(1);

        const texto = textoParaCliente(camp, { name: cli?.name || "" }, empresa);

        /* Botão nativo de verdade (v3.55.0). O serviço monta o
           nativeFlow e, se o WhatsApp recusar, manda o mesmo texto
           com o link no fim — o cliente nunca fica sem receber.

           `textoParaCliente` já anexa o link ao texto quando NÃO há
           botão; com botão, o link não é repetido. */
        const botoes = camp.ctaUrl
          ? [{
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: (camp.ctaLabel || "Ver mais").slice(0, 25),
                url: camp.ctaUrl,
                merchant_url: camp.ctaUrl,
              }),
            }]
          : undefined;

        try {
          const r = await fetch(`${WA_BASE}/enviar`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(WA_TOKEN ? { "x-wa-token": WA_TOKEN } : {}),
            },
            body: JSON.stringify({
              para: alvo.phoneE164,
              /* Com botão o link vai NO botão, então o texto vai limpo. */
              texto: botoes ? textoParaCliente({ ...camp, ctaUrl: null }, { name: cli?.name || "" }, empresa) : texto,
              botoes,
              rodape: botoes ? empresa : undefined,
            }),
            signal: AbortSignal.timeout(25_000),
          });
          const payload = (await r.json().catch(() => ({}))) as { erro?: string };

          if (r.ok) {
            await registrarEnvio(id, alvo.id, { ok: true });
            resultados.push({ nome: cli?.name || "", ok: true });
          } else {
            /* 403 do serviço = opt-out; qualquer outro é falha comum. */
            const bloqueado = r.status === 403;
            await registrarEnvio(id, alvo.id, {
              ok: false,
              bloqueado,
              erro: payload.erro || `HTTP ${r.status}`,
            });
            resultados.push({ nome: cli?.name || "", ok: false, motivo: payload.erro });
          }
        } catch (e) {
          await registrarEnvio(id, alvo.id, { ok: false, erro: (e as Error).message });
          resultados.push({ nome: cli?.name || "", ok: false, motivo: "serviço fora do ar" });
          /* Serviço caiu: parar o lote inteiro em vez de queimar a
             fila com erro. */
          break;
        }

        /* Jitter entre envios. Rajada é a assinatura mais óbvia de
           robô, e o intervalo aleatório é a defesa mais barata. */
        const min = Math.max(1, camp.minDelaySeconds ?? 8);
        const max = Math.max(min, camp.maxDelaySeconds ?? 25);
        await dorme((min + Math.random() * (max - min)) * 1000);
      }

      const depois = await verificarDisjuntor(id);
      return Response.json({
        ok: true,
        enviados: resultados.filter((r) => r.ok).length,
        falhas: resultados.filter((r) => !r.ok).length,
        resultados,
        pausada: depois.pausar,
        motivoPausa: depois.motivo,
      });
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[campanhas POST]", e);
    return Response.json({ error: "Não foi possível executar a operação." }, { status: 500 });
  }
}
