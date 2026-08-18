"use client";

import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type DocType = "order" | "quote";

interface PrintDocumentProps {
  type: DocType;
  doc: Row;
  customer?: Row | null;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  company: Record<string, string>;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "RASCUNHO", enviado: "ENVIADO", aprovado: "APROVADO",
  recusado: "RECUSADO", expirado: "EXPIRADO",
  aberto: "ABERTO", confirmado: "CONFIRMADO", concluido: "CONCLUÍDO", cancelado: "CANCELADO",
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: "#94a3b8", enviado: "#0891b2", aprovado: "#16a34a",
  recusado: "#dc2626", expirado: "#d97706",
  aberto: "#0891b2", confirmado: "#16a34a", concluido: "#16a34a", cancelado: "#dc2626",
};

export function PrintDocument({ type, doc, customer, items, company }: PrintDocumentProps) {
  const isOrder = type === "order";
  const title = isOrder ? "ORDEM DE PRODUÇÃO" : "ORÇAMENTO / PROPOSTA";
  const number = String(doc.number || "");
  const status = String(doc.status || "");
  const date = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discount = Number(doc.discount || 0);
  const taxes = Number(doc.taxes || 0);
  const total = Number(doc.total || subtotal - discount + taxes);

  const co = company;
  const companyName = co.company_name || "VTDIGITAL ART STUDIO";
  const companyStreet = [co.company_street, co.company_number].filter(Boolean).join(", ");
  const companyLocation = [co.company_district, co.company_city, co.company_state].filter(Boolean).join(" · ");
  const companyCep = co.company_cep ? `CEP ${co.company_cep}` : "";

  function openPrintWindow() {
    const el = document.getElementById("print-doc-content");
    if (!el) return;
    const win = window.open("", "print_doc", "width=820,height=1000,scrollbars=yes,resizable=yes");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${number}</title>
<style>
@page{size:A4;margin:12mm 15mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1e293b;line-height:1.5;background:#fff}
.doc{max-width:210mm;margin:0 auto;padding:10mm}
.cmyk-bar{height:5px;background:linear-gradient(90deg,#0891b2 0 25%,#d6246e 25% 50%,#eab308 50% 75%,#171b24 75% 100%)}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #e2e8f0}
.header h1{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.3px}
.header .sub{font-size:9px;color:#0891b2;text-transform:uppercase;letter-spacing:1.5px;font-weight:600}
.header .right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
.doc-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:16px 0;display:flex;justify-content:space-between;align-items:center}
.doc-box .label{font-size:8px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:600}
.doc-box .number{font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}
.doc-box .date{font-size:18px;font-weight:700;color:#0f172a}
.badge{display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.5px}
.section{margin:20px 0 8px}
.section h3{font-size:13px;font-weight:700;color:#0f172a;border-bottom:2px solid #0f172a;padding-bottom:4px;display:inline-block}
.grid{display:grid;gap:2px 16px}
.grid-4{grid-template-columns:repeat(4,1fr)}
.grid-2{grid-template-columns:repeat(2,1fr)}
.field-label{font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600;margin-top:8px}
.field-value{font-size:11px;color:#1e293b;font-weight:500}
table{width:100%;border-collapse:collapse;margin:8px 0}
thead{background:#0f172a}
thead th{color:#fff;padding:8px 12px;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;text-align:left}
thead th.right{text-align:right}
tbody td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px}
tbody td.right{text-align:right;font-family:'Courier New',monospace}
tbody td.num{text-align:center}
.totals{display:flex;justify-content:space-between;margin:16px 0}
.totals-left{flex:1}
.totals-right{width:260px}
.totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}
.totals-row.total-final{background:#0f172a;color:#fff;padding:10px 14px;border-radius:4px;font-size:14px;font-weight:700;margin-top:4px}
.totals-row.total-final .amount{color:#22d3ee;font-size:16px}
.checks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.check-item{display:flex;align-items:center;gap:6px;font-size:10px;color:#64748b}
.check-box{width:12px;height:12px;border:1.5px solid #cbd5e1;border-radius:2px}
.signatures{display:flex;justify-content:space-between;margin-top:40px;padding-top:8px}
.sig{text-align:center;width:45%}
.sig-line{border-top:1px solid #94a3b8;padding-top:6px;font-size:9px;color:#94a3b8;font-style:italic}
.footer-note{text-align:center;margin-top:24px;font-size:9px;color:#94a3b8;font-style:italic}
.no-print{text-align:center;padding:14px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:10}
.no-print button{font-size:14px;padding:10px 28px;cursor:pointer;border:none;border-radius:6px;margin:0 6px;font-weight:600}
.no-print .btn-print{background:#0891b2;color:#fff}
.no-print .btn-close{background:#fff;color:#334155;border:1px solid #cbd5e1}
@media print{.no-print{display:none}.doc{padding:0}}
</style></head><body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir A4</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>`);
    win.document.write(el.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
  }

  return (
    <>
      <button
        onClick={openPrintWindow}
        className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:border-ink-400 hover:bg-white"
      >
        🖨️ Imprimir {isOrder ? "OS" : "orçamento"} A4
      </button>

      {/* Hidden print content */}
      <div id="print-doc-content" style={{ display: "none" }}>
        <div className="doc">
          {/* CMYK bar */}
          <div className="cmyk-bar" />

          {/* Header empresa */}
          <div className="header">
            <div>
              <h1>{companyName}</h1>
              <div className="sub">GRÁFICA RÁPIDA E PERSONALIZADOS</div>
            </div>
            <div className="right">
              {companyStreet && <div>{companyStreet}</div>}
              {companyLocation && <div>{companyLocation} · {companyCep}</div>}
              {co.company_phone && <div>{co.company_phone} ·</div>}
              {co.company_email && <div>{co.company_email} ·</div>}
              {co.company_document && <div>CNPJ {co.company_document}</div>}
            </div>
          </div>

          {/* Número do documento */}
          <div className="doc-box">
            <div>
              <div className="label">{title}</div>
              <div className="number">{number}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label">Emissão</div>
              <div className="date">{date}</div>
              <div className="badge" style={{ background: STATUS_COLOR[status] || "#64748b", marginTop: 4 }}>
                {STATUS_LABEL[status] || status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Dados do cliente */}
          <div className="section"><h3>Dados do cliente</h3></div>
          <div className="grid grid-4">
            <div><div className="field-label">CLIENTE</div><div className="field-value">{customer?.tradeName || customer?.name || "Consumidor avulso"}</div></div>
            <div><div className="field-label">CPF/CNPJ</div><div className="field-value">{customer?.document || "—"}</div></div>
            <div><div className="field-label">CONTATO</div><div className="field-value">{customer?.whatsapp || customer?.mobilePhone || customer?.phone || "—"}</div></div>
            <div><div className="field-label">E-MAIL</div><div className="field-value">{customer?.email || "—"}</div></div>
          </div>
          <div><div className="field-label">ENDEREÇO</div><div className="field-value">{[customer?.street, customer?.number, customer?.district, customer?.city, customer?.state].filter(Boolean).join(", ") || "—"}</div></div>

          {/* Condições */}
          {isOrder && (
            <>
              <div className="section"><h3>Condições do pedido</h3></div>
              <div className="grid grid-4">
                <div><div className="field-label">CANAL</div><div className="field-value">Atendimento</div></div>
                <div><div className="field-label">PAGAMENTO</div><div className="field-value">{doc.paymentMethod || "A definir"}</div></div>
                <div><div className="field-label">ETAPA ATUAL</div><div className="field-value">{doc.productionStatus || status}</div></div>
                <div><div className="field-label">SITUAÇÃO FINANCEIRA</div><div className="field-value">{total > 0 ? "pendente" : "—"}</div></div>
              </div>
              <div className="grid grid-2">
                <div><div className="field-label">ENTREGA</div><div className="field-value">{doc.deliveryStatus === "a_definir" ? "Balcão" : doc.deliveryStatus || "Balcão"}</div></div>
                <div><div className="field-label">PREVISÃO</div><div className="field-value">{doc.dueDate ? new Date(doc.dueDate).toLocaleDateString("pt-BR") : "—"}</div></div>
              </div>
            </>
          )}
          {!isOrder && (
            <>
              <div className="section"><h3>Condições da proposta</h3></div>
              <div className="grid grid-4">
                <div><div className="field-label">PAGAMENTO</div><div className="field-value">{doc.paymentMethod || "A definir"}</div></div>
                <div><div className="field-label">VALIDADE</div><div className="field-value">{doc.validUntil ? new Date(doc.validUntil + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</div></div>
                <div><div className="field-label">STATUS</div><div className="field-value">{STATUS_LABEL[status] || status}</div></div>
                <div><div className="field-label">SITUAÇÃO</div><div className="field-value">{status === "aprovado" ? "pago" : "pendente"}</div></div>
              </div>
            </>
          )}

          {/* Tabela de itens */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Descrição do produto / serviço</th>
                <th className="right" style={{ width: 60 }}>Qtd.</th>
                <th className="right" style={{ width: 90 }}>Unitário</th>
                <th className="right" style={{ width: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="num" style={{ color: "#94a3b8" }}>{String(i + 1).padStart(2, "0")}</td>
                  <td>{item.description}</td>
                  <td className="right">{item.quantity}</td>
                  <td className="right">{formatMoney(item.unitPrice)}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{formatMoney(item.total)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>Sem itens registrados</td></tr>
              )}
            </tbody>
          </table>

          {/* Totais + observações */}
          <div className="totals">
            <div className="totals-left">
              <div className="section"><h3>Informações / anotações / observações</h3></div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{doc.notes || "Sem observações registradas."}</div>
              {isOrder && (
                <div className="checks">
                  <div className="check-item"><div className="check-box" /> Arte conferida</div>
                  <div className="check-item"><div className="check-box" /> Material separado</div>
                  <div className="check-item"><div className="check-box" /> Produção revisada</div>
                  <div className="check-item"><div className="check-box" /> Embalado</div>
                </div>
              )}
            </div>
            <div className="totals-right">
              <div className="totals-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="totals-row"><span>Frete</span><span>R$ 0,00</span></div>
              <div className="totals-row"><span>Desconto</span><span>− {formatMoney(discount)}</span></div>
              {taxes > 0 && <div className="totals-row"><span>Impostos</span><span>{formatMoney(taxes)}</span></div>}
              <div className="totals-row total-final"><span>Total</span><span className="amount">{formatMoney(total)}</span></div>
            </div>
          </div>

          {/* Assinaturas */}
          <div className="signatures">
            <div className="sig"><div className="sig-line">Responsável pela produção</div></div>
            <div className="sig"><div className="sig-line">Cliente / retirada / recebimento</div></div>
          </div>

          {/* Rodapé */}
          <div className="footer-note">PrintFlow · {isOrder ? "Pedido" : "Orçamento"} sem valor fiscal.</div>
        </div>
      </div>
    </>
  );
}
