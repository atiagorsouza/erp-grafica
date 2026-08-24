"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import controlPanelConfig from "../../../config/control-panel-settings.json";
import { mutate } from "@/lib/mutate";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, toast } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { LogoUpload } from "@/components/LogoUpload";
import { cn } from "@/lib/format";

type Row = {
  id: number | string;
  key: string;
  value: string | null;
  category?: string | null;
};

type FieldDef = {
  key: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  type?: "text" | "number" | "select" | "textarea" | "toggle" | "logo" | "password";
  options?: { value: string; label: string }[];
  suffix?: string;
  span2?: boolean;
  mono?: boolean;
  /** máscara aplicada enquanto digita; o banco guarda só os dígitos */
  mask?: "documento" | "telefone" | "cep" | "pix";
  /** "endereco": ao completar o CEP, busca e preenche rua/bairro/cidade/UF */
  autofill?: string;
};

type Group = {
  id: string;
  title: string;
  desc: string;
  icon: IconName;
  color: string;
  fields: FieldDef[];
};

const GROUPS = controlPanelConfig.groups as Group[];
const CANONICAL_KEYS = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));

/* As logos NÃO passam por este formulário.

   A página serve "__SET__" no lugar do base64 (senão o HTML vai a
   12 MB — bug v3.53.1). Quem grava a imagem é /api/upload/logo, na
   hora do upload. Se o "Salvar alterações" tratasse esses campos como
   texto comum, escreveria a string "__SET__" por cima da logo real e
   ela sumiria dos documentos. */
const CHAVES_LOGO = new Set(["company_logo", "company_logo_dark", "company_logo_icon"]);

/* Segredos: a API devolve "__SET__" no lugar do valor real (v3.63.0).
   Se esse marcador voltasse num save, gravaria a string por cima da
   senha e ela sumiria — por isso os campos em branco ou com o marcador
   são pulados na hora de salvar. Quem quer trocar, digita a nova. */
const MARCADOR_SEGREDO = "__SET__";

const categoryOf = (key: string): string => {
  const group = GROUPS.find((g) => g.fields.some((f) => f.key === key));
  return group?.id || "geral";
};

const defaultOf = (key: string): string => {
  for (const group of GROUPS) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return String(field.defaultValue ?? "");
  }
  return "";
};

/* MÁSCARAS DO PAINEL (v3.60.0)

   O dono digita como preferir; a máscara é aplicada enquanto ele
   escreve. O que vai para o banco é o texto mascarado, e o
   `settings.ts` normaliza na leitura — então cadastro antigo, com ou
   sem pontuação, continua válido.

   Antes nenhum dos 25 campos da empresa tinha máscara: o CNPJ e os
   telefones saíam crus no cupom impresso ("2120383504"). */
function aplicarMascara(valor: string, mask?: FieldDef["mask"]): string {
  if (!mask) return valor;
  const d = valor.replace(/\D/g, "");

  if (mask === "telefone") {
    const n = d.slice(0, 11);
    if (n.length <= 2) return n;
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }

  if (mask === "cep") {
    const n = d.slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  }

  if (mask === "documento") {
    const n = d.slice(0, 14);
    /* Até 11 dígitos ainda pode virar CPF ou CNPJ. Pontuar como CPF
       desde o 4º dígito fazia "30189" (começo do CNPJ) aparecer como
       "301.89" na tela — confuso para quem digita. Só pontuamos
       quando o CPF está completo, ou quando já passou de 11 dígitos e
       portanto só pode ser CNPJ. */
    if (n.length > 3 && n.length < 11) {
      /* zona ambígua: mostra sem pontuação */
      return n;
    }
    if (n.length <= 11) {
      /* CPF */
      return n
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
    }
    /* CNPJ */
    return n
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }

  /* PIX aceita CPF, CNPJ, e-mail, telefone ou chave aleatória. Só
     mascaramos quando é claramente um documento — mascarar e-mail ou
     chave aleatória estragaria a chave. */
  if (mask === "pix") {
    const soDigitos = valor.trim() !== "" && /^[\d.\-/()\s]+$/.test(valor);
    if (!soDigitos) return valor;
    if (d.length === 11 || d.length === 14) return aplicarMascara(valor, "documento");
    return valor;
  }

  return valor;
}

