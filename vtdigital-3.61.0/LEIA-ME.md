# VTDIGITAL — atualização 3.61.0

Uso no celular. O achado principal explica por que você viu "tantos erros".

---

## O problema de fundo: não existia menu no celular

Você disse que viu vários erros de layout e que "o menu só tem alguns"
itens. Fui atrás e a causa é mais simples — e mais séria — do que parecia:

**Abaixo de 1024px de largura, o sistema não tinha menu nenhum.**

- A barra lateral é `hidden … lg:flex` — ou seja, **some** no celular
- Existia um componente de menu mobile no projeto, mas ele **nunca foi
  ligado em lugar nenhum**: era código morto
- A barra de cima não tinha botão de menu

Resultado prático: no telefone só dava para chegar nas telas que
estivessem linkadas no conteúdo da página. Estoque, Clientes,
Configurações, Relatórios — inalcançáveis. Não é que o menu tinha
"alguns" itens: **não havia menu**, e você navegava pelos atalhos soltos
que apareciam pela frente.

### O que fiz

Um menu de gaveta de verdade, com o botão ☰ na barra de cima:

- **As 18 telas**, nos mesmos grupos do computador (Operação, Motor de
  Produção, Gestão)
- Fecha ao escolher a tela, ao tocar fora, no X ou apertando Esc
- O fundo não rola junto enquanto está aberto
- Alvos de toque de 44px — abaixo disso o dedo erra

**Detalhe que evita o problema voltar:** a lista de telas agora vive num
arquivo só, lido pelos dois menus. Antes, se eu copiasse a lista para o
celular, o próximo módulo novo entraria no computador e esqueceria do
telefone. Agora não tem como ficarem diferentes.

O componente morto foi removido. Ele também tinha um defeito: gravava a
função de abrir numa variável global no meio da renderização, o que não
funciona de forma confiável no React moderno.

---

## Também corrigido

**Tabelas que travavam.** Duas listagens (histórico de vendas do PDV e
prévia de importação de clientes) não tinham rolagem lateral: no celular
o conteúdo era cortado sem como alcançar. Agora rolam de lado.

**Blocos de 3 e 4 colunas espremidos.** Seis lugares mostravam 3 ou 4
colunas mesmo num celular de 360px — cada uma ficava com ~80px, ilegível.
Agora viram 1 ou 2 colunas no telefone e voltam ao normal na tela grande.

Os documentos impressos (orçamento A4, cupom 80mm) **não foram tocados** —
lá as 4 colunas são corretas, porque o papel tem largura fixa.

---

## Como instalar

```
cd /www/wwwroot
tar -xzf VTDIGITAL-3.61.0-COMPLETO.tar.gz
cd vtdigital-3.61.0
bash CONFERIR.sh

cd /www/wwwroot/erp-grafica
bash /www/wwwroot/vtdigital-3.61.0/deploy-auto.sh \
     /www/wwwroot/vtdigital-3.61.0/printflow-erp-v3.61.0.tar.gz
```

Depois abra no celular e toque no ☰ no canto superior esquerdo.

---

## O que eu não consegui testar

Preciso ser honesto sobre o limite desta varredura: **não consegui rodar
um navegador de verdade aqui** para medir a página renderizada. Tentei
instalar o Chromium no ambiente e faltaram bibliotecas do sistema.

O que fiz foi analisar o HTML de cada uma das 18 telas procurando os
padrões que estouram numa largura de 360px. Isso encontra o que listei
acima com segurança, mas **não detecta**:

- texto que fica pequeno demais para ler
- botão que escapa da borda por causa de margem
- sobreposição entre elementos
- teclado do celular cobrindo o campo em uso

Ou seja: os problemas estruturais estão resolvidos, mas pode haver
detalhes visuais que só aparecem no uso real.

**Se puder, ao testar no telefone me mande print do que ainda estiver
errado** — mesmo sem anotar, a foto da tela já me diz onde olhar. Com o
menu funcionando, agora dá para percorrer todas as telas.
