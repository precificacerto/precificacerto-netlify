/**
 * natureza-da-despesa.ts — QUEM gera crédito, por natureza da despesa.
 *
 * Comando do PO de 21/09/2026, §1:
 *
 *   > Na LC 214/2025 quase toda aquisição para a atividade gera crédito (água, luz, telefone,
 *   > aluguel, frete, serviços tomados). Se o crédito só existir em matéria-prima, o custo
 *   > efetivo do resto fica inflado e o preço sai errado.
 *
 * >>> A DISTINÇÃO QUE O ARQUIVO SERVE, E ELA TEM TRÊS ESTADOS, NÃO DOIS <<<
 *
 * | estado | o que afirma | na tela |
 * |---|---|---|
 * | `COM_CREDITO` | há imposto na operação e ele pode creditar | bloco com botões |
 * | `SEM_BLOCO` | **não há imposto na operação** — folha, juros, tarifa | bloco AUSENTE |
 * | `VEDADO` | há imposto, e a lei proíbe o crédito | bloco com botões desligados e travados |
 *
 * `SEM_BLOCO` e `VEDADO` NÃO são a mesma coisa, e é a diferença que `ausente-vs-falso.md`
 * cataloga: um bloco com tudo em R$ 0,00 numa folha de pagamento AFIRMA que a folha tem
 * imposto e ele deu zero. Não tem. A ausência do bloco é a única forma de não afirmar nada.
 *
 * >>> ESTE MÓDULO NÃO CALCULA <<<
 *
 * A conta é `calcularCustoDoItem` de `custo-liquido-do-item.ts`, a MESMA do cadastro de item.
 * Aqui só se decide se o bloco existe e qual DESTINAÇÃO ele assume por padrão — reimplementar
 * a conta seria `copia-divergente.md` com a pior das assinaturas, porque as duas fechariam
 * consigo mesmas.
 */
import type { DestinacaoItem } from '@/utils/custo-liquido-do-item'

export type EstadoDoBloco = 'COM_CREDITO' | 'SEM_BLOCO' | 'VEDADO'

export interface NaturezaDaDespesa {
  estado: EstadoDoBloco
  /** A destinação que o bloco assume por padrão. Irrelevante em `SEM_BLOCO`. */
  destinacao: DestinacaoItem
  /** Por que o bloco não existe, ou por que está travado. `null` em `COM_CREDITO`. */
  motivo: string | null
  /**
   * A RESSALVA de uma categoria que credita — exibida ao lado das linhas, nunca no lugar delas.
   *
   * Ela NÃO é um `motivo` de sinal trocado: `motivo` explica por que não há crédito, e
   * aparece onde o bloco está ausente ou travado. O aviso aparece com o bloco ABERTO, e diz
   * em que condição aquele crédito existe — Viagens é o caso, e a condição é a lei.
   *
   * É opcional, e a ausência aqui é honesta: "esta categoria não tem ressalva". Não é o
   * campo opcional que `construtor-empobrecido.md` proíbe, porque ele não participa de
   * resultado numérico nenhum — o default neutro de um TEXTO de tela é a falta do texto.
   */
  aviso?: string | null
}

const COM = (destinacao: DestinacaoItem, aviso?: string): NaturezaDaDespesa =>
  ({ estado: 'COM_CREDITO', destinacao, motivo: null, aviso: aviso ?? null })

const SEM = (motivo: string): NaturezaDaDespesa =>
  ({ estado: 'SEM_BLOCO', destinacao: 'USO_CONSUMO', motivo })

const VEDADO = (motivo: string): NaturezaDaDespesa =>
  ({ estado: 'VEDADO', destinacao: 'USO_CONSUMO', motivo })

const MOTIVO_SEM_OPERACAO =
  'Não há imposto na operação: folha, encargos e pró-labore não são aquisição de bem ou serviço, e por isso não existe crédito a apurar.'

const MOTIVO_FINANCEIRO =
  'Multa, juros e tarifa bancária não são aquisição de bem ou serviço tributada pelo IBS/CBS — não há imposto destacado a creditar.'

