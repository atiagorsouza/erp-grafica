# VTDIGITAL — atualização 3.59.1

Correção do acabamento da marca e do cupom, mais uma trava que evita
o erro de banco que derrubou os três últimos updates.

---

## O que mudou

**1. O ícone da barra lateral agora é só o "VT"**
A imagem que estava lá era a logo inteira — "VT" + DIGITAL + ART
STUDIO — espremida num quadrado de 40 pixels. Virava um borrão. Agora
é só o símbolo, recortado, legível no tamanho pequeno. O nome da
empresa continua escrito ao lado, em texto, como já estava.

Os ícones de aba do navegador e de atalho no celular foram refeitos a
partir do mesmo símbolo.

**2. O cupom do PDV agora segue o do sistema antigo**
Comparei a foto que você mandou, medindo pela largura da bobina (80mm
nos dois). O que estava diferente e foi corrigido:

- **Letra maior.** No antigo cada caractere ocupa 1,82mm; o nosso
  estava com 1,74mm — cerca de 4% menor.
- **Linhas mais juntas.** O nosso estava mais arejado, gastando mais
  bobina e afastando o texto.
- **Rodapé à esquerda.** O agradecimento e a linha "DOCUMENTO NÃO
  FISCAL" estavam centralizados; no seu antigo é tudo alinhado à
  esquerda.
- **"V A L O R  T O T A L" espaçado**, como no antigo — que destaca o
  total espaçando as letras em vez de aumentar a fonte.
- **Coluna do R$ alinhada.** Os valores agora batem pela vírgula, um
  embaixo do outro.
- **Rodapé saía duas vezes.** Dá para ver na sua foto: o mesmo
  "Agradecemos pela preferência" aparece repetido no fim do cupom. Era
  bug — o campo de observações já vinha preenchido com o texto padrão,
  e ele era impresso de novo no rodapé. Agora sai uma vez só.

Antes de imprimir, dá para conferir o resultado em
`previa-cupom-3.59.1.html` (abre no navegador).

**3. A migração de banco deixou de depender de memória**
Você notou o padrão: a cada update, uma coluna nova faltava no banco e
alguma tela dava erro 500. Foi assim com `item_categories.parent_id`, e
foi assim nos três updates anteriores.

A causa: a lista de "o que o banco precisa ter" era **digitada à mão**
dentro do script de migração. Se alguém criasse uma coluna e esquecesse
de anotar ali, o deploy passava limpo e o erro só aparecia no seu uso.

Agora o script lê essa lista do próprio código — 42 tabelas e 21 tipos,
conferidos automaticamente — somada às tabelas criadas por SQL direto.
O que estiver no sistema é verificado, sem depender de ninguém lembrar.

Testei apagando de propósito a coluna `parent_id`, dois tipos e as duas
tabelas do WhatsApp: o script detectou os cinco e recriou todos, com as
chaves estrangeiras corretas, numa passada só.

---

## Como instalar

No terminal do servidor, na pasta onde você baixou este pacote:

```
bash CONFERIR.sh
tar -xzf printflow-erp-v3.59.1.tar.gz -C /tmp/vtdigital-novo
bash deploy-auto.sh
pm2 restart printflow-whatsapp && pm2 save
```

Se algo sair errado: `bash socorro.sh --consertar`.

---

## Uma coisa que preciso te avisar

Na versão anterior eu conferi a logo pelo tamanho do arquivo e pelo
código de resposta do servidor. Os dois deram certo — e mesmo assim a
imagem estava ilegível, como você viu. Peso de arquivo não prova que
uma imagem está boa.

Desta vez eu abri a imagem e olhei, inclusive simulada no tamanho de
40 pixels em que ela aparece na tela. Mas quem decide se está boa é
você: confira na barra lateral e imprima um cupom de teste ao lado de
um do sistema antigo.
