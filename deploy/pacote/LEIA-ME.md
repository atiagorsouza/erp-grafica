# VTDIGITAL — Atualização v3.68.1

Esta atualização faz **duas coisas**: sobe a versão nova do sistema e
**troca a base de demonstração pela sua base real**.

Faça na ordem. Uma linha de cada vez.

> **Se você já tentou instalar antes e o sistema ficou sem materiais e
> sem produtos**, use o `CORRIGIR-AGORA.md` desta pasta.

---

## Antes de começar

Envie **todos os arquivos desta pasta** para o servidor, na sua pasta
pessoal (`/root`, normalmente).

---

## PARTE 1 — Subir a versão nova

**1.** Entrar na pasta do sistema:

```
cd /www/wwwroot/erp-grafica
```

**2.** Guardar a versão atual, por segurança:

```
cp -r .next ../next-backup-antes-3.68.1
```

**3.** Descompactar a versão nova:

```
tar -xzf ~/printflow-erp-v3.68.1.tar.gz -C /www/wwwroot/erp-grafica
```

**4.** Instalar as dependências:

```
npm ci
```

> **Não use `--omit=dev` aqui.** O TypeScript e o Tailwind são
> `devDependencies`, e o passo 7 (`npm run build`) precisa dos dois.
> Em 19/08/2026 essa instrução, escrita por mim neste mesmo arquivo,
> derrubou o site.

**5.** Aplicar o schema — cria a tabela de vendedores e as colunas
novas. **Não apaga nada:**

```
psql -U postgres -d app_db -f ~/schema-update.sql
```

> Antes este passo usava `npx drizzle-kit push`, que **não funciona**
> no painel do servidor: ele pede um terminal interativo e falha com
> *"Interactive prompts require a TTY"*. O arquivo acima faz o mesmo
> trabalho com um comando só.

**6.** Apagar o cache da versão antiga. **Este passo é obrigatório** —
sem ele o sistema continua usando o schema velho e dá erro de coluna
inexistente:

```
rm -rf .next
```

**7.** Gerar a versão de produção:

```
npm run build
```

**8.** Reiniciar:

```
pm2 restart printflow
```

**9.** Conferir:

```
pm2 logs printflow --lines 20 --nostream
```

Se aparecer `Ready`, está no ar. **Abra o sistema no navegador.** Se
carregar, siga para a parte 2.

---

## PARTE 2 — Trocar a base de demonstração pela real

> **Leia antes:** este passo **apaga** os produtos fictícios, os
> orçamentos e pedidos inventados, as vendas de teste e o financeiro de
> demonstração — **e também os clientes**. No lugar entra o que
> montamos: seus 56 materiais conferidos, os 27 produtos do catálogo com
> preço, o parque gráfico, as configurações e 4 exemplos em cada tela.
>
> **Se os clientes do servidor forem reais e você quiser mantê-los,
> me avise antes** — eu gero uma versão que não toca neles.
>
> O script faz backup completo antes de mexer em qualquer coisa.

**10.** Rodar o instalador:

```
bash ~/instalar-base-curada.sh
```

Ele vai:

1. **conferir se o schema está em dia** — se não estiver, ele para e
   avisa, sem tocar no banco;
2. mostrar o que existe hoje;
3. **pedir que você digite `CONFIRMO`**;
4. gravar o backup em `~/backup-antes-base-curada-<data>.sql`;
5. carregar a base nova;
6. **conferir se realmente carregou** — se vier vazio, ele avisa em vez
   de dizer que deu certo.

**11.** Reiniciar:

```
pm2 restart printflow
```

---

## Como saber se deu certo

No fim, o instalador tem de mostrar **exatamente isto**:

```
      clientes:    4
      produtos:    27
      materiais:   56
      impressoras: 6
      faixas:      110
      config:      124
```

Se produtos ou materiais vierem **0**, não funcionou — o script avisa e
mostra como voltar atrás.

---

## O que você vai ver depois

| Tela | O que aparece |
|---|---|
| Produtos | **27** — cópias, encadernação, fotos, cartões, panfletos, adesivos, copos e agenda |
| Estoque | **56** materiais, com código de barras |
| Impressoras | seu parque, com os custos corrigidos do plotter |
| Clientes | **4** — 2 com CPF, 2 com CNPJ, todos com endereço |
| Orçamentos | **4** — rascunho, enviado, aprovado, recusado |
| Pedidos | **4** — aguardando, em produção, pronto, entregue |
| PDV | **4** vendas — pix, dinheiro, crédito, débito |
| Financeiro | **4** lançamentos — 2 receitas e 2 despesas |
| Estoque (movimentos) | **4** — entrada, duas saídas e um ajuste |
| Compras | **4** — recebidas, pedida e rascunho |
| Clientes › Funil | **4** oportunidades, uma em cada etapa |
| Kanban | **4** cartões, um em cada coluna |
| Envios | **4** entregas — retirada, entrega, correios |
| Arte | **4** aprovações |
| Calendário | **4** agendamentos de produção |

**Todo módulo tem 4 exemplos**, para nenhuma tela abrir vazia. Cada um
traz "de exemplo" na observação — fácil de achar e apagar depois.

---

## Se algo der errado

**O sistema não abre depois da parte 1:**

```
cd /www/wwwroot/erp-grafica
rm -rf .next && cp -r ../next-backup-antes-3.68.1 .next
pm2 restart printflow
```

**Erro de "coluna não existe" depois do build:**

É cache. Repita os passos 6, 7 e 8 (`rm -rf .next`, `npm run build`,
`pm2 restart printflow`).

**Desfazer a troca da base:**

O instalador mostra o comando no fim. É este, com a data que ele
exibiu:

```
psql -U postgres -d app_db -f ~/backup-antes-base-curada-<data>.sql
```

---

## Novidades da v3.68.1

**Vendedores e comissão** — cadastro de vendedor, comissão sobre a
margem (não sobre o total) e extrato por período.

**CRM que sugere trabalho** — aniversariantes dos próximos 15 dias (só
de quem já comprou) e cadastros pela metade, ordenados por quanto o
cliente já gastou.

**Cadastros com máscara e validação** — cliente, fornecedor, vendedor e
o balcão. O fornecedor ganhou **endereço completo com busca por CEP**,
complemento, WhatsApp, site e inscrição estadual.

**CPF obrigatório, com bom senso** — exigido em todo cadastro; quem não
tem o documento na hora registra o motivo e a venda segue.

**Custos reais do plotter** — a lâmina e a base estavam erradas, e o A3
custava o dobro do A4 sem motivo. Agora o recorte custa R$ 0,26 por
folha, igual nos dois tamanhos.

**Catálogo completo** — 27 produtos em 7 categorias, com faixas
que barateiam conforme a quantidade. A cartela cheia custa R$ 12,90 em
todos os tamanhos.

**WhatsApp em Pedidos** — o aviso de andamento funciona também na tela
de pedidos, com prévia editável antes de enviar.
