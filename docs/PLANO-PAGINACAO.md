# Plano — paginação e busca no servidor

**Nada implementado.** Desenho para você aprovar.

Base: **125 pedidos/mês** (você informou 100–150) e **você usa busca para
achar registro antigo**.

---

## 1. Por que isso importa agora

Com o seu volume:

| Daqui a | Pedidos | Vendas no PDV | Movimentos de estoque |
|---|---|---|---|
| 6 meses | 750 | 1.500 | 2.250 |
| 1 ano | 1.500 | 3.000 | 4.500 |
| 2 anos | 3.000 | 6.000 | 9.000 |
| 5 anos | 7.500 | 15.000 | 22.500 |

Hoje a tela de Pedidos carrega **todos** de uma vez. Em 1 ano isso é
**~2,2 MB de HTML** a cada abertura; em 2 anos, 4,4 MB. No computador da
loja você percebe como lentidão; no celular, como tela que não abre.

Não é problema hoje — é problema marcado para daqui a uns 8 meses. Por
isso vale fazer agora, enquanto é barato.

---

## 2. O que a varredura encontrou

Fui em todas as 18 telas. O problema é maior do que "listagens sem
paginação": existe um arquivo compartilhado, `lib/queries.ts`, com **16
funções de consulta — só 1 limita resultados**. Várias telas puxam tabela
inteira por esse caminho comum.

| Situação | Telas |
|---|---|
| Já limitam | Cobranças, Envios, PDV |
| Puxam tudo, direto | Clientes (7 consultas), Pedidos (6), Orçamentos (4), Produtos (3) |
| Puxam tudo, via `queries.ts` | Estoque, Serviços, Tabelas de Preços, Impressoras |
| **Pior caso** | **Visão Geral — 12 consultas, nenhuma limitada** |

A Visão Geral é a tela que você mais abre, e é a que mais carrega.

**Achado extra:** a busca hoje acontece **no navegador**. Ela filtra a
lista que já foi carregada — só funciona porque tudo veio junto. Quando
paginarmos, a busca precisa ir para o banco, senão você passa a achar
apenas dentro da página atual. Como você disse que usa busca para achar
registro antigo, isso é obrigatório, não opcional.

---

## 3. O que eu faria em cada tela

"Rever o sistema todo" não significa paginar tudo. Significa **verificar
tudo** e paginar onde muda alguma coisa.

### Grupo A — paginar + busca no servidor

| Tela | Por quê |
|---|---|
| **Pedidos & OS** | 1.500/ano — o mais crítico |
| **Clientes & CRM** | seus 200 + os que entrarem |
| **Orçamentos** | acompanha os pedidos |
| **PDV — histórico de vendas** | ~3.000/ano |
| **Estoque — movimentos** | o que mais cresce (4.500/ano) |
| **Financeiro — lançamentos** | idem |

Como fica: **50 registros por página**, com busca que consulta o banco e
filtros (período, situação) também no servidor.

### Grupo B — não paginar, mas corrigir

| Tela | O que muda |
|---|---|
| **Visão Geral** | as 12 consultas viram contagens (`COUNT`) no banco, em vez de trazer todas as linhas para contar no JavaScript |
| **Kanban** | por natureza mostra só o que está em produção; limitar aos últimos 90 dias resolve |
| **Relatórios** | já agrega no banco; só conferir |

### Grupo C — deixar como está

Impressoras, Serviços, Tabelas de Preços, Configurações, Calendário,
Categorias.

São listas que não crescem — no máximo algumas dezenas de itens. Paginar
ali só atrapalharia. **Vou verificar cada uma e registrar, mas não mexer.**

---

## 4. Detalhes que decidem se vai funcionar

**Índices no banco.** Hoje só existem índices de unicidade (CPF, telefone,
SKU). Buscar por *nome do cliente* ou *número do pedido* varreria a tabela
inteira a cada tecla digitada — o que deixaria a busca mais lenta que o
problema que estamos resolvendo. Preciso criar índices próprios de busca.

**Busca enquanto digita.** Com a busca no servidor, cada letra vira uma
consulta. Sem cuidado, digitar "padaria" dispara 7 consultas. A solução é
esperar ~300ms de pausa antes de consultar.

**Não perder o filtro ao voltar.** Se você busca um cliente, entra na
ficha e volta, a lista precisa estar como estava. Isso significa guardar
busca/página no endereço da tela.

**Contagem total.** Mostrar "página 1 de 30" exige um `COUNT` a cada
consulta. Em tabela grande isso pesa. Alternativa: "mostrando 50 de
muitos" com botão *Carregar mais*. Menos preciso, bem mais rápido.

---

## 5. Uma decisão sua

Dois modelos, e o certo depende de como você usa:

**(a) Páginas numeradas** — 1, 2, 3… no rodapé.
Melhor para conferência ("estava na página 3").

**(b) Carregar mais** — botão que acrescenta os próximos 50.
Melhor no celular, rola direto. É o padrão de aplicativo.

**Minha sugestão: (b) no celular e (a) no computador** — a mesma tela,
comportamento diferente conforme o tamanho. Custa pouco a mais e cada um
fica bom no seu lugar.

---

## 6. Ordem que eu seguiria

1. **Índices de busca** no banco *(sem isso o resto fica lento)*
2. **Pedidos** — o mais crítico, e serve de modelo
3. **Clientes** — o que você mais busca
4. **Visão Geral** — trocar as 12 consultas por contagens
5. **Orçamentos, PDV, Estoque, Financeiro**
6. **Verificar o Grupo C** e registrar que não precisa

Cada etapa entra funcionando por conta própria — dá para parar no meio sem
deixar nada quebrado.

---

## 7. O que preciso de você

1. **Páginas numeradas, "carregar mais", ou o misto que sugeri?**
2. **50 por página está bom?** Posso deixar ajustável no Painel.
3. **Faço tudo de uma vez ou entrego por partes** (Pedidos primeiro, você
   testa, seguimos)?

Recomendo por partes: se algo sair diferente do esperado, corrige cedo.
