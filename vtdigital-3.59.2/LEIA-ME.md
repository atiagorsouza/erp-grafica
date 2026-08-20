# VTDIGITAL — atualização 3.59.2

Esta versão conserta o **processo de atualização**. Não muda nada que você
vê na tela — muda o que aconteceu quando você tentou instalar a 3.59.1.

---

## Por que ela existe

Instalar a 3.59.1 levou cinco tentativas. Cada uma falhou por um motivo
diferente, e todos eram defeitos meus no script de deploy. Os quatro estão
corrigidos aqui.

### 1. O backup falhava sem dizer por quê

O script descobria a pasta do site olhando onde ele mesmo estava. Quando
você rodou o `deploy-auto.sh` que vem solto no pacote
(`/www/wwwroot/vtdigital-3.59.1/deploy-auto.sh`), ele concluiu que o site
era `/www/wwwroot` — a pasta de cima. O backup tentou copiar o lugar
errado, falhou, e a mensagem foi só "não consegui criar o backup".

**Agora** ele procura a pasta que realmente tem o sistema, e aceita
`--raiz /caminho` se você quiser mandar direto.

### 2. O erro do backup ficava escondido

A mensagem do sistema ia para o lixo (`2>/dev/null`). Justamente quando dá
problema, o script escondia a causa.

**Agora** ele mostra o erro real, a pasta que tentou usar, e o que
verificar (espaço em disco, permissão).

### 3. Ele escolhia o pacote sozinho

Rodando `bash deploy-auto.sh` sem dizer qual arquivo instalar, ele pegava o
mais recente que encontrasse — e encontrou o pacote **antigo** que já
estava no servidor. Reinstalou a 3.59.0 por cima da 3.59.0 e disse que
tinha dado certo.

**Agora**, se a versão do pacote for a mesma que já está no ar, ele para e
pergunta:

```
  ! a versão v3.59.2 JÁ está no ar.
  ! reinstalar vai derrubar o site por 1–2 min e não muda nada.
    Reinstalar mesmo assim? [s/N]
```

Isso evita o que aconteceu depois: um segundo deploy desnecessário derrubou
o site por cerca de 1 minuto.

### 4. A logo errada não era corrigida

Este é o que mais custou tempo. O `aplicar-logo.mjs` preservava qualquer
logo já gravada — proteção correta, para não sobrescrever a imagem que você
troca no Painel. Mas ela também congelava uma logo **errada**: o pacote
trazia o ícone corrigido, e o deploy mantinha o antigo.

**Agora o script distingue as duas situações:**

| Situação | O que acontece |
|---|---|
| Logo gravada pelo **deploy** e o pacote traz outra | atualiza sozinho |
| Logo que **você trocou no Painel** | intocada, só com `--forcar` |

Testei os dois casos antes de fechar. No primeiro, a logo errada de 32 KB
foi substituída pela correta de 21 KB sem nenhum comando extra. No segundo,
a imagem escolhida no Painel ficou como estava.

---

## Como instalar

Do jeito certo, passando o caminho do pacote:

```
cd /www/wwwroot
tar -xzf VTDIGITAL-3.59.2-COMPLETO.tar.gz
cd vtdigital-3.59.2
bash CONFERIR.sh

cd /www/wwwroot/erp-grafica
bash /www/wwwroot/vtdigital-3.59.2/deploy-auto.sh \
     /www/wwwroot/vtdigital-3.59.2/printflow-erp-v3.59.2.tar.gz
```

Agora funciona rodando de qualquer pasta — mas passar o caminho continua
sendo o mais seguro, porque não deixa margem para ele escolher errado.

Depois confira:

```
cat VERSION                          # 3.59.2
pm2 list                             # printflow · online
```

Se algo sair errado: `bash socorro.sh --consertar`.

---

## Uma coisa sobre o pm2

Em algum momento da instalação anterior o pm2 ficou sem processos e o
servidor foi iniciado à mão. Isso funciona, mas um processo iniciado
manualmente **não volta sozinho** se a máquina reiniciar.

Vale confirmar que está tudo no lugar:

```
pm2 list        # deve mostrar printflow como online
pm2 save
pm2 startup     # imprime uma linha para copiar e colar
```

O `pm2 startup` é o que garante o ERP subindo sozinho depois de uma queda
de energia.