/* Campo de senha do Painel.

   O valor guardado NUNCA chega ao navegador — a API devolve só o
   marcador. Por isso o comportamento é: em branco = manter a atual;
   digitou = substituir. O olhinho revela o que está sendo digitado
   agora, não o que está salvo (que ninguém aqui conhece). */
function CampoSenha({
  guardada,
  value,
  onChange,
}: {
  guardada: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          type={visivel ? "text" : "password"}
          value={value}
          autoComplete="new-password"
          placeholder={guardada ? "••••••••  (guardada)" : "Digite a senha"}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Esconder" : "Mostrar"}
          className="focus-ring absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-ink-400 hover:text-ink-700"
        >
          <Icon name="eye" size={15} />
        </button>
      </div>
      {guardada && value === "" && (
        <p className="text-[11px] text-ink-400">
          Já existe uma senha guardada. Deixe em branco para mantê-la.
        </p>
      )}
    </div>
  );
}

export function SettingsClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [buscandoCep, setBuscandoCep] = useState(false);

  const rowsByKey = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of rows) map.set(String(r.key), r);
    return map;
  }, [rows]);

  const initial = useMemo(() => {
    const data: Record<string, string> = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const row = rowsByKey.get(field.key);
        /* Senha começa SEMPRE vazia: o valor real nunca vem do
           servidor, e mostrar o marcador no campo faria o operador
           pensar que a senha tem 7 caracteres. Vazio = manter. */
        if (field.type === "password") {
          data[field.key] = "";
          continue;
        }
        data[field.key] = row ? String(row.value ?? "") : String(field.defaultValue ?? "");
      }
    }
    return data;
  }, [rowsByKey]);

  const [form, setForm] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);

  /* Teste de e-mail: fala com o servidor de verdade, então pode
     demorar alguns segundos. O resultado fica na tela — nada de
     toast que some antes de o operador ler o motivo da falha. */
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<
    null | { ok: boolean; texto: string }
  >(null);

  async function testarEmail() {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const r = await fetch("/api/email/testar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ para: form.smtp_test_to || "" }),
      });
      const d = await r.json();
      setResultadoTeste(
        r.ok
          ? { ok: true, texto: d.mensagem || "E-mail enviado." }
          : { ok: false, texto: d.error || "Não foi possível enviar." }
      );
    } catch {
      setResultadoTeste({ ok: false, texto: "Não consegui falar com o servidor do sistema." });
    } finally {
      setTestando(false);
    }
  }
  const [active, setActive] = useState(GROUPS[0]?.id || "empresa");

  const ehSegredo = useCallback(
    (key: string) => GROUPS.some((g) => g.fields.some((f) => f.key === key && f.type === "password")),
    []
  );

  const dirty = Object.entries(form).filter(([key, value]) => {
    if (!CANONICAL_KEYS.has(key)) return false;
    if (CHAVES_LOGO.has(key)) return false;
    /* Senha intocada (vazia ou ainda com o marcador) não conta como
       alteração pendente. */
    if (ehSegredo(key) && (value === "" || value === MARCADOR_SEGREDO)) return false;
    const row = rowsByKey.get(key);
    const original = row ? String(row.value ?? "") : defaultOf(key);
    return original !== value;
  }).length;

  /* Busca o endereço pelo CEP e preenche rua/bairro/cidade/UF.

     Usa a mesma rota que o cadastro de cliente no PDV (/api/cep/:cep)
     — não vale ter dois caminhos para a mesma coisa. Só dispara com 8
     dígitos, e nunca sobrescreve o número/complemento, que o ViaCEP
     não conhece. */
  async function buscarCep(valor: string) {
    const limpo = String(valor || "").replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`/api/cep/${limpo}`);
      if (!r.ok) return;
      const d = (await r.json()) as {
        street?: string; district?: string; city?: string; state?: string;
      };
      setForm((x) => ({
        ...x,
        company_street: d.street || x.company_street || "",
        company_district: d.district || x.company_district || "",
        company_city: d.city || x.company_city || "",
        company_state: d.state || x.company_state || "",
      }));
    } catch {
      /* CEP inexistente ou sem internet: o dono digita à mão */
    } finally {
      setBuscandoCep(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(form)) {
        if (!CANONICAL_KEYS.has(key)) continue;
        /* Gravadas pelo upload, nunca por aqui. */
        if (CHAVES_LOGO.has(key)) continue;
        /* Senha em branco = manter a atual. Nunca enviar o marcador. */
        if (ehSegredo(key) && (value === "" || value === MARCADOR_SEGREDO)) continue;
        const existing = rowsByKey.get(key);
        const original = existing ? String(existing.value ?? "") : defaultOf(key);
        if (original === value) continue;

        if (existing) {
          await mutate("settings", "update", { key, value, category: categoryOf(key) }, Number(existing.id));
        } else {
          await mutate("settings", "create", { key, value, category: categoryOf(key) });
        }
      }
      toast.success("Configurações salvas", "Os módulos já usam os novos parâmetros.");
      router.refresh();
    } catch (e) {
      toast.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const group = GROUPS.find((g) => g.id === active) || GROUPS[0];

  return (
    <div>
      <PageHeader
        eyebrow="Parâmetros do sistema"
        title="Painel de Controle"
        icon="gear"
        description="Empresa, motor de precificação, PDV, orçamentos, pedidos, Kanban, CRM, calendário e fiscal. Tudo em um lugar, organizado por módulo."
        actions={
          <Button icon="check" onClick={save} loading={saving} disabled={dirty === 0}>
            Salvar alterações{dirty > 0 ? ` · ${dirty}` : ""}
          </Button>
        }
      />

      <div className="reveal grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
          {GROUPS.map((g) => {
            const changedCount = g.fields.filter((f) => {
              /* Senha em branco = manter a atual, não é alteração. Sem
                 esta exceção o menu marcava "1 alterado" só por abrir a
                 aba, e o botão de teste ficava travado. */
              if (f.type === "password") {
                const v = form[f.key] ?? "";
                return v !== "" && v !== MARCADOR_SEGREDO;
              }
              const row = rowsByKey.get(f.key);
              const orig = row ? String(row.value ?? "") : String(f.defaultValue ?? "");
              return form[f.key] !== undefined && form[f.key] !== orig;
            }).length;
            return (
              <button
                key={g.id}
                onClick={() => setActive(g.id)}
                className={cn(
                  "focus-ring flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-all",
                  active === g.id
                    ? "border-ink-900 bg-ink-900 text-white shadow-pop"
                    : "border-paper-200 bg-paper-50 text-ink-600 hover:border-ink-300"
                )}
              >
                <Icon
                  name={g.icon}
                  size={15}
                  className={active === g.id ? "text-cyan-300" : `${g.color} opacity-70`}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{g.title}</span>
                {changedCount > 0 && (
                  <Badge tone="amber" className="shrink-0">{changedCount}</Badge>
                )}
              </button>
            );
          })}
        </nav>

        <Card className="reveal reveal-1">
          <div className="mb-5 border-b border-dashed border-paper-300 pb-4">
            <div className="flex items-center gap-2.5">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-100", group.color)}>
                <Icon name={group.icon} size={18} />
              </span>
              <div>
                <h3 className="display-expanded text-[16px] font-bold text-ink-900">{group.title}</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">{group.desc}</p>
              </div>
            </div>
          </div>

          {group.fields.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              Nenhum campo configurado para esta seção. Rode <code>bash scripts/update.sh</code> para reparar o painel.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.fields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  className={f.span2 ? "sm:col-span-2" : ""}
                >
                  {f.type === "logo" ? (
                    <LogoUpload
                      chave={f.key}
                      valor={form[f.key] ?? ""}
                      escura={f.key.includes("dark")}
                      onChange={(uri) => setForm((x) => ({ ...x, [f.key]: uri }))}
                    />
                  ) : f.type === "select" ? (
                    <Select
                      value={form[f.key] ?? String(f.defaultValue ?? "")}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    >
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  ) : f.type === "password" ? (
                    /* O valor real nunca chega aqui: a API manda
                       "__SET__" quando existe algo guardado. Em branco
                       significa "manter". */
                    <CampoSenha
                      guardada={(rowsByKey.get(f.key)?.value ?? "") === MARCADOR_SEGREDO}
                      value={form[f.key] === MARCADOR_SEGREDO ? "" : (form[f.key] ?? "")}
                      onChange={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
                    />
                  ) : f.type === "textarea" ? (
                    <Textarea
                      value={form[f.key] ?? String(f.defaultValue ?? "")}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <div className="relative">
                      <Input
                        mono={f.mono || f.type === "number"}
                        type={f.type === "number" ? "number" : "text"}
                        value={form[f.key] ?? String(f.defaultValue ?? "")}
                        onChange={(e) => {
                          const bruto = e.target.value;
                          const valor = aplicarMascara(bruto, f.mask);
                          setForm((x) => ({ ...x, [f.key]: valor }));
                          if (f.autofill === "endereco") void buscarCep(valor);
                        }}
                        className={f.suffix ? "pr-9" : ""}
                      />
                      {f.autofill === "endereco" && buscandoCep && (
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-ink-400">
                          buscando…
                        </span>
                      )}
                      {f.suffix && (
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-ink-400">
                          {f.suffix}
                        </span>
                      )}
                    </div>
                  )}
                </Field>
              ))}
            </div>
          )}

          {active === "tributacao" && (
            <div className="mt-5 rounded-lg bg-proc-c-soft px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-proc-c-strong">
                <Icon name="info" size={14} className="shrink-0" />
                Exemplo: venda de R$ 100 com imposto {form.tax_rate || "6"}% e débito {form.card_fee_debit || "1.99"}% — o motor mantém os cálculos consistentes no PDV e nos relatórios.
              </p>
            </div>
          )}

          {active === "pdv" && (
            <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-emerald-800">
                <Icon name="info" size={14} className="shrink-0" />
                As taxas de maquininha ficam em <strong>Precificação & taxas</strong>. O vendedor digitado no PDV pode ficar salvo no navegador do operador.
              </p>
            </div>
          )}

          {active === "email" && (
            <div className="mt-5 space-y-3">
              <div className="rounded-lg bg-paper-100 px-4 py-3">
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-600">
                  <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                  <span>
                    A senha é a da <strong>caixa de e-mail</strong> (criada no
                    painel da Hostinger), não a do painel em si. Salve as
                    alterações antes de testar.
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  icon="mail"
                  disabled={testando || dirty > 0}
                  onClick={() => void testarEmail()}
                >
                  {testando ? "Enviando…" : "Enviar e-mail de teste"}
                </Button>
                {dirty > 0 && (
                  <span className="text-[11.5px] text-ink-500">
                    Salve as alterações para testar com os valores novos.
                  </span>
                )}
              </div>

              {resultadoTeste && (
                <div
                  className={cn(
                    "rounded-lg px-4 py-3 text-[12px] leading-relaxed",
                    resultadoTeste.ok
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-red-50 text-red-800"
                  )}
                >
                  <p className="flex items-start gap-2">
                    <Icon
                      name={resultadoTeste.ok ? "check" : "alert"}
                      size={14}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{resultadoTeste.texto}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {active === "fiscal" && (
            <div className="mt-5 rounded-lg bg-paper-100 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] leading-relaxed text-ink-600">
                <Icon name="info" size={14} className="shrink-0" />
                A emissão real de NF-e / NFC-e / NFS-e depende de integrador externo e certificado digital A1 ou A3.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
