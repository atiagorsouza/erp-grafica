# Onde está cada coisa

Índice da pasta de trabalho. Se você não lembra onde algo ficou,
comece por aqui.

---

## 📦 O pacote para instalar no servidor

**`VTDIGITAL-3.66.0-COMPLETO.tar.gz`** — é este que você baixa e sobe.

Dentro dele: o sistema, o `deploy-auto.sh`, as logos e o **LEIA-ME**
com o passo a passo.

> A versão em produção hoje é a **3.65.0**. A 3.66.0 está pronta e
> ainda não foi aplicada.

Para ler as instruções sem baixar: **`update-3.66.0/LEIA-ME.md`**

---

## 🔴 Quando o site cair

| Arquivo | Quando usar |
|---|---|
| **`SOCORRO-SITE-FORA.md`** | O site não abre |
| **`SOCORRO-502.md`** | Aparece erro 502 |
| **`MANUAL-DO-PROGRAMADOR.md`** | Antes de qualquer deploy — as 5 regras |

---

## 📓 O diário do projeto

**`ONDE-ESTAMOS.md`** — o histórico completo: o que foi feito, quando,
por quê, e o que ficou em aberto. **É o primeiro arquivo a abrir**
quando retomamos depois de uns dias.

---

## 📋 Regras do negócio

Coisas que você me ensinou e eu consulto o tempo todo:

| Arquivo | O que tem |
|---|---|
| `POLITICAS-X-SISTEMA.md` | As três regras de contato, 50/50, desconto PIX |
| `PRAZOS-COMO-RESOLVER.md` | Como o sistema calcula prazo de entrega |
| `BRINDES-E-EXCECOES.md` | Kit de bottons, brindes por cor/modelo |
| `KONICA-FAIXAS-REAIS.md` | O que a Konica faz de verdade |
| `TABELAS-GRANDE-FORMATO.md` | Vinil, lona, DTF — o que é próprio e o que é terceirizado |
| `ARVORE-CATEGORIAS.md` | A taxonomia que você aprovou |

---

## 🚧 Frentes em aberto

| Arquivo | Situação |
|---|---|
| `IDEIAS-POR-MODULO.md` | Lista de melhorias possíveis, módulo a módulo |
| `AUDITORIA-3.62.0.md` | Problemas achados; #4 a #7 ainda abertos |
| `PLANO-PAGINACAO.md` | Faltam PDV, Estoque e Financeiro |
| `PROPOSTA-CATALOGO.md` | Base para a tabela de preços em PDF |
| `MAPA-DO-QUE-DA-PRA-FAZER.md` | O que dá e o que não dá, com esforço |

**Também em aberto, ainda sem arquivo:** InfinitePay (você está pegando
as credenciais), Painel do Cliente, função do Calendário, NIIMBOT.

---

## 📊 Suas planilhas

**`planilhas/`**

- `CATALOGO-VTDIGITAL.xlsx` — 229 itens, você ia ajustar os preços
- `CONTAGEM-ESTOQUE.xlsx` — para a contagem física

---

## 💻 O sistema

**`erp-grafica/`** — o código. Versão **3.66.0**, tag `v3.66.0`.

---

## 🗄️ Arquivo morto

**`arquivo/`** — nada aqui foi apagado, só saiu da frente.

| Pasta | O que tem |
|---|---|
| `arquivo/documentos/` | Rabiscos de coisas já implantadas, prints antigos, propostas fechadas |
| `arquivo/versoes/` | Pacotes de versões antigas — ainda instaláveis |
| `arquivo/banco/` | Backups do banco (contêm dados de cliente) |
| `arquivo/insubstituivel/` | **Não apagar.** A 3.20.0, que não dá para reconstruir |

---

## 🔧 Pastas de sistema

`pgdata` · `pgsock` (banco de teste) · `release` (pacotes gerados) ·
`logos` · `uploads` (o que você me manda) · `update-3.65.0` (versão
anterior, para voltar atrás se precisar)

---

## Para arrumar de novo

Quando a pasta encher outra vez:

```
bash organizar.sh              # mostra o que faria
bash organizar.sh --aplicar    # arruma
```

Ele arquiva o que envelheceu e **descarta só os prints de teste meus**
(`wa-*`, `bc-*`, `wz-*`, `orc-*`). O que é seu nunca é apagado.
