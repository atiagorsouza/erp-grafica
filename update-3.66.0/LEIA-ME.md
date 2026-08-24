# VTDIGITAL ERP — atualização 3.66.0

**De:** 3.65.0 · **Para:** 3.66.0

Quatro frentes: orçamento sai por WhatsApp em um clique, chat de
atendimento reformado, código de barras no estoque e fornecedor de
verdade nos materiais.

---

## 1. Orçamento por WhatsApp — agora em um clique

**Antes:** Orçamentos → Imprimir → esperar a prévia A4 → WhatsApp →
abrir o WhatsApp Web → conferir o contato → enviar. Sete passos, e você
precisava abrir um documento A4 para mandar uma mensagem.

**Agora:** o ícone de WhatsApp está **na própria linha** da lista.
Clica, confere o texto, envia. A mensagem sai pelo serviço do sistema —
nada de WhatsApp Web.

E como o serviço grava tudo, **o envio aparece sozinho no histórico do
cliente**. Quem atender depois vê o que já foi mandado.

Se o WhatsApp estiver desconectado, a tela **avisa o motivo** e oferece
"Abrir no WhatsApp Web" — o caminho antigo vira saída de emergência,
não o padrão.

> Opt-out continua valendo: quem pediu para não receber não recebe,
> nem por envio manual.

---

## 2. Chat de atendimento

### A rolagem sem fim acabou

O chat trazia **200 mensagens de uma vez** numa caixa pequena. Conversa
de meses virava parede de texto.

Agora vem um lote de **30**, com o botão **"↑ Ver mensagens anteriores
(170 atrás)"**. E a área do chat tem altura fixa que acompanha a
janela — **a página em volta não rola mais junto**.

Detalhe proposital: a tela só desce sozinha quando **chega** mensagem
nova. Ao carregar o histórico você está lendo o passado; puxar para o
fim ali desfaria o que você pediu.

### Ficha e pedidos sem sair da conversa

Botão **"Ficha e pedidos"** mostra por cima do chat:

- Quanto o cliente **já comprou** (cancelados não contam)
- Os **últimos 5 pedidos** com status, valor e data de entrega
- Orçamentos em aberto, e-mail, cliente desde quando

Clicar num pedido abre ele. Antes era um botão que jogava você em
outra aba.

### Respostas rápidas

Sete atalhos para o que mais chega: **prazo, formas de pagamento,
endereço, pedir a arte, pedido pronto, já te respondo, saudação**.

Clica e o texto vai para o campo **com o nome do cliente já trocado**.
Vai para o campo em vez de sair direto — quase sempre você quer
completar alguma coisa.

Todas editáveis em **Painel → Mensagens**, grupo "Respostas rápidas do
chat".

### Modelos de campanha

Sete prontos, incluindo o **convite para ver o catálogo**:
reativação de cliente parado, novidade na produção, data comemorativa,
reposição para empresas, pós-venda e indicação.

Todos terminam em **pergunta**. "Te interessa?" tem resposta; "20% OFF"
não tem — e mensagem sem resposta é lida como spam pela plataforma.
Nenhum usa urgência falsa.

---

## 3. Código de barras — para a sua maquininha

O leitor funciona como teclado: **clica no campo e bipa**.

Entrou em **produtos e materiais**, no cadastro e na busca:

- **Estoque** ganhou campo de busca que aceita o código bipado
- Bipar um código conhecido mostra **só aquele item**
- Código desconhecido avisa: *"Nenhum material com o código X"*
- **Código repetido é recusado dizendo QUAL item já usa**

Esse último importa: com dois itens no mesmo código, bipar viraria
sorteio.

O campo limpa espaços que o leitor às vezes manda no fim — um código
com espaço nunca casaria na busca.

---

## 4. Fornecedor de verdade nos materiais

O cadastro de fornecedores **já existia** (Estoque → Fornecedores), mas
o material não se ligava a ele: o campo era texto livre. Então
"Kalunga", "kalunga" e "KALUNGA " viravam três fornecedores diferentes,
nenhum com CNPJ ou prazo.

Agora é uma **lista do cadastro real**. O texto antigo continua
visível, só de leitura, enquanto você não migrar — **nada do que já foi
digitado se perde**.

---

## 5. Validade do link de cadastro

Era **7 dias fixos no código**. Você reclamou, com razão: orçamento
enviado na sexta com link de 7 dias morre antes do cliente responder.

Agora é campo em **Configurações → Clientes & CRM**, de 1 a 90 dias.

---

## Como aplicar

```bash
# 1. Root e backup
sudo -i
cd /www/wwwroot/erp-grafica
/usr/lib/postgresql/17/bin/pg_dump "$DATABASE_URL" > ~/backup-antes-3.66.0-$(date +%F-%H%M).sql
ls -lh ~/backup-antes-3.66.0-*.sql

# 2. Abrir o pacote e CONFERIR ANTES
cd /caminho/onde/salvou
tar -xzf VTDIGITAL-3.66.0-COMPLETO.tar.gz
cd update-3.66.0
sha256sum -c printflow-erp-v3.66.0.tar.gz.sha256
tar -xzOf printflow-erp-v3.66.0.tar.gz ./VERSION      # TEM QUE IMPRIMIR 3.66.0

# 3. Aplicar com o caminho do ARQUIVO INTERNO
bash deploy-auto.sh "$PWD/printflow-erp-v3.66.0.tar.gz"

# 4. Conferir
cd /www/wwwroot/erp-grafica
curl -s http://127.0.0.1:3000/api/version
```

### Sobre o banco

Esta versão **cria três colunas novas** em materiais (`barcode`, `sku`,
`supplier_id`). O `deploy-auto.sh` faz isso sozinho.

**Testei exatamente o seu caso:** peguei um banco na 3.65.0, sem as
colunas, com material cadastrado e fornecedor digitado. Rodei a
migração: as colunas foram criadas e **o material continuou lá, com o
"Kalunga" e o estoque intactos**. A regra do migrador é só criar —
nunca apaga coluna, nunca altera tipo.

Se quiser conferir antes de aplicar:

```
node scripts/migrar-banco.mjs
```

Isso só **mostra** o que falta, sem mexer em nada.

---

## Verificação desta versão

- Smoke: **288 → 289** checks (eram 277 na 3.65.0)
- Typecheck limpo · lint 11 (mesmo de antes) · build gera `BUILD_ID`
- Telas conferidas em navegador real: envio de orçamento, chat com 200
  mensagens, ficha do cliente, atalhos e leitor de código de barras

---

## O que continua em aberto

- **InfinitePay** — você está pegando as credenciais
- **Tabela de preços em PDF por categoria** (com catálogo)
- **Painel do Cliente** — app à parte, ainda a desenhar
- **Calendário** — você está pensando na função dele
- **NIIMBOT** — imprimir etiqueta direto, sem CSV
