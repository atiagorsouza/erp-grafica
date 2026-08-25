# VTDIGITAL — Atualização v3.68.2

> Leia uma vez antes de subir. São 3 comandos — o `deploy-auto.sh`
> faz o resto sozinho (backup → extrai → dependências → build →
> migrações → sobe → verifica → volta atrás se falhar).

---

## O que vem nesta versão

1. **Unidade de venda (cartela)** — a Consulta Rápida agora diz
   "por cartela · 60 un" no card e o texto copiado pro WhatsApp mostra
   as unidades de cada faixa (`2 — R$ 11,75 cada (R$ 23,50) (120
   unidades)`). Cadastro do produto ganhou o bloco "Unidade de
   venda". Os 9 adesivos já vêm marcados como cartela.
2. **Pagamento com comprovante** — depois de pagar na InfinitePay o
   cliente **volta pro sistema** e vê o comprovante completo: valor,
   PIX/cartão, parcelas, protocolo e comprovante. A URL pública
   (`https://app.vtdigital.site`) é **preenchida sozinha** pela
   migração se estiver vazia — sua InfiniteTag não é mexida.
3. **Proteções do incidente** — update **sem backup restaurável
   aborta**; o instalador da base curada **não apaga banco sem backup
   conferido**. (Detalhes: `docs/INCIDENTE-2026-08-24.md`.)

## Como subir

**1.** Envie o `printflow-erp-v3.68.2.tar.gz` para a pasta pessoal do
servidor (`/root` normalmente), pelo gerenciador de arquivos.

**2.** Entre na pasta do sistema e rode o deploy **com o caminho do
pacote** (nunca sem — sem caminho ele escolhe por data e pode instalar
a versão errada):

```
cd /www/wwwroot/erp-grafica
bash scripts/deploy-auto.sh ~/printflow-erp-v3.68.2.tar.gz
```

**3.** Quando terminar, confira a versão:

```
curl -s http://127.0.0.1:3000/api/version
```

Tem que responder **3.68.2**.

## Teste de 5 minutos depois de subir

1. **`/consulta-preco`** — adesivos mostram `por cartela · 60 un`
   embaixo do preço; botão copiar → texto com `(120 unidades)`
2. **Configurações → Pagamentos** — InfiniteTag continua a sua;
   **URL pública** agora mostra `https://app.vtdigital.site`
3. **Cobrança de teste (R$ 1 no PIX)** — Cobranças → Nova cobrança →
   pagar pelo link → o cliente tem que **voltar sozinho** pro
   comprovante e a cobrança virar **paga sozinha** (webhook)
   - Se o cliente bater numa tela de login da Cloudflare ao voltar:
     falta o *bypass* das rotas públicas — passo 4 do
     `docs/SETUP-CLOUDFLARE-TUNNEL.md`
4. **`/produtos`** — abrir um adesivo → bloco "Unidade de venda"
   preenchido (cartela + quantidade)

## Se algo der errado

```
bash scripts/socorro.sh --diagnostico
```

O `deploy-auto.sh` guarda backup e volta atrás sozinho se a subida
falhar. **Não** rode `instalar-base-curada.sh` para consertar update —
aquilo troca a base inteira (é o que causou o incidente de 24/08; ele
está mais seguro agora, mas continua sendo outra ferramenta).
