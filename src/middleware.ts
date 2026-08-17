import { NextResponse, type NextRequest } from "next/server";

/**
 * O layout `src/app/(app)/layout.tsx` lê o header `x-current-path` para saber
 * qual item do menu deve ficar ativo. Esse header não existe nativamente no
 * Next.js — precisa ser injetado por middleware.
 *
 * Sem este arquivo a Sidebar nunca marca a rota atual (bug do clone original).
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-current-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas, exceto assets estáticos e arquivos internos
     * do Next, para não pagar custo de middleware à toa.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
