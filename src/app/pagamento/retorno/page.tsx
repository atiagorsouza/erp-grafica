import type { Metadata } from "next";
import Link from "next/link";
import { checkPayment, getChargeByNsu } from "@/lib/infinitepay";

export const metadata: Metadata = { title: "Pagamento" };
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
 */
export default async function RetornoPagamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const orderNsu = String(params.order_nsu || "").trim();

  let paid = false;
  let notFound = false;
  let description = "";
  let receipt = params.receipt_url || "";

  if (orderNsu) {
    const link = await getChargeByNsu(orderNsu);
    if (!link) {
      notFound = true;
    } else {
      description = link.description;
      const result = await checkPayment(link.id, {
        transactionNsu: params.transaction_nsu,
        slug: params.slug,
        receiptUrl: params.receipt_url,
      });
      if (!("error" in result)) {
        paid = result.paid === true || result.row?.status === "pago";
        receipt = receipt || result.row?.receiptUrl || "";
      }
    }
  } else {
    notFound = true;
  }

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

        {description && (
          <p className="mt-3 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 font-mono text-[11.5px] text-ink-600">
            {description}
          </p>
        )}

        {receipt && (
          <a
            href={receipt}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-paper-50 transition hover:bg-ink-800"
          >
            Ver comprovante
          </a>
        )}

        <div className="mt-5 border-t border-paper-200 pt-4">
          <Link href="/" className="font-mono text-[11px] tracking-wide text-ink-400 uppercase transition hover:text-ink-700">
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
