import type { Metadata } from "next";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SettingsClient } from "@/components/modules/SettingsClient";

export const metadata: Metadata = { title: "Painel de Controle" };
export const dynamic = "force-dynamic";

/* Chaves cujo valor é uma imagem inteira em base64 (~2 MB cada).
   Ver o comentário abaixo. */
const PESADAS = new Set(["company_logo", "company_logo_dark", "company_logo_icon"]);

/* Segredos: senha de e-mail e tokens de integração.

   A API já os mascarava (v3.63.0), mas ESTA PÁGINA é outro caminho —
   ela lê o banco direto e injeta os valores no HTML. A senha aparecia
   em texto puro no código-fonte da página, mesmo com o campo em
   branco na tela. Encontrado em teste de navegador, v3.65.0.

   Ao criar campo de senha novo no Painel, acrescente a chave aqui E
   em `api/crud/settings`. As duas listas precisam andar juntas. */
const SEGREDOS = new Set([
  "smtp_password",
  "superfrete_token",
  "wa_token",
  "infinitepay_api_key",
]);

export default async function ConfiguracoesPage() {
  const rows = await db.select().from(settings);

  /* ── Por que não mandar as logos para o navegador ─────────────────
     BUG v3.53.1, encontrado em produção: a página parou de abrir.

     As logos são gravadas como data URI dentro de `settings` (decisão
     certa: entram no backup e funcionam atrás do tunnel). Mas esta
     página mandava o valor inteiro para o cliente — e o Next envia
     DUAS vezes, no HTML e no payload RSC.

     Com as três logos preenchidas a 2 MB, a página saía com 12 MB. Em
     conexão lenta ou celular, o navegador desiste antes de terminar.

     A correção: substituir o conteúdo por um marcador. O componente de
     logo lê a URL de /api/upload/logo?key=..., que serve a imagem com
     ETag e cache. A tela precisa saber SE existe logo, não QUAL é o
     base64 dela. */
  const enxutas = rows.map((r) =>
    (PESADAS.has(r.key) || SEGREDOS.has(r.key)) && (r.value?.length ?? 0) > 0
      ? { ...r, value: "__SET__" }
      : r
  );

  return <SettingsClient rows={enxutas} />;
}
