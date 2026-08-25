/* ──────────────────────────────────────────────────────────────────
   Prazo de entrega em dias úteis.

   Diferente de `machineMinutes`, que é TEMPO DE MÁQUINA e serve para
   calcular custo. Aqui é PROMESSA AO CLIENTE:

     Uma peça 3D leva 6 horas de impressora, mas o cliente recebe em
     4 dias — tem fila na frente, modelagem antes e cura depois.

   Política da VTDIGITAL: "somente dias úteis de segunda à sexta,
   não válido para feriados".
   ────────────────────────────────────────────────────────────────── */

/* ── Feriados ──────────────────────────────────────────────────────
   Os móveis (Carnaval, Sexta-Feira Santa, Corpus Christi) dependem da
   Páscoa, que muda todo ano. Uma lista fixa de datas envelheceria em
   silêncio: em janeiro do ano seguinte o sistema passaria a prometer
   entrega na terça de Carnaval sem avisar ninguém.

   Por isso calculamos. Algoritmo de Meeus/Jones/Butcher (gregoriano). */
function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (d: Date, n: number) => {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

/** Feriados nacionais + Rio de Janeiro (a gráfica fica em Bangu). */
export function feriadosDoAno(ano: number): Map<string, string> {
  const f = new Map<string, string>();
  const fixo = (m: number, d: number, nome: string) =>
    f.set(iso(new Date(Date.UTC(ano, m - 1, d))), nome);

  fixo(1, 1, "Confraternização Universal");
  fixo(4, 21, "Tiradentes");
  fixo(5, 1, "Dia do Trabalho");
  fixo(9, 7, "Independência");
  fixo(10, 12, "Nossa Senhora Aparecida");
  fixo(11, 2, "Finados");
  fixo(11, 15, "Proclamação da República");
  fixo(11, 20, "Consciência Negra");   // nacional desde 2024
  fixo(12, 25, "Natal");

  const pascoa = domingoDePascoa(ano);
  f.set(iso(somaDias(pascoa, -48)), "Carnaval (segunda)");
  f.set(iso(somaDias(pascoa, -47)), "Carnaval (terça)");
  f.set(iso(somaDias(pascoa, -46)), "Quarta-feira de Cinzas");
  f.set(iso(somaDias(pascoa, -2)), "Sexta-feira Santa");
  f.set(iso(somaDias(pascoa, 60)), "Corpus Christi");

  // Rio de Janeiro
  fixo(1, 20, "São Sebastião (RJ)");
  fixo(4, 23, "São Jorge (RJ)");

  return f;
}

export interface ConfigPrazo {
  /** 0=domingo … 6=sábado. Dias em que a PRODUÇÃO corre. Padrão seg–sex. */
  diasUteis: number[];
  /** "HH:MM" — depois disso, o pedido conta a partir do dia seguinte. */
  horarioCorte: string;
  /** Datas ISO extras que a gráfica não abre (recesso, férias). */
  fechamentos: string[];
  /** Considerar feriados do calendário. */
  usarFeriados: boolean;
  /* ── Atendimento e entrega ──────────────────────────────────────
     Sábado é dia de ATENDER e ENTREGAR, não de produzir. São coisas
     diferentes e o sistema tratava as duas como uma só.

     Consequência prática: o prazo prometido nunca encurta por causa
     do sábado — a produção continua contando só de segunda a sexta.
     Mas quando a peça fica pronta na sexta, o cliente pode retirar no
     sábado, e é isso que a tela passa a dizer.

     A regra vale também para o outro lado: o que o dono faz fora do
     expediente é problema dele. O sistema NUNCA promete com base
     nisso. Entregar antes é presente; prometer antes é dívida. */
  diasAtendimento: number[];
  /** Até que horas o sábado atende. Vazio = não atende sábado. */
  sabadoAte: string;
}

export const CONFIG_PADRAO: ConfigPrazo = {
  diasUteis: [1, 2, 3, 4, 5],
  /* 17:00 — informado pelo dono. Aprovou às 17h01? Conta amanhã. */
  horarioCorte: "17:00",
  fechamentos: [],
  usarFeriados: true,
  diasAtendimento: [1, 2, 3, 4, 5, 6],
  sabadoAte: "13:00",
};

function ehUtil(d: Date, cfg: ConfigPrazo, feriados: Map<string, string>): boolean {
  if (!cfg.diasUteis.includes(d.getUTCDay())) return false;
  const chave = iso(d);
  if (cfg.usarFeriados && feriados.has(chave)) return false;
  if (cfg.fechamentos.includes(chave)) return false;
  return true;
}

/** Feriados dos anos que a janela de cálculo pode alcançar. */
function tabelaFeriados(inicio: Date, anosAdiante = 2): Map<string, string> {
  const t = new Map<string, string>();
  for (let a = inicio.getUTCFullYear(); a <= inicio.getUTCFullYear() + anosAdiante; a++) {
    for (const [k, v] of feriadosDoAno(a)) t.set(k, v);
  }
  return t;
}

export interface ResultadoPrazo {
  /** Data prometida, ISO "AAAA-MM-DD". */
  data: string;
  /** Dias úteis somados. */
  dias: number;
  /** Dia em que a contagem começou (após o corte / próximo útil). */
  inicio: string;
  /** Feriados e fins de semana pulados — para explicar ao cliente. */
  pulados: { data: string; motivo: string }[];
  /** Fica pronto na sexta e o sábado atende? Então dá para retirar no
   *  sábado. Informativo: não muda a data prometida. */
  retiradaSabado: string | null;
}

/**
 * Sábado 14h + 3 dias úteis ≠ terça. A conta precisa pular fim de
 * semana e feriado, e respeitar o horário de corte.
 *
 * @param apartirDe momento em que o relógio começa (aprovação da arte)
 * @param diasUteis quantos dias úteis somar
 */
export function calcularPrazo(
  apartirDe: Date,
  diasUteis: number,
  cfg: ConfigPrazo = CONFIG_PADRAO
): ResultadoPrazo {
  const feriados = tabelaFeriados(apartirDe);
  const pulados: { data: string; motivo: string }[] = [];

  /* Normaliza para UTC preservando a data local de São Paulo: o
     servidor pode rodar em UTC e "hoje" mudaria de dia à meia-noite
     errada. */
  let cursor = new Date(
    Date.UTC(apartirDe.getFullYear(), apartirDe.getMonth(), apartirDe.getDate())
  );

  /* Horário de corte: aprovado às 17h não entra na produção de hoje.
     Prometer o contrário é começar a relação quebrando prazo. */
  const [hCorte, mCorte] = cfg.horarioCorte.split(":").map(Number);
  const passouDoCorte =
    apartirDe.getHours() > hCorte ||
    (apartirDe.getHours() === hCorte && apartirDe.getMinutes() >= (mCorte || 0));
  if (passouDoCorte) {
    pulados.push({ data: iso(cursor), motivo: `depois das ${cfg.horarioCorte}` });
    cursor = somaDias(cursor, 1);
  }

  // Se caiu em dia não útil, anda até o próximo útil antes de contar.
  while (!ehUtil(cursor, cfg, feriados)) {
    pulados.push({ data: iso(cursor), motivo: motivoNaoUtil(cursor, cfg, feriados) });
    cursor = somaDias(cursor, 1);
  }

  const inicio = iso(cursor);

  /* Zero dias úteis = entrega no mesmo dia (item pronto em estoque). */
  let restantes = Math.max(0, Math.floor(diasUteis));
  while (restantes > 0) {
    cursor = somaDias(cursor, 1);
    while (!ehUtil(cursor, cfg, feriados)) {
      pulados.push({ data: iso(cursor), motivo: motivoNaoUtil(cursor, cfg, feriados) });
      cursor = somaDias(cursor, 1);
    }
    restantes--;
  }

  /* O sábado seguinte só é oferecido quando a peça fica pronta na
     sexta. Em qualquer outro dia da semana o cliente retira no
     próprio dia — apontar o sábado só confundiria. */
  let retiradaSabado: string | null = null;
  const atende = cfg.diasAtendimento?.includes(6) && !!cfg.sabadoAte;
  if (atende && cursor.getUTCDay() === 5) {
    const sabado = somaDias(cursor, 1);
    const feriadoNoSabado = cfg.usarFeriados && feriados.has(iso(sabado));
    const fechadoNoSabado = cfg.fechamentos.includes(iso(sabado));
    if (!feriadoNoSabado && !fechadoNoSabado) retiradaSabado = iso(sabado);
  }

  return {
    data: iso(cursor),
    dias: Math.max(0, Math.floor(diasUteis)),
    inicio,
    pulados,
    retiradaSabado,
  };
}

function motivoNaoUtil(d: Date, cfg: ConfigPrazo, feriados: Map<string, string>): string {
  const chave = iso(d);
  if (cfg.usarFeriados && feriados.has(chave)) return feriados.get(chave)!;
  if (cfg.fechamentos.includes(chave)) return "gráfica fechada";
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  return nomes[d.getUTCDay()];
}

/* ── Prazo de um produto ───────────────────────────────────────────
   Três parcelas, porque o que estoura prazo quase nunca é a máquina:

     criação     arte, modelagem — depende do cliente aprovar
     produção    máquina rodando
     acabamento  cura, montagem, secagem — tempo físico, não acelera  */
export interface PrazoProduto {
  diasCriacao: number;
  diasProducao: number;
  diasAcabamento: number;
  /** true = o item precisa terminar antes de outro começar. */
  emSerie?: boolean;
}

export const somaPrazoProduto = (p: PrazoProduto) =>
  Math.max(0, (p.diasCriacao || 0) + (p.diasProducao || 0) + (p.diasAcabamento || 0));

/**
 * Prazo de um pedido com vários itens.
 *
 * NÃO é a soma: as coisas acontecem em paralelo. 100 cartões (1 dia)
 * + 1 banner (1 dia) + peça 3D (4 dias) entrega em 4 dias, não 6 —
 * enquanto a 3D imprime, os cartões já saíram.
 *
 * A exceção é o item marcado `emSerie` (encadernação só começa depois
 * de capa e miolo prontos): esse soma por cima do maior.
 */
export function prazoDoPedido(itens: PrazoProduto[]): number {
  if (!itens.length) return 0;
  const paralelos = itens.filter((i) => !i.emSerie);
  const serie = itens.filter((i) => i.emSerie);
  const maiorParalelo = paralelos.length
    ? Math.max(...paralelos.map(somaPrazoProduto))
    : 0;
  const totalSerie = serie.reduce((s, i) => s + somaPrazoProduto(i), 0);
  return maiorParalelo + totalSerie;
}

/** "sexta, 22/08" — como o cliente lê. */
export function dataPorExtenso(isoData: string): string {
  const [a, m, d] = isoData.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  return `${dias[dt.getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
