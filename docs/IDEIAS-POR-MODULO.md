# Varredura dos módulos — o que dá para acrescentar

**Nada foi implementado.** Isto é lista para você escolher, riscar ou ignorar.

Passei módulo por módulo procurando o que falta. Marquei cada item com
esforço (P/M/G) e com uma nota honesta sobre valor real para a VTDIGITAL.

---

## Antes: a resposta sobre a NIIMBOT B1

**Não existe nada de NIIMBOT no sistema hoje.** Procurei: zero menção.

O que existe é o campo `barcode` no cadastro de produto — mas ele só serve
para **buscar** produto no PDV (bipar e achar). Não gera nem imprime
etiqueta nenhuma.

### Dá para integrar? Sim, e melhor do que eu esperava

A B1 é fechada, mas a comunidade fez engenharia reversa do protocolo.
Existe uma biblioteca em TypeScript, **niimbluelib**, que fala com a
impressora **direto do navegador** via Web Bluetooth — sem instalar
programa, sem servidor de impressão. O B1 está na lista de modelos
suportados.

Isso significa que daria para, do próprio ERP:

- Etiqueta de **produto** — nome, preço, código de barras (para bipar no PDV)
- Etiqueta de **material** no estoque — nome, lote, mínimo
- Etiqueta de **pedido** — número da OS, cliente, prazo, colada na embalagem
- Etiqueta de **envio** — destinatário

### Três ressalvas que preciso deixar claras

1. **A biblioteca avisa que é para fins educacionais** e "não destinada a
   uso comercial sem consentimento do fabricante". Isso é decisão sua, não
   técnica. Vale saber antes.
2. **É alpha** — a própria página recomenda travar a versão exata, porque a
   API muda.
3. **Web Bluetooth não funciona no iPhone.** No Safari do iOS não existe.
   Funciona em Chrome no Android, Windows, Mac e Linux. Se você imprime do
   iPhone, esse caminho não serve.

**Alternativa sem essas ressalvas:** gerar a etiqueta como **imagem/PDF no
tamanho certo** (ex.: 50×30mm) e você imprimir pelo aplicativo oficial da
NIIMBOT. Menos automático, mas sem depender de biblioteca alpha, sem
questão de licença, e funciona em qualquer celular.

**Minha sugestão:** começar pelo gerador de etiqueta (imagem/PDF), que é
útil de qualquer jeito, e só depois avaliar a impressão direta.

---

## O que achei em cada módulo

### PDV · Frente de Caixa *(o mais maduro — 3.082 linhas, 45 ações)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Etiqueta de produto** (código de barras) | M | Sim — fecha o ciclo com o `barcode` que já existe mas ninguém alimenta |
| **Venda em espera** — segurar um carrinho e atender outro cliente | M | Sim, se acontece de o cliente sumir pra buscar dinheiro |
| **Atalhos de teclado** (F2 buscar, F4 finalizar) | P | Só se você usa muito no computador |
| Modo offline (vender sem internet) | G | Provavelmente não vale o risco |

### Pedidos & OS *(1.961 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Anexar a arte ao pedido** | M | **Sim — esta é a maior lacuna que achei.** Hoje não existe onde guardar o arquivo do cliente. A arte vive no WhatsApp e se perde |
| **Etiqueta da OS** para colar no serviço | P | Sim, casa com a NIIMBOT |
| **Duplicar pedido** ("o mesmo de antes") | P | Sim — cliente recorrente é comum em gráfica |
| Histórico de alterações do pedido | M | Só se houver discussão sobre "eu não pedi isso" |

### Orçamentos *(1.424 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Página pública do orçamento** (aprovar/pedir ajuste) | G | Já estava na sua lista — é o item nº 3 da frente comercial |
| **Enviar por WhatsApp com prévia editável** | M | Idem, item nº 4 |
| **Orçamento vira pedido em um clique** | P | Verificar se já existe; se não, é barato e útil |
| **Aviso de orçamento vencendo** | P | Sim — recupera venda que ia esfriar |

