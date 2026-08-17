export const dynamic = "force-dynamic";

/** Proxy ViaCEP com validação: usado pelo CRM para autopreencher endereço. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cep: string }> }
) {
  const { cep: rawCep } = await params;
  const cep = rawCep.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) {
    return Response.json({ error: "CEP deve ter 8 dígitos" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) throw new Error("ViaCEP indisponível");
    const data = await res.json();
    if (data.erro) {
      return Response.json({ error: "CEP não encontrado" }, { status: 404 });
    }
    return Response.json({
      cep: data.cep,
      street: data.logradouro || "",
      complement: data.complemento || "",
      district: data.bairro || "",
      city: data.localidade || "",
      state: data.uf || "",
      ibge: data.ibge || "",
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar o CEP agora" },
      { status: 503 }
    );
  }
}
