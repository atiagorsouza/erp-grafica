"use client";

/* ──────────────────────────────────────────────────────────────────
   Formulário público de cadastro — o cliente abre no celular.

   Não usa nada de `components/ui.tsx` de propósito: aqueles
   componentes assumem o layout interno (densidade, `Field` com dica
   ao lado, larguras de tabela). Esta tela é para o dedo, não para o
   mouse — campos altos, rótulo em cima, uma coluna no celular.

   Decisões da prévia aprovada:
     - nome e telefone já vêm preenchidos, destacados como confirmados
     - poucos campos: só o que o documento exige
     - CEP preenche endereço
     - PF/PJ troca o formulário
     - aviso de privacidade em português de gente
   ────────────────────────────────────────────────────────────────── */

import { useCallback, useMemo, useState } from "react";
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  isValidCEP,
  isValidDocument,
  isValidEmail,
  onlyDigits,
} from "@/lib/validators";

type Tipo = "pf" | "pj";

export interface CadastroInicial {
  type: Tipo;
  /** PF: montado de primeiro+sobrenome no envio. PJ: razão social. */
  name: string;
  /* Dois campos para PF. "Nome completo" num campo só faz muita gente
     digitar apenas o primeiro nome e seguir — e aí o cadastro fica pela metade.
     Separar obriga o sobrenome sem precisar explicar nada. */
  firstName: string;
  lastName: string;
  tradeName: string;
  document: string;
  email: string;
  phone: string;
  whatsapp: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  stateRegistration: string;
  birthDate: string;
}

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

