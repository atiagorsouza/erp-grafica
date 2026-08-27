import { getClientesParaExport } from "@/lib/queries";
import { csvServidor, nomeArquivoCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/clientes?q=&status=&origem=
 *
 * Devolve a carteira inteira (respeitando os mesmos filtros da tela de
 * Clientes) como CSV. A tela é paginada no servidor — o navegador nunca
 * tem todos os clientes — então o arquivo é gerado aqui.
 *
 * Segurança: é rota interna do ERP, igual a /api/crud/* — fica atrás
 * do Cloudflare Access (ver AGENTE-SERVIDOR.md §2). Não há segredo nem
 * PII do portal; ainda assim o arquivo leva CPF/CNPJ e telefone, então
 * não expor a rota pública.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const origem = searchParams.get("origem") || "all";

  const linhas = await getClientesParaExport({ busca: q, status, origem });

  const TIPO: Record<string, string> = { pf: "PF", pj: "PJ" };
  const STATUS: Record<string, string> = {
    lead: "Lead",
    ativo: "Ativo",
    inativo: "Inativo",
    bloqueado: "Bloqueado",
  };
  const ORIGEM: Record<string, string> = {
    whatsapp: "WhatsApp",
    indicacao: "Indicação",
    instagram: "Instagram",
    balcao: "Balcão",
  };

  const rows: (string[] | null)[] = [
    ["VTDIGITAL — Carteira de clientes"],
    [`Gerado em ${new Date().toISOString().slice(0, 10)} · ${linhas.length} cliente(s)`],
    null,
    [
      "ID",
      "Tipo",
      "Nome / Razão social",
      "Nome fantasia",
      "Documento",
      "E-mail",
      "Telefone",
      "WhatsApp",
      "Cidade",
      "UF",
      "Status",
      "Origem",
      "Marketing",
      "Aniversário",
      "Cadastro",
      "LTV (R$)",
    ],
    ...linhas.map((c, i) => [
      String(i + 1),
      TIPO[c.tipo] || c.tipo,
      c.nome,
      c.nome_fantasia ?? "",
      c.documento ?? "",
      c.email ?? "",
      c.telefone ?? "",
      c.whatsapp ?? "",
      c.cidade ?? "",
      c.uf ?? "",
      STATUS[c.status] || c.status,
      c.origem ? (ORIGEM[c.origem] || c.origem) : "",
      c.marketing ? "aceita" : "não",
      c.aniversario ?? "",
      c.cadastro ?? "",
      c.ltv.toFixed(2),
    ]),
  ];

  const nome = nomeArquivoCsv(`clientes-${new Date().toISOString().slice(0, 10)}`);
  return new Response(csvServidor(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
