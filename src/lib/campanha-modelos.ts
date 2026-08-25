/* ──────────────────────────────────────────────────────────────────
   Modelos de campanha da VTDIGITAL.

   Por que existir: a tela de campanha nascia com o campo em branco.
   Escrever do zero, com pressa, é como se produz a mensagem que a
   plataforma lê como spam — e derruba a reputação do número.

   Os textos seguem três regras que já valem no resto do sistema:

   1. PEDIR CONVERSA, NÃO ANUNCIAR. Toda mensagem termina em pergunta.
      "Te interessa?" tem resposta; "20% OFF" não tem, e mensagem sem
      resposta é sinal de spam para o WhatsApp.

   2. SÓ PARA BASE QUENTE. São modelos para quem já comprou ou já
      conversou — nunca lista comprada. A tela de campanha já filtra
      por aceite; isto aqui é só o texto.

   3. NADA DE URGÊNCIA FALSA. Sem "últimas horas" ou "só hoje" quando
      não é verdade. Cliente de gráfica volta; queimar confiança por
      uma venda é mau negócio.

   Todos editáveis: o operador escolhe o modelo, o texto entra no
   campo e ele ajusta antes de enviar.
   ────────────────────────────────────────────────────────────────── */

export interface ModeloCampanha {
  id: string;
  /** Nome curto no seletor. */
  titulo: string;
  /** Quando faz sentido usar — aparece embaixo do título. */
  quando: string;
  /** Sugestão de nome interno da campanha. */
  nome: string;
  corpo: string;
  ctaLabel?: string;
  /** Deixado em branco de propósito: o link é do catálogo do dono. */
  ctaUrl?: string;
}

export const MODELOS_CAMPANHA: ModeloCampanha[] = [
  {
    id: "catalogo",
    titulo: "Convite para ver o catálogo",
    quando: "Quando o catálogo estiver publicado — apresenta tudo que a gráfica faz.",
    nome: "Convite para o catálogo",
    corpo:
      "Oi, {nome}! Tudo bem? 🙂\n\n" +
      "Montei um catálogo com tudo que a gente faz aqui na {empresa} — " +
      "cartão, adesivo, caneca, camiseta, brinde personalizado e muito mais.\n\n" +
      "Quer dar uma olhada? Se bater o olho em algo que te interessa, é só me chamar que eu faço o orçamento.",
    ctaLabel: "Ver o catálogo",
  },
  {
    id: "volta",
    titulo: "Cliente que não compra há um tempo",
    quando: "Para quem comprou uma vez e sumiu. Reativação sem cobrança.",
    nome: "Reativação de cliente",
    corpo:
      "Oi, {nome}! Aqui é da {empresa} 🙂\n\n" +
      "Faz um tempinho que a gente não se fala e lembrei de você.\n\n" +
      "Tem algum trabalho chegando aí? Se precisar de qualquer coisa impressa ou personalizada, é só me falar que eu te ajudo.",
  },
  {
    id: "novidade",
    titulo: "Novidade na produção",
    quando: "Quando entra máquina, material ou serviço novo.",
    nome: "Novidade — [o que entrou]",
    corpo:
      "Oi, {nome}! 🙂\n\n" +
      "Novidade aqui na {empresa}: agora estamos fazendo [ESCREVA O QUE É].\n\n" +
      "Lembrei de você porque acho que pode ser útil aí. Quer que eu te mande alguns exemplos?",
  },
  {
    id: "data",
    titulo: "Data comemorativa chegando",
    quando: "Dia das Mães, Natal, festa junina — antecedência de 3 a 4 semanas.",
    nome: "Campanha de [data]",
    corpo:
      "Oi, {nome}! 🙂\n\n" +
      "[DATA] está chegando e é a época em que mais sai brinde e lembrancinha personalizada aqui.\n\n" +
      "Se você pretende fazer alguma coisa, vale garantir agora — perto da data a produção fica apertada.\n\n" +
      "Quer que eu te passe algumas ideias?",
  },
  {
    id: "empresa",
    titulo: "Cliente empresa — material de rotina",
    quando: "Para PJ que compra cartão, bloco, envelope. Lembrete de reposição.",
    nome: "Reposição — clientes PJ",
    corpo:
      "Oi, {nome}! Tudo bem? 🙂\n\n" +
      "Passando para saber se o material de vocês está acabando — cartão de visita, bloco, envelope, essas coisas de rotina.\n\n" +
      "Se quiser, eu já deixo separado com a mesma arte da última vez. Quantos vocês precisariam?",
  },
  {
    id: "pos-venda",
    titulo: "Pós-venda — como ficou?",
    quando: "Alguns dias depois da entrega. Gera resposta e traz recompra.",
    nome: "Pós-venda",
    corpo:
      "Oi, {nome}! 🙂\n\n" +
      "Passando só para saber se ficou tudo certo com o seu pedido.\n\n" +
      "Se tiver qualquer coisa a ajustar, me fala que eu resolvo. E se ficou bom, fico feliz em saber também!",
  },
  {
    id: "indicacao",
    titulo: "Pedido de indicação",
    quando: "Para cliente satisfeito e recorrente. Nunca para quem comprou uma vez só.",
    nome: "Indicação",
    corpo:
      "Oi, {nome}! 🙂\n\n" +
      "Você já é cliente aqui há um tempo e isso ajuda demais a gente.\n\n" +
      "Se conhecer alguém que precise de impressão ou personalizado, pode passar meu contato? " +
      "Cuido do pessoal que você indicar com o mesmo carinho.",
  },
];
