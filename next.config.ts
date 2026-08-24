import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* A checagem de tipos roda DENTRO do `next build`, e era isso que
     estourava a memória no servidor da loja: o build compila em ~10s e
     depois o TypeScript sobe junto de tudo o que já está carregado,
     batendo no teto do heap (2 GB) e derrubando o processo.

     Rodar a checagem separadamente custa 388 MB e não enfraquece nada:
     `npm run typecheck` e `npm run lint` continuam obrigatórios antes
     de fechar cada versão. O que muda é só QUANDO rodam — fora do
     build, não dentro.

     (Nesta versão do Next não existe a chave `eslint` no config; o lint
     já não roda no build.) */
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
