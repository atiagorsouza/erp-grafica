# VTDIGITAL — atualização 3.60.1

Varredura geral das máscaras: agora valem em **todos** os documentos, não
só no cupom. Mais o tamanho do papel na impressão.

---

## 1. Máscaras em todo lugar

A 3.60.0 corrigiu o cupom do PDV. Sua foto do orçamento mostrou que
faltava o resto. Passei documento por documento:

| Documento | O que estava cru | Agora |
|---|---|---|
| Orçamento A4 | `CEP 21860005` | `CEP 21810-000` |
| Orçamento A4 | CPF/CNPJ do cliente | formatado |
| Orçamento A4 | contato do cliente | `(21) 9xxxx-xxxx` |
| Ordem de Produção | CEP, telefone e CPF/CNPJ do cliente | formatados |
| OS em bobina 80mm | CNPJ e telefone | formatados |
| Cupom do PDV | documento do cliente | formatado |

**A causa do CEP:** o endereço de uma linha ("Rua Araquém, 910 — Bangu —
Rio de Janeiro / RJ — CEP ...") era montado **antes** do trecho que aplica
as máscaras. Corrigido na origem, então vale para os três documentos de
uma vez.

**Dados do cliente também.** Antes os documentos imprimiam o CPF e o
telefone exatamente como estavam no banco. Funcionava porque o cadastro
salva com máscara — mas quebraria em qualquer cliente importado de
planilha. Agora a formatação é aplicada na hora de imprimir, venha de onde
vier.

### O cadastro de clientes já estava certo

Conferi: a tela de Clientes e a página pública de cadastro **já tinham
máscara** em CPF/CNPJ, telefone, WhatsApp e CEP. Nada a fazer ali.

---

## 2. Sobre sua pergunta: "o tamanho está para A4 total?"

**Não estava.** E é um problema real.

A impressão usava `size: auto`, que deixa a escolha do papel com a
impressora. O padrão de fábrica de boa parte delas é **Carta**
(216×279mm), não **A4** (210×297mm). Como o A4 é 18mm mais alto e 6mm mais
estreito, o resultado é margem irregular e risco de cortar o rodapé —
justamente onde ficam as assinaturas do orçamento.

Agora o papel é declarado: **A4 retrato, margem de 10mm**.

O cupom térmico ganhou regra própria — 80mm de largura e **altura livre**,
porque a bobina é contínua. Fixar altura forçaria salto de página no meio
do cupom.

---

## Como instalar

```
cd /www/wwwroot
tar -xzf VTDIGITAL-3.60.1-COMPLETO.tar.gz
cd vtdigital-3.60.1
bash CONFERIR.sh

cd /www/wwwroot/erp-grafica
bash /www/wwwroot/vtdigital-3.60.1/deploy-auto.sh \
     /www/wwwroot/vtdigital-3.60.1/printflow-erp-v3.60.1.tar.gz
```

Depois: `cat VERSION` deve dizer `3.60.1`.

---

## Continua pendente da sua conferência

Dois dados estão gravados com **um dígito a menos** — não é máscara, é o
número errado no cadastro:

| Campo | Está | Deveria |
|---|---|---|
| CNPJ | `3189224000154` (13) | `30189224000154` (14) |
| Telefone 2 | `2197886914` (10) | `21978869414` (11) |

Confira em **Configurações → Identidade da empresa**. Com as máscaras
novas, digitar errado ficou difícil — e o CNPJ inválido agora sai sem
formatação, para o erro ficar visível em vez de virar um número que
*parece* certo.

Ao abrir a tela você vai notar duas mudanças: o **CEP vem antes do
endereço** e, ao digitá-lo, rua/bairro/cidade/UF se preenchem sozinhos.
