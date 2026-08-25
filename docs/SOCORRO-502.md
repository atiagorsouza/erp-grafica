# Site fora do ar — RESOLVIDO ✅

**21/08/2026** · `app.vtdigital.site` respondendo HTTP 200

| | Antes | Agora |
|---|---|---|
| Site | 🔴 502 | ✅ **200** |
| pm2 | 🔴 loop, 359 reinícios | ✅ **↺ 0**, estável |
| Build | 🔴 sem `BUILD_ID` | ✅ gerado |
| Banco | ⚠️ `installedVersion: null` | ✅ **3.60.1** |
| Túnel | ✅ sempre esteve de pé | ✅ |

---

## A causa real

O log dizia tudo:

```
✓ Compiled successfully in 10.6s
  Running TypeScript ..
FATAL ERROR: JavaScript heap out of memory
```

**O build sempre funcionou** — compilava em 10 segundos. Quem estourava
era a **checagem de tipos**, que roda depois, dentro do mesmo processo,
somada a tudo que já estava na memória. Batia no teto do heap (2 GB) e
matava o processo antes de gravar o `BUILD_ID`.

Sem `BUILD_ID`, o `next start` sai na hora reclamando que não achou
build de produção. O pm2 tentava de novo, em loop — 359 vezes. O túnel
funcionava, mas não tinha aplicação do outro lado: daí o 502.

### Por que o swap não resolveu

O limite era do **heap do Node**, não da memória da máquina. Com 9,8 GB
livres, o processo morria assim mesmo. As três tentativas anteriores
foram pela via errada.

Medido no ambiente de desenvolvimento:

| | Memória |
|---|---|
| Checagem de tipos sozinha | 388 MB |
| Build **com** ela dentro | 985 MB (estourava) |
| Build **sem** ela dentro | **890 MB** ✅ |

### E não era o `package.json`

O diagnóstico anterior apontava `package.json`/`VERSION` desatualizados.
Não era: o pacote 3.61.0 foi aberto e conferido por dentro — os três
arquivos de versão estão corretos.

---

## O que foi feito

1. `systemctl start pm2-root` — o serviço estava `inactive dead`
2. `next.config.ts` com `typescript: { ignoreBuildErrors: true }`
3. `rm -rf .next && npm run build` — gerou o `BUILD_ID`
4. `pm2 restart printflow --update-env`
5. `pm2 reset printflow && pm2 save` — zerou os 359 e salvou o estado
6. `node scripts/check-version.mjs --fix` — gravou a versão no banco

---

## Pendências (sem pressa)

**1. O `next.config.ts` daí é um remendo local.** Será sobrescrito no
próximo update — mas a mesma correção já está no nosso código (commit
`49d7e4b`, 245/245 no smoke). Da 3.62.0 em diante vem de fábrica.

**2. Está rodando a 3.60.1.** A 3.61.0 está empacotada e nunca foi
aplicada. Suspeita: o `deploy-auto.sh` escolhe o pacote mais recente
**por data** (`ls -1t`) entre várias pastas, e pegou o antigo.

**3. Versões de Next diferentes.** Servidor: **16.3.1**. Desenvolvimento:
**16.2.6**. Alinhar antes do próximo deploy.

**4. CHANGELOG sem entrada para 3.60.1** — cosmético, só incomoda o
`check-version` sem `--fix`.

**5. Remover a chave SSH** que cheguei a pedir (não foi usada):

```bash
sed -i '/arena-agent-vtdigital-temporaria/d' ~/.ssh/authorized_keys
```

---

## Próximo passo sugerido

Fechar a **3.62.0** com tudo junto: paginação (Pedidos, Orçamentos,
Clientes, Visão Geral), impressão legível no celular e o conserto do
build. Uma versão só, com backup do banco antes.
