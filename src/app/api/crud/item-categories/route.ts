import { crudHandler, db } from "@/lib/crud";
import { itemCategories, materials, products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────
   Categorias de item — agora editáveis pela tela (v3.58.1).

   Era um CRUD cru: repassava qualquer coisa para o banco. Enquanto só
   scripts escreviam aqui, tudo bem. A partir do momento em que o
   operador cria e move categoria pela interface, três coisas podem
   dar errado em silêncio:

     1. apagar uma categoria que tem produto dentro
     2. criar um terceiro nível (neto), que a tela não sabe desenhar
     3. uma categoria virar pai de si mesma — laço infinito

   As três viram erro claro em vez de dado corrompido.
   ────────────────────────────────────────────────────────────────── */

type Erro = { error: string; details?: unknown };

async function validar(
  data: Record<string, unknown>,
  id?: number
): Promise<Erro | null> {
  const nome = String(data.name ?? "").trim();
  if (data.name !== undefined && nome.length < 2) {
    return { error: "O nome da categoria precisa de ao menos 2 letras." };
  }
  if (nome.length > 60) {
    return { error: "O nome está longo demais (máximo 60 caracteres)." };
  }

  const parentId = data.parentId == null ? null : Number(data.parentId);
  if (parentId != null) {
    if (id && parentId === id) {
      return { error: "Uma categoria não pode ser subcategoria dela mesma." };
    }

    const [pai] = await db
      .select({ id: itemCategories.id, parentId: itemCategories.parentId, module: itemCategories.module })
      .from(itemCategories)
      .where(eq(itemCategories.id, parentId))
      .limit(1);

    if (!pai) return { error: "A categoria mestre escolhida não existe." };

    /* Só dois níveis. Com três, a tela vira árvore de explorador de
       arquivos e ninguém acha nada. */
    if (pai.parentId != null) {
      return {
        error: "Só existem dois níveis: escolha uma categoria mestre, não uma subcategoria.",
        details: { code: "MAX_DEPTH" },
      };
    }

    if (data.module && pai.module !== data.module) {
      return { error: "A subcategoria precisa ficar sob uma mestre do mesmo módulo." };
    }

    /* Virar filha de alguém arrasta os próprios filhos para o 3º
       nível. Melhor recusar do que deixar netos órfãos na tela. */
    if (id) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(itemCategories)
        .where(eq(itemCategories.parentId, id));
      if (Number(n) > 0) {
        return {
          error: `Esta categoria tem ${n} subcategoria(s). Mova-as antes de transformá-la em subcategoria.`,
          details: { code: "HAS_CHILDREN" },
        };
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: async (d) => {
      const erro = await validar(d as Record<string, unknown>);
      if (erro) throw Object.assign(new Error(erro.error), { status: 422 });
      return db
        .insert(itemCategories)
        .values(d as never)
        .returning()
        .then((r) => r[0]);
    },

    onUpdate: async (id, d) => {
      const erro = await validar(d as Record<string, unknown>, id);
      if (erro) throw Object.assign(new Error(erro.error), { status: 422 });
      return db
        .update(itemCategories)
        .set(d as never)
        .where(eq(itemCategories.id, id))
        .returning()
        .then((r) => r[0]);
    },

    onDelete: async (id) => {
      /* Apagar categoria com item dentro deixaria produto órfão, que
         some dos filtros e reaparece como "sem categoria" — trabalho
         de classificação perdido sem aviso. */
      const [{ prods }] = await db
        .select({ prods: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.productCategoryId, id));
      if (Number(prods) > 0) {
        throw Object.assign(
          new Error(`Esta categoria tem ${prods} produto(s). Mova-os antes de apagar.`),
          { status: 409 }
        );
      }

      const [{ mats }] = await db
        .select({ mats: sql<number>`count(*)::int` })
        .from(materials)
        .where(eq(materials.categoryId, id));
      if (Number(mats) > 0) {
        throw Object.assign(
          new Error(`Esta categoria tem ${mats} material(is). Mova-os antes de apagar.`),
          { status: 409 }
        );
      }

      /* Filhas não são apagadas em cascata (o banco usa SET NULL):
         sobem para a raiz e continuam visíveis para reorganizar. */
      const [{ filhos }] = await db
        .select({ filhos: sql<number>`count(*)::int` })
        .from(itemCategories)
        .where(eq(itemCategories.parentId, id));
      if (Number(filhos) > 0) {
        throw Object.assign(
          new Error(
            `Esta categoria tem ${filhos} subcategoria(s). Apague ou mova as subcategorias primeiro.`
          ),
          { status: 409 }
        );
      }

      return db.delete(itemCategories).where(eq(itemCategories.id, id));
    },
  });
}