### Clientes & CRM *(1.462 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Barra de cadastro completo** + convite | M | Já desenhado no `RABISCO-COMUNICACAO.md` |
| **Aniversário do cliente** | P | Você já tem o campo; falta usar |
| **Importar os 200 de planilha** | M | Sim — mas roda no seu servidor, não aqui |
| **"Cliente sumiu"** (não compra há X meses) | M | Bom para reativar sem gastar disparo à toa |

### Estoque & Compras *(635 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Etiqueta de material** | P | Casa com a NIIMBOT |
| **Lista de compras automática** (abaixo do mínimo) | M | Sim — depende da sua contagem estar em dia |
| **Entrada por nota do fornecedor** | G | Só quando o volume justificar |
| Inventário guiado pelo celular | M | Ajudaria justamente a contagem que você vai fazer |

### Produtos & Custos *(1.031 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Tabela de preços em PDF** | M | **Sim — você já pediu.** É o motivo declarado da taxonomia |
| **Catálogo do cliente** | G | Idem, a outra metade do pedido |
| **Variações de produto** | M | Sim — resolve as 8 caixinhas viram 1 (ver `CATALOGO-VTDIGITAL.xlsx`) |
| Simulador "e se o material subir 10%?" | M | Útil, mas depois dos preços revisados |

### Financeiro *(632 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Fluxo de caixa previsto** (a receber × a pagar) | M | Sim — com 50/50 você tem saldo futuro previsível |
| **Conciliar com o extrato** | G | Depois |
| **Exportar para o contador** | P | Sim, se ele pede planilha todo mês |

### Relatórios *(380 linhas — só 2 botões)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Produto que mais dá lucro** (não o que mais vende) | M | Sim — decide onde focar |
| **Cliente por faturamento** | P | Sim, barato |
| **Comparar mês a mês** | P | Sim |
| Relatório por e-mail toda segunda | M | Depois do módulo de e-mail |

### Kanban *(358 linhas)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Alerta de atraso** no card | P | Sim — prazo é o que mais dói em gráfica |
| **Tempo em cada etapa** | M | Mostra onde a produção trava |

### Dashboard *(503 linhas, 0 ações)*

| Ideia | Esforço | Vale? |
|---|---|---|
| **Blocos clicáveis** (ir do número para a lista) | P | Sim — hoje é só leitura |
| **O que fazer hoje** (entregas, cobranças, orçamentos vencendo) | M | Sim, seria a tela de abrir o dia |

---

## Três coisas que valem para o sistema inteiro

**1. Nenhuma listagem tem paginação.** Verifiquei: Clientes, Pedidos,
Produtos e Estoque carregam **a tabela inteira** de uma vez. Com 21
clientes ninguém nota. Com os seus 200 — e daqui a um ano com 2.000
pedidos — a tela vai demorar a abrir, principalmente no celular. Esforço M,
e é o tipo de coisa que dói quando já é tarde.

**2. Só Relatórios exporta.** Nenhuma outra tela deixa você levar os dados
para uma planilha. Esforço P por tela.

**3. Não existe onde guardar arquivo.** Nem arte do cliente, nem
comprovante de pagamento, nem foto do produto pronto. Numa gráfica isso é
o item mais estranho de faltar — a arte é o coração do pedido. Esforço M
(precisa decidir onde os arquivos ficam: disco do servidor ou serviço
externo).

---

## Se eu tivesse que escolher três

1. **Anexar arte ao pedido** — é a lacuna mais séria para uma gráfica.
2. **Tabela de preços em PDF** — você já pediu e a taxonomia já está pronta.
3. **Etiquetas** (gerar imagem primeiro, NIIMBOT depois) — resolve produto,
   estoque e OS de uma vez.

Nada disso entra sem você escolher. Me diz quais e eu desenho antes de
implementar, como combinamos.
