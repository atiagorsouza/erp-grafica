/* ──────────────────────────────────────────────────────────────────
   DESPEJO DO SCHEMA QUE O CÓDIGO ESPERA

     npx tsx scripts/schema-dump.mts

   Lê `src/db/schema.ts` com o próprio Drizzle e imprime, em JSON, as
   tabelas / colunas / tipos que o código de fato usa.

   Existe porque a lista de "o que o banco precisa ter" vivia digitada
   à mão dentro de `migrar-banco.mjs`. Toda coluna nova que ninguém
   lembrasse de anotar ali passava batida no deploy e só aparecia como
   HTTP 500 em produção — foi o que houve com `item_categories.parent_id`
   na v3.58.1. Lista escrita à mão envelhece; schema lido do código,
   não.
   ────────────────────────────────────────────────────────────────── */
import { getTableConfig, PgTable, PgEnumColumn, isPgEnum } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "../src/db/schema";

type ColunaInfo = {
  nome: string;
  sqlType: string;
  notNull: boolean;
  temDefault: boolean;
  /* Auto-referência ou FK: precisamos do alvo para montar o ADD COLUMN
     com REFERENCES, senão a coluna nasce sem a integridade que o código
     assume. */
  referencia: { tabela: string; coluna: string; onDelete?: string } | null;
  enumName: string | null;
  enumValores: string[] | null;
};

const tabelas: Record<string, ColunaInfo[]> = {};
const enums: Record<string, string[]> = {};

/* Os enums são exports próprios (`pgEnum(...)`), não colunas. Varrer
   só as colunas perdia todo enum ainda não usado — e o CREATE TYPE
   precisa existir antes do ADD COLUMN que o referencia. */
for (const exportado of Object.values(schema)) {
  if (isPgEnum(exportado)) {
    enums[exportado.enumName] = [...exportado.enumValues];
  }
}

for (const exportado of Object.values(schema)) {
  if (!is(exportado, PgTable)) continue;
  const cfg = getTableConfig(exportado as PgTable);

  const colunas: ColunaInfo[] = cfg.columns.map((col) => {
    /* As FKs ficam no nível da tabela; casamos pela coluna de origem. */
    let referencia: ColunaInfo["referencia"] = null;
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const origem = ref.columns[0];
      const destino = ref.foreignColumns[0];
      if (origem?.name === col.name && destino) {
        referencia = {
          tabela: getTableConfig(ref.foreignTable as PgTable).name,
          coluna: destino.name,
          onDelete: fk.onDelete,
        };
        break;
      }
    }

    const ehEnum = is(col, PgEnumColumn);
    const enumName = ehEnum ? (col as unknown as { enumName?: string }).enumName ?? null : null;
    const enumValores = ehEnum ? ((col.enumValues as string[] | undefined) ?? null) : null;
    if (enumName && enumValores) enums[enumName] = enumValores;

    return {
      nome: col.name,
      sqlType: col.getSQLType(),
      notNull: col.notNull,
      temDefault: col.hasDefault,
      referencia,
      enumName,
      enumValores,
    };
  });

  tabelas[cfg.name] = colunas;
}

process.stdout.write(JSON.stringify({ tabelas, enums }, null, 2));