function Campo({
  label,
  children,
  hint,
  erro,
  obrigatorio,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  erro?: string;
  obrigatorio?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-700">
        {label}
        {obrigatorio && <span className="ml-0.5 text-proc-m">*</span>}
      </span>
      {children}
      {/* Dica SEMPRE abaixo do campo. Ao lado do rótulo ela atropela o
          texto em tela estreita — foi exatamente o bug do módulo de
          prazos. */}
      {erro ? (
        <span className="mt-1 block text-[11.5px] font-medium text-red-600">{erro}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-paper-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-proc-c focus:ring-2 focus:ring-proc-c/20";
const inputOkCls =
  "w-full rounded-lg border border-cyan-300 bg-cyan-50/60 px-3.5 py-2.5 text-[15px] font-semibold text-ink-900 outline-none transition focus:border-proc-c focus:ring-2 focus:ring-proc-c/20";

export function CadastroPublicoForm({
  token,
  empresa,
  telefoneEmpresa,
  validadeDias,
  expiraEm,
  inicial,
}: {
  token: string;
  empresa: string;
  telefoneEmpresa: string;
  validadeDias: number;
  expiraEm: string;
  inicial: CadastroInicial;
}) {
  const [f, setF] = useState<CadastroInicial>(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  const pj = f.type === "pj";
  const set = (k: keyof CadastroInicial, v: string) => setF((x) => ({ ...x, [k]: v }));

  /* Nome e telefone vieram da conversa real. Marcamos como confirmados
      só enquanto o cliente não mexe — depois vira campo comum. */
  const nomeConfirmado = pj
    ? f.name === inicial.name && !!inicial.name
    : f.firstName === inicial.firstName && !!inicial.firstName;
  const foneConfirmado = f.whatsapp === inicial.whatsapp && !!inicial.whatsapp;

  const prazo = useMemo(() => {
    const d = new Date(expiraEm);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }, [expiraEm]);

  const buscarCep = useCallback(async () => {
    const digitos = onlyDigits(f.cep);
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`/api/cep/${digitos}`);
      if (!r.ok) return;
      const d = (await r.json()) as Record<string, string>;
      setF((x) => ({
        ...x,
        street: d.street || x.street,
        district: d.district || x.district,
        city: d.city || x.city,
        state: d.state || x.state,
      }));
    } catch {
      /* CEP fora do ar não pode travar o cadastro: o cliente digita. */
    } finally {
      setBuscandoCep(false);
    }
  }, [f.cep]);

  /* PF monta o nome dos dois campos; PJ usa a razão social direto. */
  const nomeCompleto = pj
    ? f.name.trim()
    : [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(" ");

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (pj) {
      if (f.name.trim().length < 3) e.name = "Informe a razão social";
    } else {
      if (f.firstName.trim().length < 2) e.firstName = "Informe seu primeiro nome";
      if (f.lastName.trim().length < 2) e.lastName = "Informe seu sobrenome";
    }

    const doc = onlyDigits(f.document);
    if (!doc) e.document = pj ? "CNPJ é obrigatório" : "CPF é obrigatório";
    else if (!isValidDocument(f.document, f.type)) e.document = pj ? "CNPJ inválido" : "CPF inválido";

    if (f.email.trim() && !isValidEmail(f.email)) e.email = "E-mail inválido";
    if (onlyDigits(f.whatsapp).length < 10) e.whatsapp = "Informe um telefone com DDD";
    if (f.cep.trim() && !isValidCEP(f.cep)) e.cep = "CEP inválido";
    if (f.cep.trim() && !f.number.trim()) e.number = "Informe o número";

    setErros(e);
    if (Object.keys(e).length) {
      const primeiro = document.querySelector<HTMLElement>("[data-erro='1']");
      primeiro?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  async function enviar() {
    setFalha("");
    if (!validar()) return;
    setEnviando(true);
    const { firstName: _fn, lastName: _ln, ...semNomeSeparado } = f;
    try {
      const r = await fetch(`/api/cadastro/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        /* `firstName`/`lastName` são só da tela: o cadastro guarda
           um `name` só. A rota pública ignora chave desconhecida,
           mas mandar lixo é pedir confusão futura. */
        body: JSON.stringify({ ...semNomeSeparado, name: nomeCompleto }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; campo?: string };
      if (!r.ok) {
        if (d.campo) setErros((x) => ({ ...x, [d.campo as string]: d.error || "Confira este campo" }));
        setFalha(d.error || "Não conseguimos salvar agora. Tente de novo em instantes.");
        return;
      }
      setPronto(true);
    } catch {
      setFalha("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper-100 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-paper-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="mt-5 text-[21px] font-bold text-ink-900">Cadastro concluído!</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
            Obrigado, {(pj ? f.name : f.firstName).trim().split(/\s+/)[0]}. Já está tudo certo para emitirmos seu
            orçamento e seus documentos.
          </p>
          <p className="mt-4 text-[13px] text-ink-400">
            Pode voltar para a conversa no WhatsApp
            {telefoneEmpresa ? ` com ${empresa}` : ""} — seguimos por lá.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="rounded-t-2xl bg-ink-900 px-6 py-5 text-paper-50">
          <p className="text-[17px] font-bold tracking-tight">{empresa}</p>
          <p className="mt-0.5 text-[13px] text-ink-300">Complete seu cadastro</p>
        </header>

        <div className="rounded-b-2xl border border-t-0 border-paper-200 bg-white px-6 py-6 shadow-card">
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-500">
            Leva 1 minuto. Pedimos só o essencial.
            {prazo && <> Este link vale até <strong className="text-ink-800">{prazo}</strong> ({validadeDias} dias).</>}
          </p>

          {/* Tipo — muda o formulário inteiro */}
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-paper-100 p-1">
            {([["pf", "Pessoa física"], ["pj", "Empresa"]] as const).map(([v, rot]) => (
              <button
                key={v}
                type="button"
                onClick={() => setF((x) => ({ ...x, type: v }))}
                className={`rounded-lg py-2.5 text-[13.5px] font-semibold transition ${
                  f.type === v ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
                }`}
              >
                {rot}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* PJ tem razão social num campo só (é como está na
                Receita). PF tem dois campos: nome completo num campo
                só faz muita gente digitar apenas o primeiro nome. */}
            {pj ? (
              <div data-erro={erros.name ? "1" : undefined}>
                <Campo label="Razão social" obrigatorio erro={erros.name}>
                  <input
                    className={inputCls}
                    value={f.name}
                    autoComplete="organization"
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Nome na Receita Federal"
                  />
                </Campo>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div data-erro={erros.firstName ? "1" : undefined}>
                  <Campo
                    label="Primeiro nome"
                    obrigatorio
                    erro={erros.firstName}
                    hint={
                      nomeConfirmado && !erros.firstName
                        ? "✓ veio da conversa"
                        : undefined
                    }
                  >
                    <input
                      className={nomeConfirmado ? inputOkCls : inputCls}
                      value={f.firstName}
                      autoComplete="given-name"
                      onChange={(e) => set("firstName", e.target.value)}
                      placeholder="Tiago"
                    />
                  </Campo>
                </div>
                <div data-erro={erros.lastName ? "1" : undefined}>
                  <Campo label="Sobrenome" obrigatorio erro={erros.lastName}>
                    <input
                      className={inputCls}
                      value={f.lastName}
                      autoComplete="family-name"
                      onChange={(e) => set("lastName", e.target.value)}
                      placeholder="Souza"
                    />
                  </Campo>
                </div>
              </div>
            )}

            {pj && (
              <Campo label="Nome fantasia" hint="como a empresa é conhecida">
                <input className={inputCls} value={f.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
              </Campo>
            )}

            <div data-erro={erros.document ? "1" : undefined}>
              <Campo
                label={pj ? "CNPJ" : "CPF"}
                obrigatorio
                erro={erros.document}
                hint="para emitir seus documentos"
              >
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={f.document}
                  onChange={(e) => set("document", pj ? formatCNPJ(e.target.value) : formatCPF(e.target.value))}
                  placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
                />
              </Campo>
            </div>

            {pj && (
              <Campo label="Inscrição estadual" hint="se não tiver, escreva ISENTO">
                <input
                  className={inputCls}
                  value={f.stateRegistration}
                  onChange={(e) => set("stateRegistration", e.target.value)}
                />
              </Campo>
            )}

            {!pj && (
              <Campo label="Data de nascimento" hint="opcional — usamos para o desconto de aniversário">
                <input
                  className={inputCls}
                  type="date"
                  value={f.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Campo>
            )}

            <div data-erro={erros.whatsapp ? "1" : undefined}>
              <Campo
                label="WhatsApp"
                obrigatorio
                erro={erros.whatsapp}
                hint={foneConfirmado && !erros.whatsapp ? "✓ confirmado pela conversa" : undefined}
              >
                <input
                  className={foneConfirmado ? inputOkCls : inputCls}
                  inputMode="tel"
                  autoComplete="tel"
                  value={f.whatsapp}
                  onChange={(e) => set("whatsapp", formatPhone(e.target.value))}
                  placeholder="(21) 99999-9999"
                />
              </Campo>
            </div>

            <div data-erro={erros.email ? "1" : undefined}>
              <Campo label="E-mail" erro={erros.email} hint="para receber seu orçamento">
                <input
                  className={inputCls}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={f.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="seu@email.com"
                />
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div data-erro={erros.cep ? "1" : undefined}>
                <Campo
                  label="CEP"
                  erro={erros.cep}
                  hint={buscandoCep ? "buscando…" : "preenche o resto"}
                >
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={f.cep}
                    onChange={(e) => set("cep", formatCEP(e.target.value))}
                    onBlur={buscarCep}
                    placeholder="00000-000"
                  />
                </Campo>
              </div>
              <div data-erro={erros.number ? "1" : undefined}>
                <Campo label="Número" erro={erros.number}>
                  <input
                    className={inputCls}
                    value={f.number}
                    onChange={(e) => set("number", e.target.value)}
                    placeholder="nº"
                  />
                </Campo>
              </div>
            </div>

            <Campo label="Endereço">
              <input className={inputCls} value={f.street} onChange={(e) => set("street", e.target.value)} placeholder="rua, avenida…" />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Complemento">
                <input className={inputCls} value={f.complement} onChange={(e) => set("complement", e.target.value)} placeholder="apto, sala…" />
              </Campo>
              <Campo label="Bairro">
                <input className={inputCls} value={f.district} onChange={(e) => set("district", e.target.value)} />
              </Campo>
            </div>

            <div className="grid grid-cols-[1fr_92px] gap-3">
              <Campo label="Cidade">
                <input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} />
              </Campo>
              <Campo label="UF">
                <select
                  className={`${inputCls} appearance-none`}
                  value={f.state}
                  onChange={(e) => set("state", e.target.value)}
                >
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>

          {falha && (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
              {falha}
            </p>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="mt-6 w-full rounded-xl bg-ink-900 py-3.5 text-[15px] font-semibold text-white transition hover:bg-ink-800 disabled:opacity-60"
          >
            {enviando ? "Salvando…" : "Concluir cadastro"}
          </button>

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400">
            Seus dados são usados só para emitir seus documentos e falar sobre seus
            pedidos. Não compartilhamos com ninguém e você pode pedir correção ou exclusão
            quando quiser{telefoneEmpresa ? `, pelo ${telefoneEmpresa}` : ""}.
          </p>
        </div>
      </div>
    </main>
  );
}
