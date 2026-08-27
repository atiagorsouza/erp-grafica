"use client";

/* ──────────────────────────────────────────────────────────────────
   MENU DO CELULAR (v3.61.0)

   Até aqui o sistema simplesmente NÃO TINHA menu no celular. A
   `Sidebar` é `hidden … lg:flex`, ou seja, some abaixo de 1024px; e o
   `MobileSidebarOverlay` que existia no projeto nunca foi montado em
   lugar nenhum — era código morto. Na prática, no celular só dava para
   navegar pelo que estivesse na tela: sem Estoque, sem Clientes, sem
   Configurações. O dono descobriu isso usando o sistema no telefone.

   Aquele componente antigo também gravava a função de abrir numa
   variável global (`window.__toggleMobileSidebar`) DURANTE a
   renderização. Além de não funcionar de forma confiável, escrever em
   `window` no meio do render quebra com renderização concorrente do
   React. Aqui o estado é local e o botão vive junto da gaveta.
   ────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { NAV } from "@/components/shell/nav";

export function MobileNav({ pathname }: { pathname: string }) {
  const groups = NAV;
  const [aberto, setAberto] = useState(false);

  /* Trocou de tela? Fecha. Sem isso a gaveta continua aberta por cima
     do conteúdo depois do clique.

     Feito com "state derivado da rota" em vez de setState dentro de
     useEffect: o effect disparava um segundo render em cascata (React
     19 passou a acusar isso como erro de lint). Comparando a rota
     anterior durante o próprio render, a gaveta já sai fechada no
     primeiro passo — sem frame intermediário com o menu aberto. */
  const [rotaAnterior, setRotaAnterior] = useState(pathname);
  if (rotaAnterior !== pathname) {
    setRotaAnterior(pathname);
    setAberto(false);
  }

  /* Com a gaveta aberta, o fundo não deve rolar junto. */
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  /* Esc fecha — teclado físico existe em tablet com capa. */
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Botão hambúrguer — só existe abaixo de lg, onde a sidebar some.
          44x44px é o mínimo recomendado para toque; menor que isso o
          dedo erra. */}
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-paper-100 active:bg-paper-200 lg:hidden"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>

      {/* Fundo escurecido */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setAberto(false)}
          aria-hidden="true"
        />
      )}

      {/* Gaveta */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-ink-900 shadow-2xl transition-transform duration-200 lg:hidden ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!aberto}
      >
        {/* Marca + fechar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-800 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/upload/logo?key=company_logo_icon"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="display-expanded text-[15px] leading-none font-bold text-white">
              VTDIGITAL
            </p>
            <p className="mt-1 font-mono text-[8px] tracking-[0.18em] text-ink-400 uppercase">
              Art Studio
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-800 hover:text-white"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Navegação */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="mb-1 flex items-center gap-2 px-3 font-mono text-[9px] tracking-[0.18em] text-ink-500 uppercase">
                <span className="h-px w-3" style={{ background: g.accent }} />
                {g.label}
              </p>
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setAberto(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] ${
                    ativo(it.href)
                      ? "bg-ink-800 font-semibold text-white"
                      : "text-ink-300 hover:bg-ink-800/60 hover:text-white"
                  }`}
                >
                  <Icon name={it.icon} className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
