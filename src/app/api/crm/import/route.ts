import { importCustomers, parseCustomersPdf } from "@/lib/import-customers";

export const dynamic = "force-dynamic";
/* Fichas de PDF vêm em lote; a leitura do arquivo é a parte lenta. */
export const maxDuration = 60;

/** 8 MB cobre folgadamente algumas centenas de fichas. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/crm/import  (multipart/form-data)
 *   file    — PDF com as FICHAS DO CLIENTE do sistema antigo
 *   confirm — "1" grava; qualquer outra coisa é simulação (padrão)
 *
 * A tela sempre chama primeiro sem `confirm` para mostrar a prévia, e
 * só grava depois que o usuário confere.
 */
export async function POST(req: Request) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      /* requisição sem multipart: sem isto o usuário recebia o erro
         genérico de 500 em vez da instrução correta */
      return Response.json({ error: "Envie o arquivo PDF." }, { status: 400 });
    }
    const file = form.get("file");
    const confirm = String(form.get("confirm") || "") === "1";

    if (!(file instanceof File)) {
      return Response.json({ error: "Envie o arquivo PDF." }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "O arquivo está vazio." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: "Arquivo maior que 8 MB. Divida a exportação em partes." },
        { status: 413 }
      );
    }

    const buffer = await file.arrayBuffer();

    let parsed;
    try {
      parsed = await parseCustomersPdf(buffer);
    } catch {
      return Response.json(
        { error: "Não foi possível ler o PDF. Verifique se o arquivo não está protegido por senha." },
        { status: 422 }
      );
    }

    if (parsed.length === 0) {
      return Response.json(
        {
          error:
            "Nenhuma ficha de cliente encontrada. O importador espera o relatório " +
            "\"FICHA DO CLIENTE\" do sistema antigo — se o seu PDF for uma imagem " +
            "escaneada, o texto não pode ser lido.",
        },
        { status: 422 }
      );
    }

    const report = await importCustomers(parsed, { dryRun: !confirm });
    return Response.json({ ok: true, confirmed: confirm, ...report });
  } catch (e) {
    console.error("[crm/import]", e);
    return Response.json(
      { error: "Falha ao processar a importação." },
      { status: 500 }
    );
  }
}