/**
 * §3 — O MOTIVO NOVO, e ele cobre DOIS casos que têm a mesma raiz.
 *
 * Depreciação não é aquisição: ela APROPRIA no tempo um bem que já foi comprado, e o
 * crédito daquela compra, se houve, foi tomado lá. Lançá-la aqui pediria um segundo crédito
 * sobre o mesmo bem. IPTU e IPVA incidem sobre a PROPRIEDADE, não sobre uma operação com
 * bem ou serviço — não há imposto destacado a creditar porque não há operação.
 */
const MOTIVO_PATRIMONIO =
  'Não é aquisição: a depreciação apropria no tempo um bem já comprado — o crédito, se houve, foi o da compra —, e IPTU/IPVA incidem sobre a propriedade, não sobre uma operação com bem ou serviço.'

/**
 * §4 — A RESSALVA DE VIAGENS, que vai no bloco ABERTO.
 *
 * A categoria credita, e a condição é a destinação real da despesa. Dizê-la ao lado das
 * linhas é o que separa "não preenchi porque não tenho" de "não preenchi porque não sabia".
 */
const AVISO_VIAGENS =
  'Hospedagem, passagem e alimentação só geram crédito quando ligadas à atividade do contribuinte; fora disso são uso e consumo pessoal (LC 214/2025 art. 57).'

/*
  SUBIU PARA CÁ em 24/09/2026: `POR_CATEGORIA` passou a citá-lo ('Taxas de Licenças' e o
  MEI), e um `const` usado antes da declaração quebra no carregamento do módulo — não no
  teste que o importa, no PRIMEIRO acesso.
*/
const MOTIVO_GUIA =
  'Guia de imposto é o RECOLHIMENTO do tributo, não uma aquisição: ela entra no quadro de apuração, não como crédito.'

const MOTIVO_USO_PESSOAL =
  'Bem ou serviço de uso e consumo PESSOAL não gera crédito, ainda que adquirido pela empresa (LC 214/2025 art. 57).'

/**
 * A tabela do §3, categoria a categoria.
 *
 * A chave é o RÓTULO gravado em `cash_entries.expense_category` — o mesmo valor que
 * `expense-categories-by-regime.ts` oferece no seletor. Não é uma chave técnica: o banco
 * guarda o texto, e foi por isso que o bloco dos Compromissos Financeiros precisou carregar
 * os rótulos legados.
 */
