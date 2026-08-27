# Portal do Cliente (Hostinger)

Esta pasta é a casa do **portal público do cliente** — o site que o
cliente da gráfica abre para pedir orçamento, acompanhar pedido e
aprovar arte. Ele **não roda no servidor da gráfica**: é hospedado na
**Hostinger**.

## Convenção

| Item | Valor |
|---|---|
| Versão | `portal-hostinger/VERSION` (independente do ERP) |
| Pacote | `bash scripts/empacotar-portal.sh` → `release/portal-v<versão>-<data>.zip` |
| Implantação | manual, pelo dono (gerenciador da Hostinger / FTP) |
| Backend | API pública do ERP: `https://app.vtdigital.site/api/portal/*` |
| Autenticação | `PORTAL_API_KEYS` no `.env` do ERP (Painel → Integrações) |

O agente do servidor **não** implanta o portal — fluxo separado, ver
`AGENTE-SERVIDOR.md` §8.

## Estado

**Ainda não há código aqui.** O desenho aprovado está em
`docs/PLANO-PORTAL-CLIENTE.md` (fases e as 3 decisões em aberto do §8)
e os rabiscos em `RABISCO-PAINEL-CLIENTE.md`. Quando a primeira versão
entrar, ela mora aqui e o empacotador passa a gerar o zip.

> Enquanto isto, `/api/portal` no ERP já atende leitura (catálogo,
> consulta de pedido por número+hash) — o POST de orçamento ainda é
> stub (`api/portal/route.ts`), pendência conhecida da auditoria
> 24/08.
