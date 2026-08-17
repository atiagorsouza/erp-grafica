# Auditoria — Reestruturação do cadastro de Clientes (v3.21.0)

Base: as duas telas de referência enviadas pelo usuário (Pessoa Física e
Pessoa Jurídica). Objetivo: trazer os campos daquele cadastro para o
PrintFlow **mantendo o layout e o design atuais**, apenas organizados de
forma profissional, e propagar os dados novos por todo o sistema.

## Escopo acordado

Incluídos os campos das duas telas, **exceto** (decisão explícita do
usuário): segmento/seguimento, Instagram, Facebook, nº de celular e
apelido. Nome de contato existe **somente para PJ**.

## O que mudou

### 1. Banco (`src/db/schema.ts`)

Seis colunas novas em `customers` — `rg_issuer`, `marital_status`,
`company_size`, `founded_at`, `origin`, `whatsapp_opt_out`
(boolean not null default false). A tabela passou a ter 39 colunas.

> `npx drizzle-kit push --force` saiu com código 0 **sem aplicar nada**.
> As colunas foram criadas por `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
> e conferidas em `information_schema.columns`. Sempre validar o push.

### 2. Regras de negócio (`src/lib/crm.ts`)

| Regra | Comportamento |
|---|---|
| CPF/CNPJ obrigatório | 422 `CPF é obrigatório` / `CNPJ é obrigatório` |
| CPF/CNPJ válido | dígito verificador conferido → 422 |
| Cadastro rápido | `quickEntry: true` dispensa o documento |
| `birthDate` / `foundedAt` | `YYYY-MM-DD` e nunca no futuro → 422 |
| Domínios fechados | `origin`, `maritalStatus`, `companySize` |

O **cadastro rápido (F8) do PDV, Pedidos e Orçamentos** envia
`quickEntry: true`: o balcão não pode travar por falta de CPF. A
exigência vale para o cadastro completo da tela de Clientes.

### 3. Máscaras (`src/lib/validators.ts`)

`formatDocumentAuto` alterna CPF/CNPJ pela quantidade de dígitos e
`formatStateRegistration` limpa a IE. Na tela, `setMasked` corrige
**durante a digitação** documento, CEP, telefone, WhatsApp e IE; a UF é
maiúscula e limitada a 2 caracteres.

### 4. Formulário (`ClientsClient.tsx`)

Uma grade única virou cinco blocos `FormSection`, sem trocar cores,
tipografia ou componentes:

1. **Identificação** — nome/razão social, fantasia (PJ), documento, origem
2. **Documentos pessoais** (PF: RG, órgão emissor, nascimento, estado civil) / **Dados da empresa** (PJ: IE, IM, regime, porte, fundação)
3. **Endereço** — **CEP primeiro**, com preenchimento automático via ViaCEP
4. **Contato** — telefone, WhatsApp, e-mail, contato (PJ), opt-out de WhatsApp
5. **Situação comercial** — status, limite de crédito, observações

### 5. Propagação

- **Importador de PDF** — passou a extrair complemento, RG, órgão
  emissor, nascimento, estado civil, IE, IM e contato; grava `origin:
  "importacao"`. Datas `dd/mm/aaaa` → ISO e estado civil normalizado.
  Campos vazios na ficha viram `null`.
- **Cupom térmico 80 mm** — PJ imprime fantasia, razão social e `A/C:`.
- **OS / A4 (`PrintDocument`)** — bloco fiscal com razão social, IE, IM e
  A/C só para PJ; endereço com complemento e CEP.
- **PDV, Pedidos, Orçamentos** — já usam `select()` sem projeção, então
  os campos novos fluem sem alteração.

### 6. Painel de Controle — emissão de nota fiscal

Sete campos do emitente que faltavam, no grupo `empresa`: **inscrição
estadual, inscrição municipal, regime tributário, CNAE principal, código
IBGE do município, complemento do endereço e CRT**. `company_city_code`
já preenchido com **3304557** (Rio de Janeiro). Os demais dependem de
documento da empresa e ficaram em branco para o usuário completar.

## Bugs corrigidos no caminho

| # | Problema | Correção |
|---|---|---|
| 1 | `PrintDocument.tsx:160` lia `customer.mobilePhone`, coluna que nunca existiu — o contato caía silenciosamente para `phone` | passou a usar `whatsapp` / `phone` |
| 2 | Sem âncora, os regexes do importador vazavam para o rótulo seguinte (estado civil capturava "Cônjuge..: Escolaridade:") | `grab()` ancorado e `clean()` cobrindo ~20 rótulos do legado |
| 3 | Endereço impresso ignorava complemento e CEP | ambos incluídos |
| 4 | O fixture do smoke criava cliente sem documento e quebrava com a regra nova | `makeCpf(seed)` gera CPF válido e único por execução |

## Validação

- `npm run typecheck` — limpo
- `npm run build` — compilado com sucesso
- `npx eslint` nos 7 arquivos tocados — 0 erros, 0 avisos
- `npm run e2e:smoke` — **112 checks** (eram 101; 11 novos cobrem
  obrigatoriedade, DV inválido, `quickEntry`, data futura, persistência
  dos campos PF/PJ e normalização de telefone), reexecutável
