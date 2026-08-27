# 🚚 Como o código sai daqui e chega no servidor

> **Para o dono (Tiago).** Uma página. É o mapa da entrega: o que
> acontece automático, o que depende de você, e o que mandar para o
> agente do servidor.

---

## O resumo em 5 linhas

1. O agente de desenvolvimento (aqui) fecha a versão com `npm run entregar`.
2. Isso grava a versão, escreve o boletim, comita e faz **push**.
3. Ele te devolve uma **mensagem pronta** para o agente do servidor.
4. Você abre o **PR** e mergeia em `main`.
5. Você cola a mensagem no agente do servidor. Ele atualiza e te
   responde com a prova (versão + smoke).

O portal da Hostinger é o único que foge disso — §4 aqui embaixo.

---

## 1. Por que existe esse ritual

Produção não pode receber código sem rastro. Cada regra abaixo nasceu
de um incidente real (estão listados em `AGENTE-SERVIDOR.md` §5):

- Se não há **boletim**, o agente do servidor não sabe se a versão mexe
  no banco — e um `drizzle-kit push` na hora errada já quase derrubou
  as tabelas de conversa (25/08).
- Se não há **versão carimbada**, ninguém sabe o que está no ar. Já
  aconteceu de um deploy "passar" instalando a versão antiga (regra 1.4).
- Se não há **prova** (smoke + `/api/version`), "subiu" é opinião.

O `entregar.mjs` existe para que esquecer não seja possível: ele não
deixa fechar versão sem boletim.

---

## 2. Fechando uma versão (o que eu rodo aqui)

```bash
npm run entregar -- \
  --tipo patch \
  --titulo "Conserto do SKU duplicado" \
  --mudou "SKU repetido devolvia 500 com stack no log; agora 409 dizendo o produto" \
  --migracao nao
```

| Opção | Para quê |
|---|---|
| `--tipo` | `major` \| `minor` \| `patch` (padrão: patch) |
| `--versao X.Y.Z` | versão explícita, ignora `--tipo` |
| `--titulo` | título do boletim |
| `--mudou` | o que mudou (pode repetir a opção) |
| `--fazer` | passos extras para o agente (pode repetir) |
| `--validar` | validações extras (pode repetir) |
| `--migracao` | `sim` se mexeu no schema · padrão `nao` |
| `--portal` | marca que o portal Hostinger mudou |
| `--sem-push` | só prepara, não comita nem envia (ensaio) |

**Quando é `--migracao sim`?** Sempre que o schema mudar (tabela ou
coluna nova em `src/db/schema.ts`). Na dúvida, marque `sim`: o
`update.sh` é idempotente e o backup acontece de qualquer forma.

---

## 3. O que você faz (as duas etapas humanas)

### 3.1 Mergear em `main`

Produção **só** atualiza a partir de `main`. O trabalho vem numa branch
`arena/*`:

```bash
gh pr create --fill --base main --head arena/<branch>
# revise e mergeie pelo GitHub
```

### 3.2 Repassar a mensagem

Depois do merge, cole no agente do servidor a mensagem que o
`entregar` imprimiu. Ela já vem com versão, commit, boletim, se tem
migração e os passos.

**Ele deve te responder três coisas:**

1. a saída de `/api/version` — com `"upToDate": true`
2. a última linha do `e2e:smoke` — `🎉 concluído com sucesso`
3. qualquer anomalia no caminho

Se vier "atualizei" sem esses três itens, **não está provado**. Peça.

---

## 4. O portal do cliente (Hostinger) — o fluxo separado

O portal não roda no servidor da gráfica. A Hostinger (plano
compartilhado) não tem git nem Node persistente, então ele é entregue
**por arquivo**, não por `git pull`.

| | ERP | Portal |
|---|---|---|
| Onde roda | servidor da gráfica | Hostinger |
| Entrega | `git pull` + `update.sh` | zip pelo gerenciador de arquivos |
| Quem aplica | agente do servidor | **você** |

O código do portal **fica no git** (`portal-hostinger/`) — é a fonte da
verdade. O zip é **gerado na hora**, nunca commitado:

```bash
npm run portal:empacotar
# → release/portal-v<versão>-<data>.zip  (com LEIA-ME dentro)
```

Aí é: gerenciador de arquivos da Hostinger → pasta pública do domínio →
enviar e extrair. Teste enviando um pedido pelo portal e confira se ele
aparece no ERP.

> **Cuidado com a chave.** Portal e ERP compartilham `PORTAL_API_KEYS`.
> Trocar essa chave no `.env` do ERP derruba o portal até ele ser
> republicado com a nova. Trocar a chave = implantar dos dois lados.

**Estado hoje:** `portal-hostinger/` ainda está vazio (só o README). O
desenho aprovado está em `docs/PLANO-PORTAL-CLIENTE.md`. O empacotador
avisa e não gera nada — é o esperado.

---

## 5. Se der errado

| Sintoma | Onde olhar |
|---|---|
| Site fora / 502 | `docs/SOCORRO-502.md`, `docs/SOCORRO-SITE-FORA.md` |
| Update falhou no meio | `AGENTE-SERVIDOR.md` §7 (rollback) |
| Versão errada no ar | `node scripts/check-version.mjs --fix` |
| Não sei o que está no ar | `npm run agente:verificar` |

**A regra de ouro:** se qualquer etapa falhar, o agente do servidor
**para** e reporta. Ele não tem autorização para inventar caminho
alternativo nem forçar flag. Isso é proposital.

---

*Mantido pelo agente de desenvolvimento. O manual do lado do servidor é
o `AGENTE-SERVIDOR.md`.*
