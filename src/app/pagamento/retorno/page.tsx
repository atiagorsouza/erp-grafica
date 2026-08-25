import type { Metadata } from "next";
import { AcoesComprovante } from "./AcoesComprovante";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { checkPayment, getChargeByNsu } from "@/lib/infinitepay";
import { formatBRL, toNumber } from "@/lib/money";

export const metadata: Metadata = {
  title: "Pagamento",
  /* Comprovante não é conteúdo público: nada de indexar. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  order_nsu?: string;
  transaction_nsu?: string;
  slug?: string;
  receipt_url?: string;
  capture_method?: string;
}>;

/**
 * Página de retorno após o checkout da InfinitePay.
 *
 * A InfinitePay redireciona o cliente para cá com os parâmetros da
 * transação. Aproveitamos para confirmar o pagamento ativamente — é o
 * fallback quando o webhook atrasa ou falha.
 *
 * v3.68.2: antes mostrava só "confirmado!" e a descrição. O dono
 * pediu o comprovante completo — "a compra e todos os dados
 * confirmados, cartão, pix etc": valor pago, método, parcelas,
 * protocolo e cliente. Tudo já vinha gravado em `payment_links`
 * pela confirmação — só não era mostrado.
 */

/* Método legível — `capture_method` chega como "pix" | "credit_card",
   mas a InfinitePay também manda via query string em alguns fluxos. */
function nomeMetodo(metodo: string | null | undefined): string | null {
  if (!metodo) return null;
  const m = metodo.trim().toLowerCase();
  if (m === "pix") return "PIX";
  if (m === "credit_card" || m === "credito" || m === "cartao") return "Cartão de crédito";
  if (m === "debit_card" || m === "debito") return "Cartão de débito";
  return metodo;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-paper-100 py-2.5 last:border-0">
      <span className="shrink-0 font-mono text-[10.5px] tracking-wide text-ink-400 uppercase">{rotulo}</span>
      <span className="text-right text-[13px] font-semibold break-words text-ink-800">{valor}</span>
    </div>
  );
}

export default async function RetornoPagamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const orderNsu = String(params.order_nsu || "").trim();

  let link = orderNsu ? await getChargeByNsu(orderNsu) : null;
  let notFound = !link;
  let paid = false;

  if (link) {
    const result = await checkPayment(link.id, {
      transactionNsu: params.transaction_nsu,
      slug: params.slug,
      receiptUrl: params.receipt_url,
    });
    if (!("error" in result)) {
      paid = result.paid === true || result.row?.status === "pago";
      /* A linha atualizada traz o que só existe DEPOIS do pagamento:
         paidAmount, captureMethod, installments, receiptUrl. */
      if (result.row) link = { ...link, ...result.row };
    }
  }

  const cliente = link?.customerId
    ? (await db.select({ name: customers.name, tradeName: customers.tradeName }).from(customers).where(eq(customers.id, link.customerId)).limit(1))[0]
    : undefined;

  const metodo = nomeMetodo(link?.captureMethod ?? params.capture_method);
  const parcelas = link?.installments && link.installments > 1 ? link.installments : null;
  const valorPago = link ? toNumber(link.paidAmount ?? null) : 0;
  const valor = valorPago > 0 ? valorPago : toNumber(link?.amount ?? null);
  const receipt = link?.receiptUrl || params.receipt_url || "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-paper-200 bg-white p-7 text-center shadow-card">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            paid ? "bg-emerald-50 text-emerald-600" : notFound ? "bg-red-50 text-red-600" : "bg-yellow-50 text-yellow-700"
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {paid ? <path d="M20 6 9 17l-5-5" /> : notFound ? <path d="M18 6 6 18M6 6l12 12" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
          </svg>
        </div>

        <h1 className="mt-4 text-[19px] font-bold text-ink-900">
          {paid ? "Pagamento confirmado!" : notFound ? "Cobrança não encontrada" : "Pagamento em processamento"}
        </h1>

        <p className="mt-2 text-[13px] text-ink-600">
          {paid
            ? "Recebemos seu pagamento. Já estamos com tudo certo por aqui."
            : notFound
              ? "Não localizamos esta cobrança. Se você concluiu o pagamento, fale com a gráfica."
              : "Seu pagamento está sendo confirmado. Isso costuma levar alguns instantes."}
        </p>

        {paid && valor > 0 && (
          <p className="mt-3 font-mono text-[26px] leading-none font-bold text-ink-900 tnum">{formatBRL(valor)}</p>
        )}
        {paid && metodo && (
          <p className="mt-1.5 text-[12.5px] font-semibold text-emerald-700">
            {metodo}
            {parcelas ? ` · ${parcelas}×` : ""}
          </p>
        )}

        {link && (
          <div className="mt-5 rounded-xl border border-paper-200 bg-paper-50 px-4 py-1 text-left">
            <Linha rotulo="Cobrança" valor={link.description} />
            {cliente && <Linha rotulo="Cliente" valor={cliente.tradeName || cliente.name} />}
            {!paid && valor > 0 && <Linha rotulo="Valor" valor={formatBRL(valor)} />}
            {metodo && !paid && <Linha rotulo="Método" valor={metodo} />}
            <Linha rotulo="Protocolo" valor={<span className="font-mono text-[12px]">{link.orderNsu}</span>} />
            {link.transactionNsu && (
              <Linha rotulo="Transação" valor={<span className="font-mono text-[12px]">{link.transactionNsu}</span>} />
            )}
          </div>
        )}

        {paid && <AcoesComprovante />}

        {receipt && (
          <a
            href={receipt}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center justify-center rounded-lg border border-paper-300 px-4 py-2 text-[12px] font-medium text-ink-500 transition hover:border-ink-400 hover:text-ink-700"
          >
            Recibo no site da InfinitePay
          </a>
        )}

        <div className="mt-5 border-t border-paper-200 pt-4">
          <p className="text-[11.5px] leading-relaxed text-ink-400">
            Pode fechar esta aba. A gráfica recebeu o pagamento automaticamente.
          </p>
        </div>
      </div>
    </main>
  );
}
