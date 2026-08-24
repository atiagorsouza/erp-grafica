# Varredura do sistema — v3.62.0

> **Atualização 21/08:** os achados **1, 2 e 3 foram corrigidos na
> v3.63.0**, com 12 testes novos no smoke (245 → 257). Seguem abertos os
> itens 4, 5, 6 e 7.

Feita em 21/08/2026 sobre o código da 3.62.0, com o sistema **rodando**
(não foi leitura de código: cada item abaixo foi provocado e observado).

---

## Resumo

| Área | Situação |
|---|---|
| Typecheck | ✅ limpo |
| Build | ✅ passa, gera `BUILD_ID` |
| Smoke (245 checks) | ✅ 245/245 |
| Lint | ⚠️ 11 (6 erros, 5 avisos) — histórico |
| 18 telas | ✅ todas respondem 200 |
| SQL injection | ✅ não passou (tabela intacta após tentativa) |
| Upload de arquivo | ✅ valida conteúdo real, não só extensão |
| Integridade do banco | ✅ zero registros órfãos |
| Regra 50/50 | ✅ trava funciona (409 + escape de boa-fé) |
| Fórmula de preço | ✅ trava de 99% no divisor |
| `console.log` em produção | ✅ nenhum |

**Nada crítico. Sete achados, nenhum impede o uso.**

---

## 🔴 ALTO — merece correção na próxima versão

### 1. ~~Token de integração vaza em texto puro~~ ✅ CORRIGIDO na 3.63.0

`GET /api/crud/settings` devolve **todos** os valores sem máscara. Só as
3 chaves de logo viram `"__SET__"` (`route.ts:62`).

Verificado na resposta real:

```
superfrete_token = (vazio hoje)
pix_key = contato@graficavtdigital.com.br
```

Hoje o token está vazio, então **não há vazamento agora**. Mas assim que
o dono preencher SuperFrete — ou quando entrar o SMTP — a senha passa a
ser devolvida a qualquer um que abra o endereço.

**Correção:** criar o tipo `password` no painel e incluir essas chaves na
mesma máscara `__SET__` já usada nas logos. Era exatamente o que o
desenho `RABISCO-PAINEL-EMAIL.md` previa.

### 2. ~~Estoque negativo é aceito~~ ✅ CORRIGIDO na 3.63.0

```
POST /api/crud/materials  {"stock": -999}   →  HTTP 200
banco:  ZZ NEG2 | -999.000
```

Gravou. Não existe **nenhum CHECK constraint no banco inteiro** (contei:
zero), então a única defesa seria a aplicação — e ela não barra.

Para comparação, o preço **é** protegido: `sellPrice: -500` virou `0`.

**Correção:** validar no schema de materiais (como já fazem `materials`,
`services` e `printers` para outros campos) e/ou `CHECK (stock >= 0)`.

---

## 🟡 MÉDIO

### 3. ~~Seis rotas devolvem 500 onde deveria ser 400~~ ✅ CORRIGIDO na 3.63.0

Um `id` acima do limite de `integer` do Postgres (2.147.483.647) estoura
no banco e vira erro de sistema:

| Rota | Resposta |
|---|---|
| customers, orders, quotes, products, transactions | 🔴 **500** |
| materials, services, printers | ✅ 400 (têm validação por schema) |

Não é falha de segurança — é ruído: enche o log de erro e confunde o
diagnóstico. As três que respondem 400 mostram o caminho.

**Correção:** `if (id > 2147483647) return 400` no ponto comum, ou
estender o schema de validação às outras rotas.

### 4. Vulnerabilidades nas dependências

```
next     high  — bypass de middleware/proxy (App Router + Turbopack)
postcss  high  — XSS no stringify / leitura de .map arbitrário
sharp    high  — CVEs herdadas do libvips
```

As três têm correção disponível. **Não atualize junto com outra
mudança** — suba sozinho, para saber a quem culpar se quebrar.

### 5. Versão do Next diferente entre servidor e desenvolvimento

- Servidor da loja: **16.3.1**
- Desenvolvimento: **16.2.6**

O `package.json` pede `16.2.6` sem travar, então `npm install` no
servidor puxa a mais nova. Hoje funcionou, mas é diferença que aparece na
hora errada.

**Correção:** fixar a versão exata no `package.json`.

---

## 🟢 BAIXO

### 6. Data pelo relógio do navegador em dois pontos

`ClientsClient.tsx:69` (idade do cliente) e `ChatWhatsApp.tsx:47`
("é hoje?") usam `new Date()` cru, sem o fuso da loja.

Medido: entre 21h e meia-noite, **a idade erra em 1 ano**.

Mas os dois são `"use client"` — rodam no navegador do operador, que já
está em horário de Brasília. **Só aparece se alguém abrir o sistema com
o computador em outro fuso.** A função equivalente do servidor
(`upcomingBirthdays`) usa `todayISO()` corretamente.

### 7. Dívidas registradas

- `src/app/api/portal/route.ts:65` — `TODO (fase 6): criar orçamento
  rascunho + card no kanban`
- Lint: 11 ocorrências antigas (2 aspas não escapadas, 2 de memoização,
  2 de `setState` em efeito, 5 diretivas não usadas)

---

## O que foi testado e passou

Vale registrar o que **não** quebrou, porque também é resultado:

- `'; DROP TABLE customers;--` no nome → recusado, tabela com as 11
  linhas intactas
- `<script>alert(1)</script>` → recusado pela validação de CPF
- JSON malformado → 400 com mensagem clara
- `op` inexistente → 400
- Upload de arquivo texto renomeado para `.png` → 415, "o conteúdo não
  corresponde à extensão"
- Paginação com `?pagina=999999`, `?por=abc`, `?pagina=-5`, aspas e
  sinais na busca → todas 200, sem quebrar
- Pedido para produção sem entrada → 409 com o valor e o motivo
- Órfãos no banco (pedidos, orçamentos, itens, vendas) → zero

---

## Ordem sugerida

1. ~~Token/senha mascarados (#1)~~ ✅ feito na 3.63.0
2. ~~Estoque negativo (#2)~~ ✅ feito na 3.63.0
3. ~~500 → 400 (#3)~~ ✅ feito na 3.63.0
4. **Travar versão do Next** (#5) — barato, evita surpresa no deploy
5. **Dependências** (#4) — sozinho, numa versão só para isso
6. Fuso no cliente (#6) e dívidas (#7) — quando sobrar tempo
