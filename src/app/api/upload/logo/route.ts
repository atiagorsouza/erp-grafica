import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Upload da logo da empresa (v3.46.2).
 *
 * A imagem é guardada como data URI dentro de `settings`, não como
 * arquivo em disco. Três razões:
 *
 * 1. O ERP roda atrás do Cloudflare Tunnel e o portal virá de outro
 *    servidor (Hostinger). Arquivo em disco local não é alcançável
 *    pelos dois; o banco é.
 * 2. `scripts/backup-auto.sh` faz dump do banco. Logo em disco ficaria
 *    de fora do backup e sumiria numa restauração.
 * 3. Cupom e PDF são gerados no servidor e no navegador. Data URI
 *    funciona nos dois sem servir estático.
 *
 * O custo é o tamanho: base64 infla ~33%. Por isso o limite é baixo e
 * conferido depois da conversão, não antes.
 */

/** 2 MB já convertido — cabe folgado numa PNG de logo bem exportada. */
const LIMITE_BYTES = 2 * 1024 * 1024;

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Chaves que o Painel pode gravar por aqui. */
const CHAVES = ["company_logo", "company_logo_dark", "company_logo_icon"] as const;
type Chave = (typeof CHAVES)[number];

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "Envie o arquivo como multipart/form-data." },
      { status: 400 }
    );
  }

  const arquivo = form.get("file");
  const chave = String(form.get("key") || "company_logo") as Chave;

  if (!CHAVES.includes(chave)) {
    return Response.json({ error: "Campo de logo inválido." }, { status: 400 });
  }

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return Response.json(
      { error: "Formato não aceito. Use PNG, JPG, WEBP ou SVG." },
      { status: 415 }
    );
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());

  /* Confere o tamanho REAL do conteúdo. `file.size` vem do navegador e
     um cliente que não seja o nosso pode mentir. */
  if (bytes.byteLength > LIMITE_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
    return Response.json(
      { error: `Imagem de ${mb} MB — o limite é 2 MB. Reduza e envie de novo.` },
      { status: 413 }
    );
  }

  /* Assinatura do arquivo (magic number). Sem isto, um .exe renomeado
     para .png passaria: `arquivo.type` é só o que o navegador declarou. */
  const assinaturaOk =
    (arquivo.type === "image/png" &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    (arquivo.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (arquivo.type === "image/webp" &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP") ||
    (arquivo.type === "image/svg+xml" &&
      bytes.subarray(0, 1024).toString("utf8").toLowerCase().includes("<svg"));

  if (!assinaturaOk) {
    return Response.json(
      { error: "O conteúdo do arquivo não corresponde à extensão." },
      { status: 415 }
    );
  }

  const dataUri = `data:${arquivo.type};base64,${bytes.toString("base64")}`;

  const [existente] = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.key, chave))
    .limit(1);

  if (existente) {
    await db
      .update(settings)
      .set({ value: dataUri, updatedAt: new Date() })
      .where(eq(settings.id, existente.id));
  } else {
    await db.insert(settings).values({ key: chave, value: dataUri, category: "empresa" });
  }

  return Response.json({
    ok: true,
    key: chave,
    bytes: bytes.byteLength,
    dataUri,
  });
}

/** Remove a logo — volta ao texto do nome da empresa nos documentos. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const chave = String(searchParams.get("key") || "company_logo") as Chave;

  if (!CHAVES.includes(chave)) {
    return Response.json({ error: "Campo de logo inválido." }, { status: 400 });
  }

  await db.update(settings).set({ value: "", updatedAt: new Date() }).where(eq(settings.key, chave));
  return Response.json({ ok: true, key: chave });
}
