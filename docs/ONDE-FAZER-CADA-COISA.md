# Onde fazer cada coisa

Você perguntou: *"mas faço isso na pasta que está em produção agora?"*

**Não.** São três lugares diferentes, e misturar dá problema.

---

## Os três lugares

| Onde | O que é | O que se faz lá |
|---|---|---|
| **Seu computador** | Windows/Mac, com Git instalado | baixar o bundle · dar `git push` |
| **GitHub** | github.com/atiagorsouza/erp-grafica | guarda o histórico. Nada roda aqui |
| **Servidor de produção** | `/www/wwwroot/erp-grafica` (Debian, pm2) | o sistema no ar. Recebe o `.tar.gz` |

**O `git push` NÃO é feito no servidor.** O servidor não precisa de Git —
ele recebe um pacote pronto e roda. Se você rodar `git push` dentro de
`/www/wwwroot/erp-grafica`, ou não vai haver repositório, ou você vai
empurrar o estado do servidor por cima do trabalho novo.

---

## Parte A — Salvar o código (no SEU COMPUTADOR)

Isso não encosta no servidor. O sistema continua no ar o tempo todo.

**1.** Baixe do workspace para uma pasta qualquer do seu PC:

- `erp-grafica-COMPLETO.bundle`

**2.** Abra o terminal **nessa pasta do seu PC** e rode:

```bash
git clone erp-grafica-COMPLETO.bundle erp-grafica
cd erp-grafica
git log --oneline -1      # deve mostrar 8eb091d
```

**3.** Aponte para o GitHub e mande numa branch nova:

```bash
git remote remove origin
git remote add origin https://github.com/atiagorsouza/erp-grafica.git
git fetch origin
git push origin main:catalogo-v3.68.1
git push origin --tags
```

⚠️ **Numa branch, não na `main`.** O GitHub tem um commit `b481bb1` que
não existe aqui — alguém commitou direto lá. Push forçado na `main`
apagaria isso. Depois você abre o Pull Request no site e faz o merge
olhando o que muda.

---

## Parte B — Atualizar o sistema (NO SERVIDOR)

Só depois da parte A. Aí sim, na pasta de produção.

**Não zere nada.** O `schema-update.sql` cria o que falta e não apaga
coluna nem tabela. Atualizar por cima chega no mesmo resultado que
reinstalar do zero, com muito menos risco.

**1.** Envie para o servidor, na sua pasta pessoal (`/root`), o
**conteúdo** de `VTDIGITAL-3.68.1-COMPLETO.tar.gz`:

```
printflow-erp-v3.68.1.tar.gz
schema-update.sql
base-curada.sql
instalar-base-curada.sh
```

**2.** No servidor:

```bash
cd /www/wwwroot/erp-grafica
cp -r .next ../next-backup-antes-3.68.1
tar -xzf ~/printflow-erp-v3.68.1.tar.gz -C /www/wwwroot/erp-grafica
npm ci
psql -U postgres -d app_db -f ~/schema-update.sql
rm -rf .next
npm run build
pm2 restart printflow
```

⚠️ **`npm ci` sem `--omit=dev`.** TypeScript e Tailwind são
`devDependencies` e o `npm run build` precisa deles. Essa flag já
derrubou o site em 19/08.

**3.** Confira que subiu, antes de mexer no banco:

```bash
pm2 logs printflow --lines 20 --nostream
```

Abra o sistema no navegador. **Se carregar**, siga. Se não, volte:

```bash
rm -rf .next && cp -r ../next-backup-antes-3.68.1 .next
pm2 restart printflow
```

**4.** Só então troque a base:

```bash
bash ~/instalar-base-curada.sh      # ele pede: digite CONFIRMO
pm2 restart printflow
```

O script faz backup sozinho antes de tocar em qualquer coisa.

---

## Como saber se deu certo

No fim, o instalador tem de mostrar:

```
      clientes:    4
      produtos:    27
      materiais:   56
      impressoras: 6
      faixas:      110
      config:      124
```

**Se aparecer `produtos: 9`, o pacote errado subiu.** Foi o que
aconteceu no update anterior — 9 é o número da base velha, só adesivos.
Confira o nome do arquivo: tem de ser **3.68.1**.

Depois abra **Produtos** no navegador e conte: sete categorias, 27 itens.

---

## Sobre os clientes do servidor

A parte B, passo 4, **apaga os clientes que estiverem lá** e põe 4 de
exemplo no lugar.

Já perguntei três vezes e nunca tive resposta: **os clientes que estão
no servidor hoje são reais?** Se forem, **não rode o passo 4** — me
avise que eu gero uma versão do instalador que não toca em `customers`.

O backup do script salva tudo, então dá para recuperar. Mas é bem mais
simples não apagar.

---

## Resumo em uma linha

**Computador:** salva o código no GitHub.
**Servidor:** recebe o `.tar.gz` e atualiza — sem zerar, sem Git.
