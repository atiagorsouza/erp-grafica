"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/shell/MobileNav";
import { Icon } from "@/components/icons";
import { cn, formatMoney } from "@/lib/format";

type SearchHit = { type: string; icon: string; label: string; detail: string; href: string };
type Notif = {
  id: string | number;
  type: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
};

const notifTone: Record<string, string> = {
  info: "bg-proc-c-soft text-proc-c-strong",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
};

export function TopBar({ pathname }: { pathname: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  /* busca global */
  useEffect(() => {
    /* Termo curto demais: nada a buscar. O `setHits([])` era chamado
       aqui de forma síncrona e o React 19 acusa cascata de render.
       Agendar no mesmo timer do debounce resolve sem mudar o
       comportamento visível (a lista some do mesmo jeito). */
    if (q.trim().length < 2) {
      const limpar = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(limpar);
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setHits(json.results || []);
        setSearchOpen(true);
      } catch {
        setHits([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  /* notificações */
  useEffect(() => {
    if (!bellOpen) return;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j) => setNotifs(j.notifications || []))
      .catch(() => setNotifs([]));
  }, [bellOpen]);

  /* clique fora */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  /* atalho Ctrl+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unread = notifs.filter((n) => !n.readAt).length;
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <header className="no-print sticky top-0 z-20 border-b border-paper-200 bg-paper-100/85 backdrop-blur-md">
      <div className="flex h-[58px] items-center gap-3 px-4 sm:px-6">
        {/* Menu do celular: abaixo de lg a sidebar some, e sem isto não
            havia como navegar (v3.61.0). */}
        <MobileNav pathname={pathname} />

        {/* Busca global */}
        <div ref={searchRef} className="relative w-full max-w-md">
          <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400">
            <Icon name="search" size={15} />
          </div>
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q.length >= 2 && setSearchOpen(true)}
            placeholder="Buscar cliente, produto, pedido, orçamento…"
            className="focus-ring h-9.5 w-full rounded-lg border border-paper-300 bg-paper-50 pr-16 pl-9 text-[13px] transition-colors placeholder:text-ink-300 hover:border-ink-400 focus:border-proc-c"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-paper-300 bg-paper-100 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-400">
            Ctrl K
          </kbd>
          {searchOpen && q.length >= 2 && (
            <div className="animate-pop-in absolute z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-paper-200 bg-white shadow-pop">
              {hits.length === 0 ? (
                <p className="px-4 py-5 text-center text-[12px] text-ink-400">
                  Nada encontrado para “{q}”.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto p-1">
                  {hits.map((h, i) => (
                    <Link
                      key={i}
                      href={h.href}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-proc-c-soft/60"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper-100 text-sm">
                        {h.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-ink-800">
                          {h.label}
                        </span>
                        <span className="block truncate font-mono text-[10.5px] text-ink-400">{h.detail}</span>
                      </span>
                      <span className="shrink-0 rounded bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-ink-400 uppercase">
                        {h.type}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-2 hidden items-center gap-2 font-mono text-[11px] text-ink-400 md:flex">
            <Icon name="calendar" size={13} />
            <span className="uppercase">{today}</span>
          </span>

          {/* Novo */}
          <div ref={plusRef} className="relative">
            <button
              onClick={() => setPlusOpen((v) => !v)}
              className={cn(
                "focus-ring flex h-9.5 cursor-pointer items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800",
                plusOpen && "bg-ink-800"
              )}
            >
              <Icon name="plus" size={14} strokeWidth={2.2} />
              <span className="hidden sm:inline">Novo</span>
              <Icon name="chevron-down" size={12} className={cn("transition-transform", plusOpen && "rotate-180")} />
            </button>
            {plusOpen && (
              <div className="animate-pop-in absolute right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-lg border border-paper-200 bg-white p-1 shadow-pop">
                {[
                  { href: "/orcamentos?novo=1", label: "Orçamento", icon: "quote" as const },
                  { href: "/pdv", label: "Venda no PDV", icon: "receipt" as const },
                  { href: "/clientes?novo=1", label: "Cliente", icon: "users" as const },
                  { href: "/produtos?novo=1", label: "Produto", icon: "tag" as const },
                  { href: "/pedidos", label: "Pedido / OS", icon: "orders" as const },
                ].map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    onClick={() => setPlusOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-ink-700 transition-colors hover:bg-proc-c-soft/60 hover:text-ink-900"
                  >
                    <Icon name={a.icon} size={15} className="text-ink-400" />
                    {a.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Notificações */}
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="focus-ring relative flex h-9.5 w-9.5 cursor-pointer items-center justify-center rounded-lg border border-paper-300 bg-paper-50 text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              <Icon name="bell" size={16} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-proc-m px-1 font-mono text-[9px] font-semibold text-white tnum">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="animate-pop-in absolute right-0 z-40 mt-1.5 w-[380px] overflow-hidden rounded-xl border border-paper-200 bg-white shadow-pop">
                <div className="flex items-center justify-between border-b border-paper-200 bg-paper-100/60 px-4 py-2.5">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                    Central de alertas
                  </span>
                  <span className="font-mono text-[10px] text-ink-400 tnum">{unread} pendentes</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {notifs.length === 0 && (
                    <p className="px-4 py-8 text-center text-[12px] text-ink-400">
                      Tudo em ordem por aqui. 🎯
                    </p>
                  )}
                  {notifs.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href || "#"}
                      onClick={() => setBellOpen(false)}
                      className="flex items-start gap-3 border-b border-paper-200/60 px-4 py-3 transition-colors last:border-0 hover:bg-paper-100/60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          notifTone[n.type] || notifTone.info
                        )}
                      >
                        <Icon
                          name={n.type === "danger" ? "alert" : n.type === "success" ? "check" : n.type === "warning" ? "alert" : "info"}
                          size={14}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] leading-tight font-semibold text-ink-800">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">{n.body}</span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Operador */}
          <div className="ml-1 hidden h-9.5 items-center gap-2.5 rounded-lg border border-paper-300 bg-paper-50 py-1 pr-3 pl-1 sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-proc-c-strong font-mono text-[10px] font-semibold text-white">
              OP
            </span>
            <span className="text-[11.5px] leading-tight">
              <span className="block font-semibold text-ink-800">Operador</span>
              <span className="block font-mono text-[9px] tracking-wide text-ink-400 uppercase">balcão</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export { formatMoney };
