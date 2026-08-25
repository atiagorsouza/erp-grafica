# Incidente 2026-08-25 (2ª parte) — mensagens chegam, conversas somem em PRODUÇÃO

**Relato do dono:** `/whatsapp` em produção mostra "Nenhuma conversa ainda"
e nada das novidades da 3.68.8. Antes: "só aparece carregando".

## Provas levantadas de fora (fetch da página de produção)

- `/api/version` produção: **código 3.68.8** rodando, **banco carimbado
  3.68.2**, `upToDate: false` → o deploy de hoje (agente externo,
  BUILD_ID 4BB6pMl6EvhJ, commit 063bd28 no main) NÃO rodou o
  `update.sh` (migrações + carimbo).
- Página `/whatsapp` de produção renderiza e mostra:
  - **Conexão: conectado** — Tiago, +55 21 99442-7557, **no ar desde
    24/08 22:16**
  - **Movimento: 447 recebidas / 446 enviadas** (contador da sessão)
  - **"Nenhuma conversa ainda"** na lista
- Contradição = as mensagens chegam pelo motor, mas **não estão sendo
  gravadas (ou a tabela de conversas foi apagada)**.

## Mecanismo provável

- `whatsapp_conversas`/`whatsapp_mensagens` **não estão no schema do
  ERP** (src/db/schema.ts) — são criadas pelo serviço
  (`services/whatsapp/src/pre-cadastro.mjs`, `CREATE TABLE IF NOT EXISTS`).
- Qualquer `drizzle-kit push --force` enxerga essas tabelas como "sobra"
  e **as DROPA**. O `update.sh` oficial roda `drizzle-kit push`
  interativo (pergunta antes de destruir — seguro em não-TTY: aborta).
  O agente de hoje pode ter rodado `--force` na mão para "migrar".
- `tolerante()` no ERP silencia "table does not exist" **por design**
  ("bot não instalado é estado válido") → tabela sumida aparece como
  lista vazia, sem erro nenhum. Falsificou "nunca houve conversas".

## Cenários possíveis (a checagem leitura-only decide)

| Cenário | Sintoma no banco | Conserto |
|---|---|---|
| A. Tabelas apagadas | nenhuma `whatsapp_*` | `pm2 restart` no serviço → recria vazias (`IF NOT EXISTS`); histórico só se houver backup |
| B. Só conversas vazia | `conversas` 0 linhas, `mensagens` com linhas | NADA de restart: a próxima mensagem recebida recria a conversa; histórico intacto |
| C. Tabelas ok com linhas | contagens > 0 | outro bug (investigar query/listagem) |

## Resolução (mesmo dia, pelo dono + agente no servidor)

- Causa raiz confirmada: **o motor escrevia no banco errado** — durante o
  deploy do agente externo, o ERP passou a ler `app_db_recuperado` e o
  serviço do WhatsApp continuou no banco antigo. Tabelas existiam, só
  zeradas do lado que o ERP lia.
- Conserto: motor apontado para o banco correto (`app_db_recuperado`),
  serviço reiniciado, **QR re-escaneado**, conversa testada ponta a
  ponta pelo dono — gravando e aparecendo ✔.

## Pendências que este incidente deixou

1. **Deploy oficial ainda não rodou**: banco carimbado 3.68.2
   (`upToDate:false`) — migrações da 3.68.3→3.68.8 possivelmente
   faltando (ex.: `order_nsu` da 3.68.6).
2. **Blindagem 3.68.9**: incluir `whatsapp_conversas`/`whatsapp_mensagens`
   (+ tabela de sessão do serviço) no schema do ERP, para o drizzle
   passar a GERENCIAR em vez de propor DROP. Sem isso, qualquer
   `drizzle-kit push` futuro (mesmo interativo) encalha nessas tabelas.
3. **Integridade entre bancos**: durante a janela do problema o ERP já
   lia `app_db_recuperado` — conferir se registro feito na janela
   (vendas/pedidos digitados ontem~hoje) está no banco que agora é o
   oficial. Comparar contagens com o banco antigo se sobrar dúvida.


**Regra da casa reforçada:** nenhum comando destrutivo no banco de
produção sem go-ahead explícito.
