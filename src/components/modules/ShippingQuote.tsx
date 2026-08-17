"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";
import { formatMoney } from "@/lib/pricing";

/* ====================================================================
 *  Cotação de frete — componente compartilhado
 *
 *  Usado em Orçamentos, Pedidos/OS e PDV para que os três falem a
 *  mesma língua. Devolve o valor escolhido via `onSelect`, que o
 *  módulo grava em `shippingFee`.
 * ==================================================================== */

export type QuoteOption = {
  serviceId: number;
  name: string;
  carrier: string;
  price: number;
  discount: number;
  deliveryMin: number;
  deliveryMax: number;
  deliveryLabel: string;
  error: string | null;
};

export type QuoteItem = { productId?: number | null; quantity: number };

const maskCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export function ShippingQuote({
  cep: initialCep = "",
  items = [],
  declaredValue = 0,
  selectedServiceId,
  onSelect,
  compact,
  autoQuote,
}: {
  cep?: string;
  items?: QuoteItem[];
  declaredValue?: number;
  selectedServiceId?: number | null;
  onSelect: (option: QuoteOption | null) => void;
  compact?: boolean;
  autoQuote?: boolean;
}) {
  const [cep, setCep] = useState(maskCep(initialCep));
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  /* Sincroniza com o CEP que vem de fora (troca de cliente) SEM efeito:
     setState dentro de useEffect dispara render em cascata e o React 19
     sinaliza como erro. O padrão recomendado é ajustar durante o render. */
  const [lastExternalCep, setLastExternalCep] = useState(initialCep);
  if (initialCep !== lastExternalCep) {
    setLastExternalCep(initialCep);
    setCep(maskCep(initialCep));
    setOptions([]);
    setError(null);
  }

  /* controla a cotação automática — lido apenas dentro do efeito */
  const autoQuotedFor = useRef<string | null>(null);

  const quote = useCallback(
    async (rawCep: string) => {
      const clean = rawCep.replace(/\D/g, "");
      if (clean.length !== 8) {
        setError("Informe um CEP com 8 dígitos");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "quote",
            cepDestination: clean,
            items,
            insuranceValue: declaredValue > 0 ? declaredValue : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setOptions([]);
          setError(json.error || "Não foi possível cotar o frete");
          return;
        }
        setOptions(json.options || []);
        setFallback(Boolean(json.package?.usedFallback));
        if ((json.options || []).every((o: QuoteOption) => o.error)) {
          setError("Nenhum serviço disponível para este CEP");
        }
      } catch {
        setError("Falha de conexão ao cotar o frete");
      } finally {
        setLoading(false);
      }
    },
    [items, declaredValue]
  );

  /* Cota sozinho quando o CEP já vem pronto do cadastro do cliente.
     O efeito aqui é legítimo: dispara uma chamada de rede (sistema
     externo), não sincroniza estado. A ref garante uma cotação por CEP. */
  const cleanInitial = initialCep.replace(/\D/g, "");
  useEffect(() => {
    if (!autoQuote || cleanInitial.length !== 8) return;
    if (autoQuotedFor.current === cleanInitial) return;
    autoQuotedFor.current = cleanInitial;
    quote(cleanInitial);
  }, [autoQuote, cleanInitial, quote]);

  const valid = options.filter((o) => !o.error && o.price > 0);
  const cheapestId = valid.slice().sort((a, b) => a.price - b.price)[0]?.serviceId;

  return (
    <div className={cn("rounded-xl border border-paper-200 bg-paper-50 p-3", compact && "p-2.5")}>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name="truck" size={14} />
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-600 uppercase">
          Frete SuperFrete
        </span>
        {fallback && valid.length > 0 && (
          <span
            title="Algum item não tem peso cadastrado — usando o pacote padrão do Painel de Controle"
            className="ml-auto font-mono text-[9px] text-yellow-700 uppercase"
          >
            pacote padrão
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">CEP destino</span>
          <Input
            mono
            className="w-[130px]"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(maskCep(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                quote(cep);
              }
            }}
          />
        </label>
        <Button size="sm" variant="outline" icon="search" loading={loading} onClick={() => quote(cep)}>
          Cotar
        </Button>
        {valid.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              toast.info("Frete removido");
            }}
            className="ml-auto font-mono text-[10px] text-ink-400 uppercase transition hover:text-ink-700"
          >
            limpar
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-red-600">{error}</p>}

      {valid.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {valid.map((o) => {
            const active = selectedServiceId === o.serviceId;
            return (
              <button
                key={o.serviceId}
                type="button"
                onClick={() => onSelect(o)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
                  active
                    ? "border-ink-900 bg-ink-900 text-paper-50"
                    : "border-paper-200 bg-white hover:border-ink-300"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    active ? "border-paper-50 bg-paper-50" : "border-paper-300"
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-ink-900" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold">{o.name}</span>
                    {o.serviceId === cheapestId && (
                      <span
                        className={cn(
                          "rounded px-1 py-px font-mono text-[8.5px] uppercase",
                          active ? "bg-paper-50/20 text-paper-50" : "bg-emerald-50 text-emerald-700"
                        )}
                      >
                        + barato
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "block font-mono text-[10px] uppercase",
                      active ? "text-paper-50/70" : "text-ink-400"
                    )}
                  >
                    {o.carrier} · {o.deliveryLabel}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[13px] font-semibold tnum">
                    {formatMoney(o.price)}
                  </span>
                  {o.discount > 0 && (
                    <span
                      className={cn(
                        "block font-mono text-[9px]",
                        active ? "text-paper-50/60" : "text-emerald-600"
                      )}
                    >
                      −{formatMoney(o.discount)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
