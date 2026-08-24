/**
 * Validação de cadastro compartilhada entre as telas.
 *
 * Antes desta camada cada formulário resolvia (ou não) por conta
 * própria: o cadastro público validava CPF, e-mail e CEP; fornecedor,
 * vendedor e o cadastro rápido do PDV não validavam nada e aceitavam
 * "abc" como telefone. O resultado aparecia depois, na hora de emitir
 * documento ou mandar mensagem, quando o dado errado já estava gravado.
 *
 * Aqui ficam só as regras. Quem mostra o erro é a tela — cada uma
 * decide se pinta o campo, rola até ele ou bloqueia o salvamento.
 *
 * Campo vazio é tratado como "não informado", nunca como inválido: só
 * o que é obrigatório vira erro em branco, e isso quem diz é a tela.
 * A exceção é o que o dono deixou explícito: cadastro nasce incompleto
 * e vai sendo completado com o tempo.
 */

import {
  isValidCEP,
  isValidCNPJ,
  isValidCPF,
  isValidEmail,
  onlyDigits,
} from "@/lib/validators";

export type ErrosCadastro = Record<string, string>;

/** Telefone brasileiro: 10 dígitos (fixo) ou 11 (celular com o 9). */
export function validaTelefone(raw?: string | null): string | null {
  const d = onlyDigits(String(raw || ""));
  if (!d) return null;
  if (d.length < 10) return "Telefone incompleto — faltam dígitos";
  if (d.length > 11) return "Telefone com dígitos demais";
  /* DDD brasileiro começa em 11. "01" ou "00" é digitação errada. */
  if (Number(d.slice(0, 2)) < 11) return "DDD inválido";
  /* Celular tem 11 dígitos e o nono sempre é 9. */
  if (d.length === 11 && d[2] !== "9") return "Celular deve começar com 9 após o DDD";
  return null;
}

export function validaEmail(raw?: string | null): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  return isValidEmail(v) ? null : "E-mail inválido";
}

export function validaCEP(raw?: string | null): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  return isValidCEP(v) ? null : "CEP deve ter 8 dígitos";
}

/**
 * CPF ou CNPJ conforme o tipo. Quando `tipo` não vem, decide pelo
 * tamanho — é o caso do cadastro rápido do PDV, onde o operador digita
 * um documento só e não escolhe pessoa física ou jurídica.
 */
export function validaDocumento(raw?: string | null, tipo?: "pf" | "pj"): string | null {
  const d = onlyDigits(String(raw || ""));
  if (!d) return null;
  if (tipo === "pf") return isValidCPF(d) ? null : "CPF inválido";
  if (tipo === "pj") return isValidCNPJ(d) ? null : "CNPJ inválido";
  if (d.length === 11) return isValidCPF(d) ? null : "CPF inválido";
  if (d.length === 14) return isValidCNPJ(d) ? null : "CNPJ inválido";
  return "Documento deve ter 11 dígitos (CPF) ou 14 (CNPJ)";
}

/** UF precisa existir. "RG" no lugar de "RJ" passava direto. */
export function validaUF(raw?: string | null): string | null {
  const v = String(raw || "").trim().toUpperCase();
  if (!v) return null;
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
  return UFS.includes(v) ? null : "UF inválida";
}

/** Site: aceita com ou sem http, exige ao menos um ponto no domínio. */
export function validaSite(raw?: string | null): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const semProtocolo = v.replace(/^https?:\/\//i, "");
  if (!/^[^\s./]+(\.[^\s./]+)+(\/.*)?$/.test(semProtocolo)) return "Endereço de site inválido";
  return null;
}

/**
 * Fornecedor. Razão social é o único campo obrigatório: o dono cadastra
 * fornecedor no meio de uma compra e nem sempre tem o CNPJ à mão.
 */
