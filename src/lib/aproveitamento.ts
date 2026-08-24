/**
 * Quantas peças cabem numa folha.
 *
 * Até aqui esse número vinha digitado à mão em cada produto: 4
 * panfletos por A4, 9 polaroids, 40 adesivos. Funciona enquanto
 * alguém confere; quando o número está errado, o custo sai errado e
 * ninguém percebe — foi o que aconteceu com a polaroid, cadastrada
 * como 4 por folha quando cabem 9.
 *
 * Aqui a conta é feita, não digitada.
 *
 * O cálculo testa as duas orientações da peça e devolve a melhor.
 * Isso importa mais do que parece: um panfleto 14x10 rende 2 por A4
 * em pé e 4 deitado. Errar a orientação dobra o custo.
 */

export interface Folha {
  larguraMm: number;
  alturaMm: number;
}

export interface Peca {
  larguraMm: number;
  alturaMm: number;
  /** Sangria por lado, em mm. Arte que vai até a borda precisa. */
  sangriaMm?: number;
}

export interface Aproveitamento {
  /** Quantas peças cabem, na melhor orientação. */
  porFolha: number;
  /** "retrato" = peça na mesma orientação da folha. */
  orientacao: "retrato" | "girado";
  colunas: number;
  linhas: number;
  /** Quanto da folha vira produto, de 0 a 1. */
  aproveitamento: number;
  /** Área desperdiçada, em cm². */
  sobraCm2: number;
}

/** Formatos de folha que a gráfica usa. */
export const FOLHAS: Record<string, Folha> = {
  A3: { larguraMm: 297, alturaMm: 420 },
  A4: { larguraMm: 210, alturaMm: 297 },
  A5: { larguraMm: 148, alturaMm: 210 },
  A6: { larguraMm: 105, alturaMm: 148 },
};

/**
 * Margem de pega da impressora: a faixa das bordas onde ela não
 * imprime. Na Konica são 5 mm; na Epson, em modo borda a borda, é 0.
 */
export const MARGEM_PADRAO_MM = 5;

function arranjo(
  utilW: number,
  utilH: number,
  pw: number,
  ph: number,
): { total: number; colunas: number; linhas: number } {
  if (pw <= 0 || ph <= 0) return { total: 0, colunas: 0, linhas: 0 };
  const colunas = Math.floor(utilW / pw);
  const linhas = Math.floor(utilH / ph);
  return { total: colunas * linhas, colunas, linhas };
}

/**
 * Calcula o aproveitamento de uma peça numa folha.
 *
 * @param folha  formato da folha, em mm
 * @param peca   tamanho da peça, em mm, com sangria opcional
 * @param margemMm  margem de pega da impressora (padrão 5 mm)
 */
export function calcularAproveitamento(
  folha: Folha,
  peca: Peca,
  margemMm: number = MARGEM_PADRAO_MM,
): Aproveitamento {
  const sangria = peca.sangriaMm ?? 0;
  const pw = peca.larguraMm + sangria * 2;
  const ph = peca.alturaMm + sangria * 2;

  const utilW = folha.larguraMm - margemMm * 2;
  const utilH = folha.alturaMm - margemMm * 2;

  const retrato = arranjo(utilW, utilH, pw, ph);
  const girado = arranjo(utilW, utilH, ph, pw);

  const melhor = girado.total > retrato.total ? girado : retrato;
  const orientacao = girado.total > retrato.total ? "girado" : "retrato";

  const areaFolha = folha.larguraMm * folha.alturaMm;
  const areaPecas = melhor.total * peca.larguraMm * peca.alturaMm;

  return {
    porFolha: melhor.total,
    orientacao,
    colunas: melhor.colunas,
    linhas: melhor.linhas,
    aproveitamento: areaFolha > 0 ? areaPecas / areaFolha : 0,
    sobraCm2: (areaFolha - areaPecas) / 100,
  };
}

/**
 * Confere um aproveitamento informado à mão contra o cálculo.
 *
 * O número teórico é o MÁXIMO geométrico: encaixa tudo o que couber.
 * Na prática a gráfica usa grade regular — 3x3, 2x5 — porque a
 * guilhotina precisa de corte reto atravessando a folha inteira e a
 * Silhouette precisa de respiro entre contornos. Grade torta vira
 * retrabalho no refile.
 *
 * Por isso usar MENOS que o teórico é normal e legítimo. O que esta
 * função pega é o contrário: alguém cadastrar MAIS peças do que cabem,
 * que faz o custo por peça sair menor do que a realidade.
 *
 * Também avisa quando a folga é grande demais (mais de 25%), que
 * costuma ser erro de digitação — foi o caso da polaroid cadastrada
 * como 4 quando o dono usa 9.
 */
export function conferirAproveitamento(
  folha: Folha,
  peca: Peca,
  informado: number,
  margemMm: number = MARGEM_PADRAO_MM,
): { ok: boolean; teorico: number; aviso: string | null } {
  const { porFolha } = calcularAproveitamento(folha, peca, margemMm);

  if (informado > porFolha) {
    return {
      ok: false,
      teorico: porFolha,
      aviso:
        `Cadastrado ${informado} por folha, mas só cabem ${porFolha}. ` +
        `O custo por peça está sendo subestimado.`,
    };
  }
  if (porFolha > 0 && informado < porFolha * 0.75) {
    return {
      ok: true,
      teorico: porFolha,
      aviso:
        `Cadastrado ${informado} por folha, cabem até ${porFolha}. ` +
        `Se a grade permitir, dá para render mais.`,
    };
  }
  return { ok: true, teorico: porFolha, aviso: null };
}

/**
 * Compara A4 e A3 e diz qual sai mais barato por peça.
 *
 * Nem sempre a A3 compensa: ela rende o dobro de área, mas se a peça
 * não encaixa bem o desperdício come a vantagem. Esta função responde
 * com números, não com intuição.
 */
export function melhorFolha(
  peca: Peca,
  custoFolhaA4: number,
  custoFolhaA3: number,
  margemMm: number = MARGEM_PADRAO_MM,
): {
  escolha: "A4" | "A3";
  a4: Aproveitamento & { custoPorPeca: number };
  a3: Aproveitamento & { custoPorPeca: number };
  economiaPorPeca: number;
} {
  const a4 = calcularAproveitamento(FOLHAS.A4, peca, margemMm);
  const a3 = calcularAproveitamento(FOLHAS.A3, peca, margemMm);

  const custoA4 = a4.porFolha > 0 ? custoFolhaA4 / a4.porFolha : Infinity;
  const custoA3 = a3.porFolha > 0 ? custoFolhaA3 / a3.porFolha : Infinity;

  return {
    escolha: custoA3 < custoA4 ? "A3" : "A4",
    a4: { ...a4, custoPorPeca: custoA4 },
    a3: { ...a3, custoPorPeca: custoA3 },
    economiaPorPeca: Math.abs(custoA4 - custoA3),
  };
}

/**
 * Quantas folhas para produzir uma quantidade, já com a perda.
 *
 * `Math.ceil` no fim é o detalhe que engana: pedir 210 panfletos de 4
 * em 4 não custa 52,5 folhas, custa 53. Meia folha impressa é folha
 * gasta.
 */
export function folhasNecessarias(
  quantidade: number,
  porFolha: number,
  perdaPercent = 0,
): { folhas: number; sobram: number } {
  if (porFolha <= 0) return { folhas: 0, sobram: 0 };
  const base = Math.ceil(quantidade / porFolha);
  const folhas = base + Math.ceil(base * perdaPercent);
  return { folhas, sobram: folhas * porFolha - quantidade };
}
