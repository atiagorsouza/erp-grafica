/* ──────────────────────────────────────────────────────────────────
   PÁGINA PÚBLICA DE CADASTRO

   Fora do grupo (app): não tem menu, não tem sessão, não empresta
   nada do layout interno. É uma página que um estranho abre no
   celular a partir de um link do WhatsApp.

   Server component só para resolver o token e negar cedo. O
   formulário em si é client — precisa de CEP, máscara e PF/PJ.
   ────────────────────────────────────────────────────────────────── */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import {
  ipDaRequisicao,
  registrarAbertura,
  resolverToken,
  VALIDADE_DIAS,
} from "@/lib/registration-links";
import { CadastroPublicoForm } from "@/components/public/CadastroPublicoForm";

export const dynamic = "force-dynamic";

/* Link de cadastro não é conteúdo público: nada de indexar. */
export const metadata: Metadata = {
  title: "Complete seu cadastro",
  robots: { index: false, follow: false },
};

async function empresa() {
  const rows = await db
    .select()
    .from(settings)
    .where(
      inArray(settings.key, [
        "company_trade_name",
        "company_name",
        "company_legal_name",
        "company_phone",
        "company_whatsapp",
      ])
    );
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));
  return {
    nome:
      map.get("company_trade_name") ||
      map.get("company_name") ||
      map.get("company_legal_name") ||
      "Cadastro de cliente",
    telefone: map.get("company_whatsapp") || map.get("company_phone") || "",
  };
}

function Aviso({ titulo, texto, tom }: { titulo: string; texto: string; tom: "erro" | "ok" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-paper-200 bg-white p-8 text-center shadow-card">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            tom === "ok" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {tom === "ok" ? <polyline points="20 6 9 17 4 12" /> : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
          </svg>
        </div>
        <h1 className="mt-4 text-[19px] font-bold text-ink-900">{titulo}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{texto}</p>
      </div>
    </main>
  );
}

export default async function CadastroPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolvido = await resolverToken(token);

  if ("error" in resolvido) {
    return (
      <Aviso
        tom={resolvido.status === 410 ? "ok" : "erro"}
        titulo={resolvido.status === 410 ? "Link já utilizado ou expirado" : "Link não encontrado"}
        texto={`${resolvido.error}. Se precisar de um novo link, é só pedir pelo WhatsApp da gráfica.`}
      />
    );
  }

  const { link, cliente } = resolvido;

  /* Abertura registrada aqui, no servidor: o cliente pode fechar antes
     de enviar e ainda assim o CRM sabe que ele viu. */
  const h = await headers();
  await registrarAbertura(
    link.id,
    ipDaRequisicao(new Request("http://x", { headers: h })),
    h.get("user-agent") || ""
  );

  const info = await empresa();

  return (
    <CadastroPublicoForm
      token={link.token}
      empresa={info.nome}
      telefoneEmpresa={info.telefone}
      validadeDias={VALIDADE_DIAS}
      expiraEm={link.expiresAt.toISOString()}
      inicial={{
        type: (cliente.type as "pf" | "pj") || "pf",
        name: cliente.name || "",
        tradeName: cliente.tradeName || "",
        document: cliente.document || "",
        email: cliente.email || "",
        phone: cliente.phone || "",
        whatsapp: cliente.whatsapp || cliente.phone || "",
        cep: cliente.cep || "",
        street: cliente.street || "",
        number: cliente.number || "",
        complement: cliente.complement || "",
        district: cliente.district || "",
        city: cliente.city || "",
        state: cliente.state || "",
        stateRegistration: cliente.stateRegistration || "",
        birthDate: cliente.birthDate || "",
      }}
    />
  );
}
