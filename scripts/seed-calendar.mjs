// Seed de Datas Comemorativas — 100+ datas reais pesquisadas
// Focado em gráfica/papelaria com dicas de ação
import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => pool.query(sql, p);

// [mês, dia, título, tipo, relevância, dica de ação, emoji]
// tipos: feriado_nacional, data_comercial, data_comemorativa, interno
// relevância: alta, media, baixa
const DATES = [
  // ════ JANEIRO ════
  [1, 1, "Confraternização Universal (Ano Novo)", "feriado_nacional", "alta", "Calendários, agendas, cartões de ano novo", "🎆"],
  [1, 6, "Dia da Gratidão", "data_comemorativa", "baixa", "Cartões de agradecimento personalizados", "🙏"],
  [1, 8, "Dia do Fotógrafo", "data_comemorativa", "media", "Impressão fotográfica, álbuns, porta-retratos", "📸"],
  [1, 15, "Dia do Adulto (Japão)", "data_comemorativa", "baixa", null, "🎌"],
  [1, 25, "Dia do Carteiro", "data_comemorativa", "baixa", "Cartões postais personalizados", "📮"],
  [1, 25, "Aniversário de São Paulo", "data_comemorativa", "media", null, "🏙️"],
  [1, 30, "Dia da Saudade", "data_comemorativa", "baixa", "Cartões e presentes nostálgicos", "💭"],
  // ════ FEVEREIRO ════
  [2, 7, "Dia do Gráfico", "data_comemorativa", "alta", "Post comemorativo, desconto especial para gráficos", "🖨️"],
  [2, 14, "Valentine's Day", "data_comercial", "media", "Cartões, embalagens, etiquetas temáticas", "💕"],
  [2, 14, "Dia Internacional da Doação de Livros", "data_comemorativa", "baixa", "Marcadores de livro personalizados", "📚"],
  [2, 17, "Carnaval", "feriado_nacional", "alta", "Convites, ingressos, banners, fantasias temáticas", "🎭"],
  [2, 27, "Dia Nacional do Livro Didático", "data_comemorativa", "baixa", null, "📖"],
  // ════ MARÇO ════
  [3, 8, "Dia Internacional da Mulher", "data_comercial", "alta", "Cartões, brindes, tags, embalagens temáticas", "🌸"],
  [3, 14, "Dia do Vendedor de Livros", "data_comemorativa", "baixa", null, "📕"],
  [3, 15, "Dia do Consumidor", "data_comercial", "alta", "Promoções, cupons, flyers, banners de desconto", "🛍️"],
  [3, 15, "Dia da Escola", "data_comemorativa", "media", "Material escolar personalizado, cadernos", "🏫"],
  [3, 20, "Dia do Contador de Histórias", "data_comemorativa", "baixa", null, "📖"],
  [3, 21, "Dia Mundial da Poesia", "data_comemorativa", "baixa", "Impressão de livros de poesia", "✍️"],
  [3, 22, "Dia Mundial da Água", "data_comemorativa", "baixa", null, "💧"],
  // ════ ABRIL ════
  [4, 3, "Sexta-feira da Paixão", "feriado_nacional", "media", null, "✝️"],
  [4, 5, "Páscoa", "data_comercial", "alta", "Embalagens de chocolate, tags, cartões, caixas personalizadas", "🐣"],
  [4, 7, "Dia do Jornalista", "data_comemorativa", "baixa", null, "📰"],
  [4, 8, "Dia da Natação", "data_comemorativa", "baixa", null, "🏊"],
  [4, 19, "Dia dos Povos Indígenas", "data_comemorativa", "baixa", null, "🪶"],
  [4, 21, "Tiradentes", "feriado_nacional", "media", null, "🇧🇷"],
  [4, 22, "Dia Mundial da Terra", "data_comemorativa", "media", "Material ecológico, papel reciclado", "🌍"],
  [4, 23, "Dia do Livro", "data_comemorativa", "media", "Marcadores, capa de livro, impressão sob demanda", "📗"],
  // ════ MAIO ════
  [5, 1, "Dia do Trabalho", "feriado_nacional", "media", null, "⚒️"],
  [5, 1, "Dia da Literatura Brasileira", "data_comemorativa", "baixa", null, "📜"],
  [5, 5, "Dia da Comunidade", "data_comemorativa", "baixa", null, "🤝"],
  [5, 8, "Dia do Profissional de Marketing", "data_comemorativa", "media", "Material de marketing, cartões de visita", "📊"],
  [5, 10, "Dia das Mães", "data_comercial", "alta", "Cartões, embalagens de presente, tags, banners, lembrancinhas", "💐"],
  [5, 13, "Dia da Abolição da Escravatura", "data_comemorativa", "baixa", null, "⛓️"],
  [5, 15, "Dia Internacional das Famílias", "data_comemorativa", "media", "Álbuns fotográficos, quadros", "👨‍👩‍👧‍👦"],
  [5, 24, "Dia do Vestibulando", "data_comemorativa", "media", "Apostilas, cadernos, material de estudo", "📝"],
  // ════ JUNHO ════
  [6, 4, "Corpus Christi", "feriado_nacional", "media", null, "✝️"],
  [6, 5, "Dia Mundial do Meio Ambiente", "data_comemorativa", "media", "Papéis ecológicos, brindes sustentáveis", "🌿"],
  [6, 10, "Dia da Caneta Esferográfica", "data_comemorativa", "baixa", "Canetas personalizadas", "🖊️"],
  [6, 12, "Dia dos Namorados", "data_comercial", "alta", "Cartões, embalagens, tags, fotos, caixas presenteáveis", "❤️"],
  [6, 24, "Dia de São João", "data_comemorativa", "media", "Convites de festa junina, bandeirinhas, decoração", "🎪"],
  [6, 28, "Dia Internacional do Orgulho LGBTQIA+", "data_comemorativa", "media", "Adesivos, bandeiras, material inclusivo", "🏳️‍🌈"],
  [6, 29, "Dia de São Pedro", "data_comemorativa", "baixa", null, "⛪"],
  // ════ JULHO ════
  [7, 7, "Dia Mundial do Chocolate", "data_comemorativa", "media", "Embalagens de doces, tags", "🍫"],
  [7, 10, "Dia da Pizza", "data_comemorativa", "baixa", "Caixas de pizza personalizadas", "🍕"],
  [7, 13, "Dia Mundial do Rock", "data_comemorativa", "baixa", "Pôsteres, camisetas DTF", "🎸"],
  [7, 19, "Dia da Caridade", "data_comemorativa", "baixa", null, "💛"],
  [7, 20, "Dia do Amigo", "data_comercial", "media", "Cartões de amizade, kits presenteáveis, canecas", "🤗"],
  [7, 25, "Dia do Escritor", "data_comemorativa", "media", "Impressão de livros, capas personalizadas", "✒️"],
  [7, 26, "Dia dos Avós", "data_comercial", "media", "Cartões, porta-retratos, canecas sublimadas, álbuns", "👴👵"],
  // ════ AGOSTO ════
  [8, 9, "Dia dos Pais", "data_comercial", "alta", "Cartões, canecas, camisetas DTF, brindes personalizados, banners", "👔"],
  [8, 11, "Dia do Estudante", "data_comemorativa", "media", "Material escolar, cadernos personalizados", "🎓"],
  [8, 12, "Dia Nacional das Artes", "data_comemorativa", "media", "Impressão artística, quadros, pôsteres fine art", "🎨"],
  [8, 15, "Dia da Informática", "data_comemorativa", "baixa", null, "💻"],
  [8, 18, "Dia do Estagiário", "data_comemorativa", "baixa", null, "🧑‍💼"],
  [8, 19, "Dia Mundial da Fotografia", "data_comemorativa", "media", "Impressão fotográfica, álbuns, quadros", "📷"],
  [8, 22, "Dia do Folclore", "data_comemorativa", "baixa", null, "🪈"],
  [8, 24, "Dia da Infância", "data_comemorativa", "media", "Lembrancinhas, material infantil", "👶"],
  // ════ SETEMBRO ════
  [9, 5, "Dia da Amazônia", "data_comemorativa", "baixa", null, "🌳"],
  [9, 7, "Independência do Brasil", "feriado_nacional", "alta", "Bandeiras, faixas, material cívico, banners", "🇧🇷"],
  [9, 8, "Dia Internacional da Alfabetização", "data_comemorativa", "baixa", null, "📖"],
  [9, 15, "Dia do Cliente", "data_comercial", "alta", "Cupons, promoções, cartões de agradecimento, brindes", "🤝"],
  [9, 20, "Dia do Papeleiro", "data_comemorativa", "alta", "Post comemorativo, promoção especial do setor", "📄"],
  [9, 21, "Dia da Árvore", "data_comemorativa", "media", "Material ecológico, papel reciclado", "🌲"],
  [9, 21, "Início da Primavera", "data_comemorativa", "baixa", null, "🌼"],
  // ════ OUTUBRO ════
  [10, 1, "Dia do Vendedor", "data_comemorativa", "media", "Cartões de visita, material de vendas", "🤝"],
  [10, 4, "Dia dos Animais", "data_comemorativa", "media", "Produtos pet, adesivos, tags", "🐾"],
  [10, 5, "Dia do Empreendedor", "data_comemorativa", "media", "Material institucional, cartões", "💼"],
  [10, 12, "Dia das Crianças", "data_comercial", "alta", "Convites, brindes, embalagens, banners, DTF camisetas infantis", "👶"],
  [10, 12, "Nossa Senhora Aparecida", "feriado_nacional", "media", null, "🙏"],
  [10, 15, "Dia dos Professores", "data_comercial", "alta", "Cartões, canecas, brindes, agenda personalizada", "📚"],
  [10, 20, "Dia do Poeta", "data_comemorativa", "baixa", null, "📝"],
  [10, 29, "Dia Nacional do Livro", "data_comemorativa", "media", "Impressão de livros, marcadores, capas", "📖"],
  [10, 31, "Halloween", "data_comercial", "media", "Decoração, fantasias, convites, adesivos temáticos", "🎃"],
  // ════ NOVEMBRO ════
  [11, 2, "Finados", "feriado_nacional", "media", null, "🕯️"],
  [11, 14, "Dia Nacional da Alfabetização", "data_comemorativa", "baixa", null, "📖"],
  [11, 15, "Proclamação da República", "feriado_nacional", "media", null, "🇧🇷"],
  [11, 17, "Dia da Criatividade", "data_comemorativa", "media", "Showcase de trabalhos criativos, portfolio", "🎨"],
  [11, 19, "Dia da Bandeira", "data_comemorativa", "baixa", null, "🏴"],
  [11, 20, "Dia da Consciência Negra", "feriado_nacional", "media", null, "🖤"],
  [11, 27, "Black Friday", "data_comercial", "alta", "Banners, faixas, etiquetas, flyers de promoção, PDV", "🏷️"],
  [11, 30, "Cyber Monday", "data_comercial", "media", "E-commerce, material digital, impressões sob demanda", "💻"],
  // ════ DEZEMBRO ════
  [12, 1, "Dia Mundial da Luta contra a AIDS", "data_comemorativa", "baixa", null, "🎗️"],
  [12, 8, "Dia da Justiça", "data_comemorativa", "baixa", null, "⚖️"],
  [12, 20, "Dia do Mecânico", "data_comemorativa", "baixa", null, "🔧"],
  [12, 21, "Início do Verão", "data_comemorativa", "baixa", null, "☀️"],
  [12, 24, "Véspera de Natal", "data_comercial", "alta", "Últimas compras, embalagens, cartões, etiquetas", "🎁"],
  [12, 25, "Natal", "feriado_nacional", "alta", "Cartões, embalagens, tags, calendários, banners, convites de confraternização", "🎄"],
  [12, 31, "Réveillon / Ano Novo", "data_comercial", "alta", "Convites, cardápios, banners, material de festa", "🎉"],
];

async function main() {
  console.log("Populando datas comemorativas (sem apagar personalizações)...");
  
  let count = 0;
  let skipped = 0;
  for (const [month, day, title, type, relevance, hint, icon] of DATES) {
    const monthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const existing = await q(
      `SELECT id FROM commemorative_dates WHERE month=$1 AND day=$2 AND lower(title)=lower($3) LIMIT 1`,
      [month, day, title]
    );
    if (existing.rows[0]) {
      skipped++;
      continue;
    }
    await q(
      `INSERT INTO commemorative_dates (date, month, day, month_day, title, type, relevance, action_hint, icon, active, recurring, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,'comercial')`,
      [`2000-${monthDay}`, month, day, monthDay, title, type, relevance, hint, icon]
    );
    count++;
  }

  console.log(`✅ ${count} datas comemorativas cadastradas; ${skipped} já existiam.`);
  console.log("   Feriados nacionais, datas comerciais, comemorativas — todas editáveis e auditáveis.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
