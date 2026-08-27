/**
 * Utilitário de exportação CSV (v3.72.1).
 *
 * Client-safe: não importa "server-only" nem toca banco — roda no
 * navegador para as telas que já têm todos os dados em mãos
 * (Relatórios, Financeiro). As telas paginadas no servidor (Clientes)
 * geram o arquivo numa Route Handler e usam só `nomeArquivoCsv` para
 * montar o cabeçalho; a serialização delas vive no servidor.
 *
 * Formato escolhido para o Excel brasileiro:
 *  - separador de campos ";" (o Excel pt-BR abre sem o diálogo de
 *    importação; o "," seria confundido com decimal)
 *  - BOM no começo — sem ele o Excel lê acento como lixo
 *  - tudo entre aspas, com aspas internas duplicadas (RFC 4180)
 */

const BOM = "\ufeff";
const SEP = ";";

/** Uma célula vira string segura: null/undefined → vazio. */
function celula(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Linha serializada: cada célula entre aspas, aspas escapadas. */
function linha(celulas: unknown[]): string {
  return celulas
    .map((c) => `"${celula(c).replace(/"/g, '""')}"`)
    .join(SEP);
}

/**
 * Serializa linhas heterogêneas (tabelas seguidas de linhas vazias e
 * novos blocos de cabeçalho, como no relatório gerencial).
 * Uma linha `null` ou `[]` vira linha em branco, separando seções.
 */
export function toCsv(rows: (unknown[] | null)[]): string {
  return rows
    .map((r) => (!r || r.length === 0 ? "" : linha(r)))
    .join("\n");
}

/**
 * Serializa uma tabela retangular com cabeçalho — o caso comum.
 * Números vão crus (mesma convenção do restante do sistema: "."
 * decimal, que o Excel entende como número).
 */
export function tabelaParaCsv(headers: string[], linhas: unknown[][]): string {
  return toCsv([headers, ...linhas]);
}

/**
 * Monta o CSV do lado do servidor (Route Handler). Igual ao `toCsv`,
 * só que já com o BOM — o navegador recebe o texto pronto.
 */
export function csvServidor(rows: (unknown[] | null)[]): string {
  return `${BOM}${toCsv(rows)}`;
}

/** Dispara o download no navegador, com BOM para o Excel. */
export function baixarCsv(nome: string, csv: string): void {
  const blob = new Blob([`${BOM}${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivoCsv(nome);
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Nome de arquivo padronizado: `printflow-<base>.csv`.
 * Compartilhado com o servidor para os dois lados gerarem o mesmo
 * padrão. Espaços viram traço; acento é removido para evitar header
 * Content-Disposition malformado. Quem quer data no nome (snapshot do
 * dia) a inclui no `base` — relatórios e financeiro já levam o período.
 */
export function nomeArquivoCsv(base: string): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `printflow-${limpo}.csv`;
}
