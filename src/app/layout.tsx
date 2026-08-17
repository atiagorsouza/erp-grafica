import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PrintFlow · Gráfica Rápida & Papelaria Personalizada",
    template: "%s · PrintFlow",
  },
  description:
    "ERP + CRM para gráfica rápida e papelaria personalizada: motor de precificação por impressora, produção, orçamentos, PDV e financeiro.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
