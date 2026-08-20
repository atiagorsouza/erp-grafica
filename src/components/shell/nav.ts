/* ──────────────────────────────────────────────────────────────────
   NAVEGAÇÃO — fonte única

   A lista de telas vivia dentro da `Sidebar`, que é server component.
   Quando o menu do celular foi criado (v3.61.0), copiar a lista para
   lá significaria manter duas listas em sincronia — e uma delas ia
   ficar para trás no primeiro módulo novo. Agora as duas leem daqui.
   ────────────────────────────────────────────────────────────────── */
import type { IconName } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { label: string; accent: string; items: NavItem[] };


export const NAV: NavGroup[] = [
  {
    label: "Operação",
    accent: "var(--color-proc-c)",
    items: [
      { href: "/", label: "Visão Geral", icon: "gauge" },
      { href: "/pdv", label: "PDV · Frente de Caixa", icon: "receipt" },
      { href: "/orcamentos", label: "Orçamentos", icon: "quote" },
      { href: "/pedidos", label: "Pedidos & OS", icon: "orders" },
      { href: "/clientes", label: "Clientes & CRM", icon: "users" },
      { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp" },
      { href: "/kanban", label: "Kanban Produção", icon: "kanban" },
      { href: "/calendario", label: "Calendário", icon: "calendar" },
    ],
  },
  {
    label: "Motor de Produção",
    accent: "var(--color-proc-m)",
    items: [
      { href: "/impressoras", label: "Impressoras & Tintas", icon: "printer" },
      { href: "/produtos", label: "Produtos & Custos", icon: "tag" },
      { href: "/tabelas-precos", label: "Tabelas de Preços", icon: "sheets" },
      { href: "/servicos", label: "Serviços & Acabamentos", icon: "scissors" },
      { href: "/estoque", label: "Estoque & Compras", icon: "boxes" },
    ],
  },
  {
    label: "Gestão",
    accent: "var(--color-proc-y)",
    items: [
      { href: "/cobrancas", label: "Cobranças", icon: "wallet" },
      { href: "/envios", label: "Envios & Frete", icon: "truck" },
      { href: "/financeiro", label: "Financeiro", icon: "wallet" },
      { href: "/relatorios", label: "Relatórios", icon: "chart" },
      { href: "/configuracoes", label: "Painel de Controle", icon: "gear" },
    ],
  },
];
