# Auditoria — campos "sem cor" no PDV

Data: 2026-08-18 · Versão: v3.46.2

Investigação a partir do relato: **"quando vai informar o troco fica sem
cor, tanto no celular quanto no PC"**.

---

## O que estava acontecendo

Não era CSS quebrado nem problema de tema escuro/claro. Era **conflito
de classes do Tailwind que ninguém resolvia**.

O componente `Input` define uma base clara:

```
bg-white   text-ink-900     (fundo branco, texto quase preto)
```

E o PDV manda cores escuras por cima:

```
bg-ink-900  text-white      (fundo quase preto, texto branco)
```

A função que junta as classes era só isto:

```ts
export function cn(...inputs) {
  return clsx(inputs);       // concatena, não resolve conflito
}
```

`clsx` **concatena**. As quatro classes iam juntas para o HTML, e quem
ganha não depende da ordem na string — depende da ordem em que o
Tailwind gerou cada regra no arquivo CSS final.

Resultado no campo "Recebido R$": venceu `bg-ink-900` (fundo `#0e1420`)
e **não** venceu `text-white`. Texto quase preto sobre fundo quase preto.
O campo parecia vazio; você digitava e não via nada.

Isso explica os dois sintomas que você relatou: acontece no celular e no
PC igualmente, porque não tem nada a ver com o dispositivo.

---

## Não era só o troco

Ao procurar o padrão, encontrei **8 campos no PDV** na mesma situação:

| Linha | Campo |
|---|---|
| 1249 | quantidade do item |
| 1303 | desconto |
| 1429 | forma de pagamento (split) |
| 1443 | valor da parcela (split) |
| 1523 | **recebido / troco** ← o que você viu |
| 1578 | vendedor |
| 1586 | modo de entrega |
| 1601 | observações |

E o mesmo risco existia em **outros 14 módulos** que também sobrescrevem
cor de campo (Orçamentos, Financeiro, Clientes, Relatórios...). Alguns
provavelmente já estavam ilegíveis sem ninguém ter reparado ainda.

---

## A correção

Trocar `clsx` puro por `clsx` + `tailwind-merge`:

```ts
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

`twMerge` conhece as utilities do Tailwind e **descarta a anterior**
quando duas mexem na mesma propriedade. A última vence — que é o que
qualquer um espera ao passar `className`.

Verificado com o caso real do PDV:

| Classe | Antes | Depois |
|---|---|---|
| `bg-white` (base) | ficava | **removida** ✔ |
| `text-ink-900` (base) | ficava | **removida** ✔ |
| `bg-ink-900` (PDV) | ficava | mantida ✔ |
| `text-white` (PDV) | ficava | **mantida** ✔ |

**Uma linha corrige os 8 campos do PDV e previne a classe inteira do
problema** em todos os módulos. Não precisei tocar em nenhum componente
de tela.

---

## Por que não apareceu antes

Esse tipo de conflito é instável: o resultado muda conforme o Tailwind
reordena as regras no CSS, o que acontece quando classes novas entram no
projeto. Um campo que funcionava pode ficar ilegível depois de uma
alteração em outro arquivo, sem ninguém ter mexido nele.

É por isso que valeu corrigir na raiz em vez de ajustar campo a campo.

---

## Regressão

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm run build` | compila |
| `npm run e2e:smoke` | 179 ✔ |
| `npm run lint` | 11 (mesmo baseline) |
| `verificar-instalacao.sh` | consistente |

---

## O que não foi coberto

Esta auditoria tratou **legibilidade de campos**. Os módulos Calendário
e Configurações continuam sem auditoria funcional completa — são os dois
últimos da lista.

Se você notar outro campo estranho no PDV (valor errado, botão que não
responde, cálculo fora), me diga qual e em que passo: o bug de cor está
resolvido, mas comportamento é outra investigação.