const POR_CATEGORIA: Record<string, NaturezaDaDespesa> = {
  // ── Matéria-prima, revenda, insumo — como hoje ──
  'Fornecedores - Produtos para Revenda': COM('REVENDA'),
  'Matéria Prima - Base dos produtos': COM('INSUMO'),
  'Embalagens Individuais': COM('INSUMO'),
  'Embalagens Diversas': COM('INSUMO'),
  'Fretes FOB (Valores relacionados a compra de suprimentos)': COM('INSUMO'),

  // ── Utilidades ──
  // ENERGIA é INSUMO e as outras três são USO E CONSUMO, e a diferença não é de estilo:
  // energia elétrica consumida no processo industrial credita ICMS (LC 87/1996 art. 33, II,
  // "b") e PIS/COFINS; água, telefone e internet não têm essa previsão. Em USO_CONSUMO o
  // padrão liga CBS e IBS — que é o ponto da LC 214 — e deixa ICMS e PIS/COFINS desligados
  // COM BOTÃO, para quem tiver o enquadramento ligar.
  'Energia Elétrica': COM('INSUMO'),
  'Energia elétrica': COM('INSUMO'),
  'Água / Esgoto': COM('USO_CONSUMO'),
  'Telefone': COM('USO_CONSUMO'),
  'Internet': COM('USO_CONSUMO'),

  // ── Aluguel PJ, fretes e serviços tomados ──
  'Aluguel': COM('USO_CONSUMO'),
  'Consultoria': COM('USO_CONSUMO'),
  'Contabilidade': COM('USO_CONSUMO'),
  'Departamento Jurídico': COM('USO_CONSUMO'),
  'Terceirizações': COM('USO_CONSUMO'),
  'Sistema de Gestão / Softwares': COM('USO_CONSUMO'),
  'Sistema de gestão / Softwares': COM('USO_CONSUMO'),
  'Segurança / Monitoramento': COM('USO_CONSUMO'),
  'Fretes/Logísticas de Entrega Terceirizados': COM('USO_CONSUMO'),
  'Fretes / Logísticas de entrega Terceirizados': COM('USO_CONSUMO'),
  'Seguro de Transporte Entrega': COM('USO_CONSUMO'),
  'Gastos com Logísticas Externas': COM('USO_CONSUMO'),
  'Despesas Acessórias': COM('USO_CONSUMO'),
  'Correios': COM('USO_CONSUMO'),

  // ── Manutenção e materiais de consumo da operação ──
  'Manutenções': COM('USO_CONSUMO'),
  'Uso e Consumo': COM('USO_CONSUMO'),
  'Combustíveis': COM('USO_CONSUMO'),
  'Marketing (publicidades e relacionados)': COM('USO_CONSUMO'),

  // ── Uso PESSOAL — há imposto, e a lei veda ──
  'Bens de uso pessoal': VEDADO(MOTIVO_USO_PESSOAL),
  'Brindes': VEDADO(MOTIVO_USO_PESSOAL),

  /*
    §4 — AS QUE ABREM, INCLUSIVE AS DUVIDOSAS — decisão do PO de 24/09/2026.

    Seguros e Viagens ficam em aberto na doutrina, e a decisão foi ABRIR: campo vazio não
    afirma nada, e quem não tem crédito simplesmente não preenche — enquanto a AUSÊNCIA do
    campo impede quem TEM. É `ausente-vs-falso.md` aplicado ao controle em vez do dado: uma
    linha ausente afirma "não há crédito aqui", que é mais do que se sabe.

    Elas já caíam no padrão `COM_CREDITO`/`USO_CONSUMO` por serem desconhecidas da tabela.
    Estão nomeadas aqui de propósito: o padrão é o que sobra, e uma decisão do PO não deve
    morar no que sobra — quem vier revisar a lista precisa ver que elas foram examinadas.
  */
  'Seguros': COM('USO_CONSUMO'),
  'Seguros imóveis e veículos': COM('USO_CONSUMO'),
  'Viagens (hotéis / passagens / alimentação / ETC)': COM('USO_CONSUMO', AVISO_VIAGENS),
  'Viagens (hotéis / passagens / alimentação / etc)': COM('USO_CONSUMO', AVISO_VIAGENS),

  /*
    §3 — AS DE FIXA E VARIÁVEL QUE NÃO SÃO AQUISIÇÃO.

    Todas caíam no padrão `COM_CREDITO`/`USO_CONSUMO` e ganhavam CBS e IBS LIGADOS. Nenhuma
    é aquisição de bem ou serviço, e um bloco ali afirma que há imposto na operação.

    >>> AS GRAFIAS SÃO AS DO SISTEMA, INCLUSIVE AS ERRADAS <<<
    'Recisões' sem o "s" e 'Saúde trabalhista' em minúscula existem em
    `expense-categories-by-regime.ts` e é esse texto que `cash_entries.expense_category`
    guarda. Corrigi-las aqui desconectaria os lançamentos já feitos — a chave é o rótulo,
    não um código.
  */
  'Depreciação': SEM(MOTIVO_PATRIMONIO),
  'Impostos IPTU / IPVA': SEM(MOTIVO_PATRIMONIO),
  'Taxas de Licenças': SEM(MOTIVO_GUIA),
  'MEI (Microempreendedor Individual)': SEM(MOTIVO_GUIA),
  'Horas Extras - Salários': SEM(MOTIVO_SEM_OPERACAO),
  'Recisões / Indenizações': SEM(MOTIVO_SEM_OPERACAO),
  'Rescisões / Indenizações': SEM(MOTIVO_SEM_OPERACAO),
  'Saúde Trabalhista / Ocupacional': SEM(MOTIVO_SEM_OPERACAO),
  'Saúde trabalhista / Ocupacional': SEM(MOTIVO_SEM_OPERACAO),

  // ── Financeiras — não há operação tributada ──
  'Juros': SEM(MOTIVO_FINANCEIRO),
  'Taxas Cartão': SEM(MOTIVO_FINANCEIRO),
  'Taxas Bancárias': SEM(MOTIVO_FINANCEIRO),
  'Troca Cheque': SEM(MOTIVO_FINANCEIRO),
  'IOF': SEM(MOTIVO_FINANCEIRO),
  'Multas de Trânsito': SEM(MOTIVO_FINANCEIRO),
}

