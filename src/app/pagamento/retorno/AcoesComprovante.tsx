"use client";

/* Ações do comprovante de pagamento — precisa de client porque
   `window.print` só existe no navegador.

   Quem paga é CLIENTE, não operador: esta página nunca pode oferecer
   caminho de volta para DENTRO do sistema (incidente 25/08 — o botão
   "Voltar ao início" levava o cliente para a home do ERP). Aqui só
   existe imprimir o cupom e fechar. */
export function AcoesComprovante() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-paper-50 transition hover:bg-ink-800"
    >
      Imprimir comprovante
    </button>
  );
}
