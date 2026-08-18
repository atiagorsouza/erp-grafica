import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ====================================================================
 *  AUTENTICAÇÃO DA API PÚBLICA (v3.45.0)
 * ====================================================================
 *
 * O ERP fica atrás de Cloudflare Tunnel e o `app.vtdigital.site` é
 * protegido por Cloudflare Access (login humano na borda). Mas o
 * portal de clientes chama a API máquina-a-máquina — não passa por
 * login — então precisa de chave própria.
 *
 * Esta é a ÚNICA porta de entrada sem sessão humana. Por isso:
 *
 *  1. FALHA FECHADA. Sem chave configurada no servidor, a rota recusa
 *     tudo. O código anterior fazia o oposto:
 *
 *         if (process.env.PORTAL_TOKEN && token !== ...) return 401
 *
 *     Quando a variável não existia, a condição inteira era pulada e a
 *     rota respondia 200 para qualquer um — foi o que aconteceu em
 *     produção: `GET /api/portal` devolvia o catálogo inteiro sem
 *     nenhuma credencial.
 *
 *  2. Comparação em TEMPO CONSTANTE. `a === b` sai no primeiro byte
 *     diferente; medindo o tempo de resposta dá para descobrir a chave
 *     caractere por caractere. `timingSafeEqual` sempre percorre tudo.
 *
 *  3. Chave no HEADER, nunca na query string. URL vai para log de
 *     servidor, histórico de navegador e header `Referer` — o token
 *     vazaria em cada um deles.
 * ==================================================================== */

export type ApiAuthResult =
  | { ok: true; keyName: string }
  | { ok: false; status: number; error: string };

/** Hash de tamanho fixo — `timingSafeEqual` exige buffers iguais. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeEquals(a: string, b: string): boolean {
  try {
    return timingSafeEqual(digest(a), digest(b));
  } catch {
    return false;
  }
}

/**
 * Chaves aceitas, lidas de `PORTAL_API_KEYS`.
 *
 * Formato: `nome:chave` separados por vírgula, para revogar uma sem
 * derrubar as outras e saber nos logs quem chamou.
 *
 *   PORTAL_API_KEYS="portal:sk_live_abc123,integracao:sk_live_def456"
 *
 * Aceita também o formato antigo `PORTAL_TOKEN=xyz` para não quebrar
 * quem já configurou.
 */
function loadKeys(): Map<string, string> {
  const keys = new Map<string, string>();

  const multi = process.env.PORTAL_API_KEYS?.trim();
  if (multi) {
    for (const entry of multi.split(",")) {
      const [name, secret] = entry.split(":");
      const n = name?.trim();
      const s = secret?.trim();
      /* Chave curta é chute fácil: exigimos 24+ caracteres. */
      if (n && s && s.length >= 24) keys.set(n, s);
    }
  }

  const legacy = process.env.PORTAL_TOKEN?.trim();
  if (legacy && legacy.length >= 24) keys.set("portal", legacy);

  return keys;
}

/**
 * Valida a requisição da API pública.
 *
 * Aceita `x-api-key: <chave>` ou `Authorization: Bearer <chave>`.
 */
export function authenticateApiRequest(req: Request): ApiAuthResult {
  const keys = loadKeys();

  /* Falha fechada: servidor sem chave configurada não atende ninguém.
     Melhor o portal quebrar e alguém investigar do que o ERP ficar
     aberto e ninguém notar. */
  if (keys.size === 0) {
    return {
      ok: false,
      status: 503,
      error: "API pública não configurada",
    };
  }

  const header =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  const presented = header.trim();
  if (!presented) {
    return { ok: false, status: 401, error: "Credencial ausente" };
  }

  /* Percorre TODAS as chaves mesmo após encontrar a correta: sair no
     primeiro acerto revelaria, pelo tempo, a posição da chave válida. */
  let matched: string | null = null;
  for (const [name, secret] of keys) {
    if (safeEquals(presented, secret)) matched = name;
  }

  if (!matched) {
    return { ok: false, status: 401, error: "Credencial inválida" };
  }

  return { ok: true, keyName: matched };
}

/* ------------------------------------------------------------------ */
/*  RATE LIMIT                                                         */
/*                                                                     */
/*  Complementa o rate limit da Cloudflare (que é por IP na borda).    */
/*  Este é por CHAVE: se um token vazar, o estrago fica contido mesmo  */
/*  que o atacante troque de IP.                                       */
/*                                                                     */
/*  Em memória de propósito — o ERP roda em processo único. Se um dia  */
/*  escalar horizontalmente, trocar por Postgres ou Redis.             */
/* ------------------------------------------------------------------ */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(keyName: string): {
  ok: boolean;
  retryAfter: number;
} {
  const now = Date.now();
  const current = hits.get(keyName);

  if (!current || now >= current.resetAt) {
    hits.set(keyName, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

/**
 * Guarda completo: autentica e aplica rate limit.
 *
 * Devolve `null` quando a requisição passou; caso contrário, a própria
 * `Response` de erro pronta para retornar.
 */
export function guardPublicApi(req: Request): Response | null {
  const auth = authenticateApiRequest(req);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      {
        status: auth.status,
        /* Sinaliza o esquema esperado sem revelar se a chave existe. */
        headers: { "WWW-Authenticate": "Bearer" },
      }
    );
  }

  const limit = checkRateLimit(auth.keyName);
  if (!limit.ok) {
    return Response.json(
      { error: "Limite de requisições excedido" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      }
    );
  }

  return null;
}
