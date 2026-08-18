# BOPP, tempo de máquina, 3D e recorte (v3.39.0)

## 1. BOPP — etiqueta é material, geometria é formato

> "Bopp etiqueta tem transparente ou com cor e formatos e tamanhos. Mas
> geralmente é comprado o rolo ex: 5x5 cm 26 metros."

A separação que já existia funciona aqui sem mudança de código:

- **Material** (estoque) = substrato + tamanho → preço do rolo
- **Formato** (impressora) = `feedMm` + `columns` → consumo de ribbon

O rolo de 26 m confirma a geometria de 2 colunas:
`26.000 mm ÷ 52 mm × 2 = 1.000 etiquetas` ✔

| Material | Rolo | Un | R$/un ⚠️ |
|---|---|---|---|
| BOPP Transparente 5×5 | 26 m · 1.000 un | unidade | 0,0850 |
| BOPP Branco 5×5 | 26 m · 1.000 un | unidade | 0,0750 |
| BOPP Prata/Metalizado 5×5 | 26 m · 1.000 un | unidade | 0,1100 |
| BOPP Transparente 4×4 | 26 m · 1.238 un | unidade | 0,0687 |
| BOPP Transparente 10×5 | 26 m · 500 un | unidade | 0,1700 |

⚠️ Preços estimados — confirmar.

**Detalhe que o modelo captura:** o 10×5 sai **2× mais caro por unidade**
que o 5×5, embora o rolo custe o mesmo — 26 m rendem metade das
etiquetas em coluna única. Antes da v3.36.0 isso passaria despercebido.

Para cada cor/tamanho novo: cadastrar o material com a embalagem
(`packQuantity` = etiquetas do rolo) e o custo unitário sai sozinho.

---

## 2. 🔴 Tempo de máquina — a lacuna que faltava fechar

Sinalizada desde a primeira auditoria do parque, agora implementada.

### O problema

Uma peça de 50 g na Bambu Lab A1:

- filamento + bico = **R$ 6,17**
- ocupação da máquina = **8 horas**

O motor cobrava R$ 6,17 e a impressora trabalhava de graça o dia
inteiro. Em 3D e recorte o insumo é barato; o **tempo é o produto**.

### A solução

| Onde | Campo | Significado |
|---|---|---|
| Impressora | `hourlyRate` | valor da hora de máquina |
| Produto | `machineMinutes` | minutos por unidade |

```
custo de tempo = (minutos ÷ 60) × valor-hora × cópias
```

Entra como linha própria no breakdown ("Tempo de máquina · 8h × R$ 8,00/h").

**Só é cobrado quando a impressora tem valor-hora E o produto declara
minutos.** As máquinas que cobram por página seguem idênticas — Konica,
Epson, sublimática e Elgin têm `hourlyRate = 0` e nada mudou nelas.

O campo "Minutos de máquina" **só aparece na tela** quando a impressora
escolhida tem valor-hora, para não poluir o cadastro das outras.

### Valores adotados ⚠️

| Máquina | R$/h | Racional |
|---|---|---|
| Bambu Lab A1 | 8,00 | roda sozinha; depreciação + energia + ocupação |
| Silhouette Cameo 5 | 15,00 | exige operador acompanhando o corte |

Ambos **precisam do seu ajuste** — são a variável que mais mexe no preço
final desses produtos.

---

## 3. Produtos criados

| Produto | Material | Tempo | Custo | Venda |
|---|---|---|---|---|
| Peça 3D PLA 50 g | R$ 6,17 | 8h = R$ 64,00 | R$ 70,17 | **R$ 251,68** |
| Chaveiro 3D 8 g | R$ 0,99 | 40min = R$ 5,33 | R$ 6,32 | **R$ 22,67** |
| Recorte adesivo A4 | R$ 0,25 | 12min = R$ 3,00 | R$ 3,25 | **R$ 8,58** |

Na peça de 50 g o **tempo é 91% do custo**. Sem ele o produto sairia por
cerca de R$ 22 — 8 horas de máquina por menos que o preço de um chaveiro.

### Silhouette: o custo continua dominado pela base

Mesmo com valor-hora, o insumo do recorte é a **base de corte**
(R$ 90 ÷ 500 usos = R$ 0,18 de R$ 0,25). A vida útil real da base muda
o número — vale anotar quantos cortes a sua aguenta.

---

## Validação

- `typecheck` ✔ · `build` ✔ · `e2e:smoke` **179** ✔
- `/impressoras`, `/produtos`, `/estoque`, `/pdv` → 200 ✔
- `lint` — 11 problemas, todos pré-existentes

## Pendências

1. **Valor-hora real** da Bambu e da Silhouette.
2. **Preços dos BOPP** (5 materiais estimados).
3. **Preços das 3 peças da Konica** (resíduos, correia, fusor).
4. **Vida útil da base de corte** da Silhouette.
5. Faixas por quantidade ainda **não puxam automaticamente no Orçamento**
   (decisão consciente: orçamento é negociação, só avisa).
