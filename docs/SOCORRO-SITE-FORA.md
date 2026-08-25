# O site caiu — o que fazer

> **Correção de uma instrução minha.** No `DIAGNOSTICO-SERVIDOR.md` de
> 19/08 eu escrevi `npm install --omit=dev`. **Isso estava errado** e
> foi o que derrubou o site. Este documento substitui aquele trecho.

---

## Em uma linha

```bash
cd /caminho/do/erp && bash scripts/socorro.sh --consertar
```

O script diagnostica, conserta e confirma. Sem o `--consertar` ele só
olha e conta — não muda nada.

---

## O que aconteceu em 19/08/2026

O site ficou fora do ar depois de um deploy. A pasta `.next` existia,
mas **sem o `BUILD_ID`** — build pela metade. Sem esse arquivo o
`next start` sai no primeiro segundo, e o pm2 fica tentando subir em
loop até desistir.

**A causa foi `npm install --omit=dev`.**

O `--omit=dev` pula as `devDependencies`. Só que **TypeScript e
Tailwind estão lá**, e o Next precisa dos dois **para compilar**. Sem
TypeScript ele não resolve os atalhos `@/db`, `@/components/...` do
`tsconfig.json`, e o webpack morre numa cascata de "Module not found".

Reproduzi aqui para ter certeza:

```
npm install --omit=dev  &&  npm run build
→ Module not found: Can't resolve '@/db/schema'
→ Build failed because of webpack errors
→ .next/BUILD_ID: não existe
```

O `--omit=dev` é o certo para **rodar** em produção. É errado para
**construir** em produção. São dois momentos diferentes: constrói-se
com tudo, roda-se com o mínimo.

### Sobre o "exit 0"

Eu disse que o build falhava devolvendo sucesso. **Também estava
errado** — era artefato do meu teste: eu usei `npm run build | tail`, e
num pipe o shell devolve o código do *último* comando, o `tail`. O
`next build` sinaliza a falha corretamente. Fica o registro para não
te mandar caçar um bug que não existe.

---

## O jeito certo de fazer o deploy manual

```bash
cd /caminho/do/erp

# 1. limpar
rm -rf .next node_modules

# 2. instalar TUDO — sem --omit=dev
npm install

# 3. build
npm run build

# 4. CONFERIR — este é o passo que ninguém faz
ls -la .next/BUILD_ID        # tem que existir

# 5. subir
pm2 delete printflow 2>/dev/null
pm2 start npm --name printflow -- start
pm2 save                     # sem isto não volta depois de reboot

# 6. confirmar
curl -s localhost:3000/api/version
```

Deve responder `"version":"3.55.0","installedVersion":"3.55.0"`.

**Ou simplesmente use o `deploy-auto.sh`**, que faz tudo isso na ordem
certa, com backup antes e rollback automático se algo falhar.

---

## Se o build for morto por falta de memória

Sintoma no log: `Next.js build worker exited with code: null and
signal: SIGKILL` — sem nenhum erro de código antes.

Aconteceu comigo três vezes durante os testes. A solução:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile && sudo mkswap /swapfile
sudo swapon /swapfile
```

Para o swap sobreviver ao reboot:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

E uma regra prática: **derrube o servidor antigo antes de buildar**.
Dois Node competindo pela mesma RAM é o jeito mais comum de chegar no
SIGKILL.

---

## O que o `socorro.sh` verifica

| # | Verificação | Por que importa |
|---|---|---|
| 1 | O site responde? | E se código e banco estão na mesma versão |
| 2 | `BUILD_ID` e manifestos | Build pela metade é a causa nº 1 |
| 3 | TypeScript/Tailwind instalados | O erro do `--omit=dev` |
| 4 | Banco acessível | Distingue "app caiu" de "banco caiu" |
| 5 | pm2: processos e `errored` | Loop de restart |
| 6 | Memória e swap | Prevê o SIGKILL antes dele acontecer |

No fim ele imprime **o comando exato** para cada problema encontrado.

---

## Uma coisa que ainda precisa ser feita

O `pm2 list` não mostrou nenhum processo `printflow`. Se o app nunca
esteve sob o pm2, ele **não volta sozinho depois de um reboot** — e o
WhatsApp na 3101 provavelmente está na mesma situação.

Depois que o site voltar:

```bash
pm2 save
pm2 startup          # copie e cole o comando que ele imprimir
```

Sem esses dois, qualquer reinício da VPS derruba tudo de novo — e aí a
causa não vai ser build nenhum.