/**
 * §2 — AS EXCEÇÕES NOMINAIS, QUE VENCEM O VETO DO GRUPO.
 *
 * `MAO_DE_OBRA_PRODUTIVA` está em `GRUPOS_SEM_BLOCO`, e o grupo decide ANTES da categoria.
 * O resultado era que 'Mão de obra produtiva terceirizada — passível de crédito' — a ÚNICA
 * rubrica cujo próprio rótulo diz que credita — era justamente a que não abria o bloco. É
 * defeito, não escolha: serviço tomado de PJ credita IBS/CBS pela regra geral (LC 214/2025
 * art. 47) e PIS/COFINS no não cumulativo.
 *
 * >>> POR QUE NOMINAL, E NÃO UMA LISTA DE CATEGORIAS NO LUGAR DO VETO <<<
 *
 * O veto por GRUPO é o que faz uma rubrica de folha NOVA nascer sem bloco sem que ninguém
 * precise lembrar de cadastrá-la. Trocá-lo por uma lista nominal de quem não credita
 * inverteria isso: a próxima rubrica de folha nasceria COM bloco, e um bloco numa folha de
 * pagamento afirma que há imposto na operação e ele deu zero (`ausente-vs-falso.md`).
 *
 * A exceção é nominal exatamente para não abrir a porta por categoria desconhecida. Só o
 * rótulo listado aqui atravessa; qualquer outra coisa dentro daqueles grupos continua sem
 * bloco, e há um caso que prova isso com uma categoria inventada.
 */
const EXCECOES_DE_CATEGORIA: Record<string, NaturezaDaDespesa> = {
  'Mão de obra produtiva terceirizada — passível de crédito': COM('USO_CONSUMO'),
}

/**
 * Os grupos em que NENHUMA categoria tem bloco, porque não há aquisição.
 *
 * Decidir por GRUPO aqui, e não categoria a categoria, é deliberado: folha tem dezenas de
 * rubricas (salário, 13º, férias, FGTS, INSS, vale…) e a próxima que alguém criar precisa
 * nascer SEM bloco. Uma lista nominal deixaria a nova de fora e o bloco apareceria numa folha
 * de pagamento — `portao-que-nao-alcanca.md` pelo avesso.
 */
const GRUPOS_SEM_BLOCO = new Set([
  'MAO_DE_OBRA',
  'MAO_DE_OBRA_PRODUTIVA',
  'MAO_DE_OBRA_ADMINISTRATIVA',
  'COMISSOES',
  'RESERVA_TECNICA',
  'IMPOSTO',
  'IMPOSTO_LUCRO',
  'IMPOSTO_FATURAMENTO_DENTRO',
  'REGIME_TRIBUTARIO',
  'DESPESA_FINANCEIRA',
  'DEDUCAO_RECEITA',
  'REPASSE',
  'AMORTIZACAO',
  'INVESTIMENTO',
  'LUCRO',
])

const MOTIVO_POR_GRUPO: Record<string, string> = {
  MAO_DE_OBRA: MOTIVO_SEM_OPERACAO,
  MAO_DE_OBRA_PRODUTIVA: MOTIVO_SEM_OPERACAO,
  MAO_DE_OBRA_ADMINISTRATIVA: MOTIVO_SEM_OPERACAO,
  COMISSOES: MOTIVO_SEM_OPERACAO,
  RESERVA_TECNICA: MOTIVO_SEM_OPERACAO,
  DESPESA_FINANCEIRA: MOTIVO_FINANCEIRO,
  AMORTIZACAO: 'Pagamento de principal de dívida não é aquisição: não há imposto na operação.',
  INVESTIMENTO: 'A aquisição de bem do imobilizado tem crédito por CIAP e por depreciação, que são fase 2 — não por esta tela.',
}

