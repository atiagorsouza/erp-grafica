import "dotenv/config";
import type { Config } from "drizzle-kit";

/* ──────────────────────────────────────────────────────────────────
   Configuração do drizzle-kit.

   Era um .json com a URL do banco ESCRITA À MÃO
   ("postgresql://postgres:postgres@127.0.0.1:5432/app_db").

   BUG v3.53.2, encontrado ao testar uma instalação limpa: quem usa
   outro nome de banco, outro usuário ou outra senha — ou seja,
   qualquer servidor de verdade — tinha o `drizzle-kit push` apontando
   para o banco errado. Ele respondia "No changes detected" e seguia
   feliz, sem criar tabela nenhuma. O deploy continuava, e só quebrava
   depois, com "relation settings does not exist".

   Um .json não consegue ler variável de ambiente. Por isso virou .ts:
   agora a fonte é o DATABASE_URL do .env, que é o mesmo que a
   aplicação usa. Uma fonte da verdade, não duas.
   ────────────────────────────────────────────────────────────────── */

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL não definida. O drizzle-kit precisa dela para saber " +
      "em qual banco criar as tabelas. Confira o arquivo .env."
  );
}

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
} satisfies Config;
