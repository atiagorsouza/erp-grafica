# Incidente 2026-08-25 — "conversas sumiram e nada apareceu na tela"

**Relato do dono (após entrega da v3.68.8):** "suas modificações não
geraram nada pelo menos na tela… e o sistema que tinha conversar sumiu".
Print anexado na conversa (não visível pelo agente).

## Diagnóstico (só leitura)

- Página `/whatsapp` → **200**; API `/api/whatsapp-chat` → **`ok:true`**,
  porém `conversas: []`.
- Banco do **sandbox (preview)**: `whatsapp_conversas` = **0 linhas**,
  `whatsapp_mensagens` = **0 linhas**. O preview aponta para um CLONE de
  desenvolvimento — as conversas reais moram no banco de PRODUÇÃO.
- Nada apagou nada:
  - `e2e-smoke` só insere/deleta as PRÓPRIAS conversas de teste
    (`where phone_e164 = $1` do fixture dele) — linhas 1837–1879.
  - Diff v3.68.7 → v3.68.8 **não toca** em `listarConversas` (listagem
    idêntica à da versão anterior).
- Causa raiz: **confusão de ambiente**. O usuário abriu o preview do
  sandbox (banco clone vazio) esperando ver o sistema da gráfica.

## Resolução

1. Plantadas 2 conversas de DEMONSTRAÇÃO no sandbox (números fake
   `5521999000001/2`, não existem em produção):
   - `…0001` → vinculada à cliente 1 (Camila — tem venda PDV + pedido +
     orçamento: mostra a ficha 360º completa)
   - `…0002` → **sem cadastro**: mostra o selo e o botão "Cadastrar cliente"
2. Esclarecido para o usuário: preview ≠ produção; a v3.68.8 aparece no
   servidor da gráfica após o deploy (a listagem não mudou, então as
   conversas de lá continuam onde estavam).

## Pendente

- Confirmar com o usuário ONDE ele viu a tela vazia (preview e2b.app ×
  app.vtdigital.site). Se foi em PRODUÇÃO já deployada com conversas
  sumindo, é incidente novo e de outra natureza (nada no diff explica).