export function validaFornecedor(f: Record<string, unknown>): ErrosCadastro {
  const e: ErrosCadastro = {};
  const txt = (k: string) => String(f[k] ?? "").trim();

  if (!txt("name")) e.name = "Informe a razão social";
  const doc = validaDocumento(txt("document"), "pj");
  if (doc) e.document = doc;
  const email = validaEmail(txt("email"));
  if (email) e.email = email;
  const fone = validaTelefone(txt("phone"));
  if (fone) e.phone = fone;
  const zap = validaTelefone(txt("whatsapp"));
  if (zap) e.whatsapp = zap;
  const cep = validaCEP(txt("cep"));
  if (cep) e.cep = cep;
  const uf = validaUF(txt("state"));
  if (uf) e.state = uf;
  const site = validaSite(txt("website"));
  if (site) e.website = site;

  const lead = txt("leadTimeDays");
  if (lead && (!/^\d+$/.test(lead) || Number(lead) > 365)) {
    e.leadTimeDays = "Prazo em dias, de 0 a 365";
  }
  return e;
}

/** Vendedor. Só o nome é obrigatório; comissão tem teto de sanidade. */
export function validaVendedor(f: Record<string, unknown>): ErrosCadastro {
  const e: ErrosCadastro = {};
  const txt = (k: string) => String(f[k] ?? "").trim();

  if (!txt("name")) e.name = "Informe o nome do vendedor";
  const doc = validaDocumento(txt("document"), "pf");
  if (doc) e.document = doc;
  const email = validaEmail(txt("email"));
  if (email) e.email = email;
  const fone = validaTelefone(txt("phone"));
  if (fone) e.phone = fone;

  const com = txt("commissionRate").replace(",", ".");
  if (com) {
    const n = Number(com);
    if (!Number.isFinite(n) || n < 0) e.commissionRate = "Percentual inválido";
    else if (n > 100) e.commissionRate = "Comissão não pode passar de 100%";
  }
  return e;
}

/** Cadastro rápido do PDV: nome obrigatório, o resto é opcional. */
export function validaClienteRapido(f: Record<string, unknown>): ErrosCadastro {
  const e: ErrosCadastro = {};
  const txt = (k: string) => String(f[k] ?? "").trim();

  if (!txt("name")) e.name = "Informe o nome do cliente";
  const doc = validaDocumento(txt("document"));
  if (doc) e.document = doc;
  const fone = validaTelefone(txt("phone"));
  if (fone) e.phone = fone;
  const email = validaEmail(txt("email"));
  if (email) e.email = email;
  const cep = validaCEP(txt("cep"));
  if (cep) e.cep = cep;
  const uf = validaUF(txt("state"));
  if (uf) e.state = uf;
  return e;
}

/**
 * CPF/CNPJ é obrigatório para todo cliente — sem ele não sai documento.
 *
 * A exceção de boa-fé: o cliente que aparece no balcão sem o documento
 * na mão não pode travar a venda. Quem dispensa escreve o motivo, e o
 * motivo fica gravado na ficha. Trava sem escape vira operador
 * inventando "000.000.000-00", que é pior que o campo vazio.
 */
export function validaDocumentoObrigatorio(
  raw: string | null | undefined,
  tipo: "pf" | "pj",
  dispensa?: string | null
): string | null {
  const d = onlyDigits(String(raw || ""));
  if (!d) {
    if (String(dispensa || "").trim().length >= 3) return null;
    return tipo === "pj"
      ? "CNPJ é obrigatório — ou registre o motivo da dispensa"
      : "CPF é obrigatório — ou registre o motivo da dispensa";
  }
  return validaDocumento(d, tipo);
}

/** true quando não há nenhum erro. Açúcar para deixar a tela legível. */
export function semErros(e: ErrosCadastro): boolean {
  return Object.keys(e).length === 0;
}

/**
 * Rola até o primeiro campo com erro. Em formulário longo (fornecedor
 * tem 18 campos) o erro pode estar fora da tela e o operador só vê o
 * botão "Salvar" não funcionando.
 */
export function focarPrimeiroErro(): void {
  if (typeof document === "undefined") return;
  const alvo = document.querySelector<HTMLElement>("[data-erro='1']");
  alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
}
