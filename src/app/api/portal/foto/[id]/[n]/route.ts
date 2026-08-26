/* ════════════════════════════════════════════════════════════════
 *  FOTO PÚBLICA DO PRODUTO — GET /api/portal/foto/:id/:n
 *
 *  Serve a galeria do catálogo no portal do cliente. É material de
 *  MARKETING (as mesmas fotos que a vitrine mostraria), por isso não
 *  exige chave: <img> não manda header. O que é privado (custo,
 *  margem, snapshot) continua só no catálogo com x-api-key.
 *
 *  Cache de 1 dia: foto não muda no lugar (trocar = recadastrar),
 *  e o card do portal bate nisso em toda visita.
 * ════════════════════════════════════════════════════════════════ */
import { pool } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const pid = Number(id);
  const pos = Number(n);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(pos) || pos < 1 || pos > 3) {
    return new Response("pedido inválido", { status: 400 });
  }
  try {
    const { rows } = await pool.query(
      `SELECT data_uri FROM product_images WHERE product_id = $1 AND position = $2 LIMIT 1`,
      [pid, pos]
    );
    const uri = rows[0]?.data_uri as string | undefined;
    if (!uri || !uri.startsWith("data:image")) return new Response("sem foto", { status: 404 });
    const [cabecalho, b64] = uri.split(",");
    if (!b64) return new Response("foto corrompida", { status: 500 });
    const tipo = cabecalho.slice(5).split(";")[0] || "image/png";
    const bytes = Buffer.from(b64, "base64");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": tipo,
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("erro", { status: 500 });
  }
}
