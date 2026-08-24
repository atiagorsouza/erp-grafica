# SETUP-INFINITEPAY — cobrar e receber pelo ERP

> O módulo já está pronto (cobrança avulsa, por pedido, webhook com
> reconferência, tela de retorno). O que falta na maioria dos casos é
> **preencher 2 campos**. Este doc é o checklist.

---

## Os 2 campos que destravam tudo

**Painel de Controle → Configurações → Pagamentos (InfinitePay):**

| Campo | O que é | O que destrava |
|---|---|---|
| **InfiniteTag (handle)** | Seu usuário InfinitePay, **sem `$` e sem `@`** | Sem ele, toda cobrança falha: *"InfiniteTag não configurada"* |
| **URL pública do app** (`app_base_url`) | O endereço https:// que o **cliente** consegue abrir no navegador dele | Gera o `redirect_url` (pra onde a InfinitePay devolve o cliente após pagar) e o `webhook_url` (aviso automático de pagamento). **Sem isso o cliente paga e fica preso na tela da InfinitePay** — é o sintoma: "depois que o cliente paga não volta pro app" |

Preenchidos os 2, a cobrança nasce com:
- `redirect_url` = `{app_base_url}/pagamento/retorno` → cliente **volta
  e vê o comprovante**: valor pago, PIX ou cartão, parcelas, protocolo,
  link do comprovante InfinitePay
- `webhook_url` = `{app_base_url}/api/payments/webhook` → pagamento dá
  baixa sozinho (o webhook da InfinitePay não tem assinatura, então o
  ERP **reconfer tudo** na API antes de dar baixa — nunca confia no
  corpo do aviso)

Se quiser URLs diferentes das padrão, existem os campos avançados
`infinitepay_redirect_url` e `infinitepay_webhook_url` — em branco, o
ERP usa as derivadas de `app_base_url`.

## Por que a URL precisa ser PÚBLICA

Quem volta pra `/pagamento/retorno` é o **navegador do cliente**, e quem
chama `/api/payments/webhook` é o **servidor da InfinitePay**. Os dois
estão na internet — se o ERP só existe na rede da gráfica, nenhum dos
dois chega. Caminhos públicos necessários (só estes dois; o resto do
ERP continua protegido):

```
{app_base_url}/pagamento/retorno    ← tela do comprovante (GET)
{app_base_url}/api/payments/webhook ← aviso de pagamento (POST)
```

## Fluxo de teste (5 min)

1. Configurações → Pagamentos: InfiniteTag + URL pública → salvar
2. Cobranças → **Nova cobrança** → valor pequeno (R$ 1) → criar
3. Abrir o link de checkout, pagar no PIX (QR copia-e-cola)
4. Conferir:
   - voltou pra `/pagamento/retorno` com **"Pagamento confirmado!"**,
     valor, método PIX e protocolo?
   - em Cobranças, a cobrança virou **paga** sozinha (webhook)?
   - se o webhook atrasar, a própria tela de retorno reconference ao
     abrir — e o botão "Verificar" em Cobranças faz o mesmo
5. Cancelar/extornar o teste se for o caso

## Erros comuns

| Mensagem | Causa | Onde mexer |
|---|---|---|
| "InfiniteTag não configurada" | handle vazio | Configurações → Pagamentos |
| "InfiniteTag (handle) não informada ou inválida" | tag com `$`/`@`, ou digitada errada | o campo é a tag **limpa** |
| Cliente paga e não volta pro app | `app_base_url` vazio ou não público | ver acima |
| Pagou mas Cobranças segue "pendente" | webhook não chega (URL errada/fora do ar) | botão "Verificar" reconfere; conferir `app_base_url` |
| "URL pública não configurada" (banner em Cobranças) | `app_base_url` vazio | Configurações → Pagamentos |

## Taxas (campo "repassar ou absorver")

`infinitepay_fee_pix` / `_credit` / `_installment` e o modo
(`absorve`/`repassa`) só mudam o **valor cobrado** quando você escolhe
repassar — não afetam o fluxo de retorno. Configuração financeira, não
técnica.
