# VTDIGITAL — atualização 3.60.0

Máscaras no cadastro da empresa e CEP com preenchimento automático.

---

## O que muda para você

### 1. Os números saem formatados no cupom

Na foto que você mandou, o cupom imprimia assim:

```
BANGU                              2120383504
SUPORTE.ADM@VTDIGITAL.COM.BR       2197886914
RIO DE JANEIRO -RJ                 3189224000154
```

Agora sai assim:

```
BANGU                              (21) 2038-3504
SUPORTE.ADM@VTDIGITAL.COM.BR       (21) 97886-9414
RIO DE JANEIRO -RJ                 30.189.224/0001-54
```

**Como funciona:** o banco guarda só os números, como você pediu, e a
formatação é aplicada na hora de mostrar. Isso vale para o cupom, o
orçamento e a ordem de produção ao mesmo tempo.

Vantagem de fazer assim: cadastro antigo, salvo com ou sem pontuação,
aparece certo sem precisar refazer nada.

### 2. Máscara enquanto você digita no Painel

Em **Configurações → Identidade da empresa**, agora os campos se formatam
sozinhos: CNPJ, telefones, WhatsApp, CEP e PIX.

O PIX é esperto: se você digitar um CPF ou CNPJ, ele formata; se for
e-mail ou chave aleatória, deixa como está — mascarar uma chave aleatória
a estragaria.

### 3. CEP vem antes do endereço e preenche sozinho

Antes o CEP era o 15º campo, depois de rua, número, bairro e cidade. Agora
ele vem primeiro: você digita os 8 dígitos e **rua, bairro, cidade e UF se
preenchem sozinhos**.

Número e complemento continuam manuais — o serviço de CEP não sabe esses.

### 4. "V A L O R  T O T A L" voltou a ter o espaço

No cupom estava saindo `V A L O R T O T A L`, grudado. O HTML junta
espaços repetidos em um só; agora usa espaço fixo e o destaque aparece
como no seu sistema antigo.

---

## Uma coisa que preciso te avisar

Comparando a foto com o que está no seu banco, **dois dados estão com um
dígito a menos**:

| Campo | No cupom | Deveria ser | Falta |
|---|---|---|---|
| CNPJ | `3189224000154` (13) | `30189224000154` (14) | o **0** do início |
| Celular | `2197886914` (10) | `21978869414` (11) | um **4** |

Isso **não é problema de máscara** — é o número errado gravado. Tanto que
o telefone fixo, que não tem dígito extra, saiu certo.

A causa mais provável é o valor ter passado por um campo numérico em algum
momento (zero à esquerda some em número), ou ter sido digitado incompleto.

**A nova versão protege contra isso:** se o CNPJ não for válido, ele sai
sem máscara em vez de virar `31.892.240/0015-4` — um número que não existe
mas *parece* certo. Erro visível é melhor que erro disfarçado.

**O que você precisa fazer depois de atualizar:** abrir
`Configurações → Identidade da empresa` e conferir CNPJ e Telefone 2. Com
a máscara nova, digitar errado fica difícil.

---

## Como instalar

```
cd /www/wwwroot
tar -xzf VTDIGITAL-3.60.0-COMPLETO.tar.gz
cd vtdigital-3.60.0
bash CONFERIR.sh

cd /www/wwwroot/erp-grafica
bash /www/wwwroot/vtdigital-3.60.0/deploy-auto.sh \
     /www/wwwroot/vtdigital-3.60.0/printflow-erp-v3.60.0.tar.gz
```

Esta versão já inclui as correções de deploy da 3.59.2 (backup que falhava
em silêncio, pacote escolhido sozinho, logo que não se atualizava).

Depois: `cat VERSION` deve dizer `3.60.0`.

Se algo sair errado: `bash socorro.sh --consertar`.