/**
 * A natureza de um lançamento de despesa.
 *
 * A ORDEM é exceção nominal → grupo → categoria → padrão.
 *
 * O GRUPO decide antes da categoria, e é de propósito: ele é o balde estrutural, e uma
 * rubrica nova dentro de folha nasce sem bloco sem que ninguém precise lembrar de
 * cadastrá-la aqui. A categoria refina dentro dos grupos que podem ter crédito.
 *
 * Na frente de tudo fica `EXCECOES_DE_CATEGORIA`, com UM rótulo — o terceirizado. Ela é
 * nominal para não furar o veto: uma categoria desconhecida dentro de folha continua
 * caindo em `SEM_BLOCO`.
 *
 * Categoria desconhecida num grupo que pode creditar devolve `COM_CREDITO` em `USO_CONSUMO`:
 * o bloco aparece com CBS e IBS ligados e o resto desligado COM BOTÃO. É a escolha que não
 * afirma nada sozinha — quem sabe o enquadramento liga, e o padrão não inventa crédito de
 * ICMS para uma despesa que ninguém classificou.
 */
export function naturezaDaDespesa(
  category: string | null | undefined,
  group: string | null | undefined,
): NaturezaDaDespesa {
  const g = String(group ?? '').trim().toUpperCase()
  const c = String(category ?? '').trim()

  // A exceção NOMINAL vem antes do veto de grupo — e só ela. Ver `EXCECOES_DE_CATEGORIA`.
  const excecao = EXCECOES_DE_CATEGORIA[c]
  if (excecao) return excecao

  if (GRUPOS_SEM_BLOCO.has(g)) {
    const motivo = MOTIVO_POR_GRUPO[g]
      ?? (g === 'IMPOSTO' || g === 'IMPOSTO_LUCRO' || g === 'IMPOSTO_FATURAMENTO_DENTRO' || g === 'REGIME_TRIBUTARIO'
        ? MOTIVO_GUIA
        : MOTIVO_SEM_OPERACAO)
    return SEM(motivo)
  }

  const daCategoria = POR_CATEGORIA[c]
  if (daCategoria) return daCategoria

  return COM('USO_CONSUMO')
}

/**
 * §1 — QUAL FORMA o bloco fiscal assume.
 *
 * A decisão mora AQUI, e não na tela, pela mesma razão que a destinação mora aqui: a tela
 * não tem opinião sobre quais tributos uma categoria pode ter. Escrita lá, ela seria uma
 * segunda leitura da mesma tabela, e a divergência apareceria como uma conta de luz pedindo
 * ICMS-ST — sem nada falhar (`copia-divergente.md`).
 *
 * | forma | quando | o que mostra |
 * |---|---|---|
 * | `COMPACTA` | `COM_CREDITO` + `USO_CONSUMO` | duas linhas: CBS e IBS |
 * | `COMPLETA` | todo o resto | a escada inteira |
 *
 * `INSUMO` e `REVENDA` ficam na completa porque matéria-prima, revenda e embalagem têm ST,
 * IPI e DIFAL de verdade. `VEDADO` também: o bloco continua visível e travado, com o motivo,
 * e escondê-lo pela metade apagaria a explicação.
 *
 * `escadaRevelada` é o link do caso raro. Ele é de SESSÃO — quem o clica revela os campos
 * daquele lançamento, e o próximo nasce compacto de novo.
 */
export function formaDoBlocoFiscal(
  natureza: NaturezaDaDespesa,
  escadaRevelada: boolean,
): 'COMPACTA' | 'COMPLETA' {
  if (escadaRevelada) return 'COMPLETA'
  return natureza.estado === 'COM_CREDITO' && natureza.destinacao === 'USO_CONSUMO'
    ? 'COMPACTA'
    : 'COMPLETA'
}

/** O bloco de impostos aparece neste lançamento? */
export function temBlocoDeImpostos(
  category: string | null | undefined,
  group: string | null | undefined,
): boolean {
  return naturezaDaDespesa(category, group).estado !== 'SEM_BLOCO'
}
