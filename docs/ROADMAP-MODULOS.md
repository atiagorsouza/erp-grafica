# Roadmap de auditoria por módulo — PrintFlow ERP

Cada módulo passa por: varredura completa → correção de bugs/lógica →
verificação de integração entre módulos → testes ponta a ponta → limpeza de
código morto → release versionado + changelog.

## Concluídos
- [x] PDV · Frente de Caixa — v3.1.0
- [x] Painel de Controle (reparo de settings) — v3.1.1
- [x] Pedidos & OS — v3.2.0
- [x] Clientes & CRM — v3.3.0
- [x] Kanban de Produção — v3.4.0
- [x] Calendário — v3.5.0
- [ ] Orçamentos — EM ANDAMENTO

## Motor de Produção (CUIDADO REDOBRADO — núcleo de custo/precificação)
Ordem sugerida (de baixo para cima na cadeia de dependência):
1. [ ] Impressoras & Tintas   (categorias, consumíveis, custo por página/folha)
2. [ ] Tabelas de Preços      (DTF, comunicação visual — R$/m², metro linear)
3. [ ] Serviços & Acabamentos (próprios/terceirizados, acabamentos por peça/lote)
4. [ ] Produtos & Custos      (motor: unit vs. batch, markup, breakdown) — CENTRAL
5. [ ] Estoque & Compras      (materiais, movimentações, fornecedores, compras)

### Pontos de atenção do Motor de Produção
- Coerência do cálculo de custo: consumível/página → formato → material → acabamento → markup.
- `costSnapshot`/`finalPrice`/`breakdown` do produto devem refletir as dependências.
- Alterar custo de material/consumível NÃO deve mudar preço já gravado em pedido/venda (snapshot).
- Baixa de estoque no PDV/Pedido usa baseMaterial + productMaterials — validar consumo real.
- Integração: Produto → PDV/Orçamento/Pedido; Material → Estoque/Compras; Impressora → Produto.

## Gestão (depois do Motor)
- [ ] Financeiro   (recebe lançamentos de PDV/Pedidos — já parcialmente ajustado)
- [ ] Relatórios   (margem, vendas, inadimplência)
