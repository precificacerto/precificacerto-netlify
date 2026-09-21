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
}

const COM = (destinacao: DestinacaoItem): NaturezaDaDespesa =>
  ({ estado: 'COM_CREDITO', destinacao, motivo: null })

const SEM = (motivo: string): NaturezaDaDespesa =>
  ({ estado: 'SEM_BLOCO', destinacao: 'USO_CONSUMO', motivo })

const VEDADO = (motivo: string): NaturezaDaDespesa =>
  ({ estado: 'VEDADO', destinacao: 'USO_CONSUMO', motivo })

const MOTIVO_SEM_OPERACAO =
  'Não há imposto na operação: folha, encargos e pró-labore não são aquisição de bem ou serviço, e por isso não existe crédito a apurar.'

const MOTIVO_FINANCEIRO =
  'Multa, juros e tarifa bancária não são aquisição de bem ou serviço tributada pelo IBS/CBS — não há imposto destacado a creditar.'

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

  // ── Financeiras — não há operação tributada ──
  'Juros': SEM(MOTIVO_FINANCEIRO),
  'Taxas Cartão': SEM(MOTIVO_FINANCEIRO),
  'Taxas Bancárias': SEM(MOTIVO_FINANCEIRO),
  'Troca Cheque': SEM(MOTIVO_FINANCEIRO),
  'IOF': SEM(MOTIVO_FINANCEIRO),
  'Multas de Trânsito': SEM(MOTIVO_FINANCEIRO),
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

const MOTIVO_GUIA =
  'Guia de imposto é o RECOLHIMENTO do tributo, não uma aquisição: ela entra no quadro de apuração, não como crédito.'

/**
 * A natureza de um lançamento de despesa.
 *
 * O GRUPO decide primeiro, e é de propósito: ele é o balde estrutural, e uma categoria nova
 * dentro de folha nasce sem bloco sem que ninguém precise lembrar de cadastrá-la aqui. A
 * categoria refina dentro dos grupos que podem ter crédito.
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

/** O bloco de impostos aparece neste lançamento? */
export function temBlocoDeImpostos(
  category: string | null | undefined,
  group: string | null | undefined,
): boolean {
  return naturezaDaDespesa(category, group).estado !== 'SEM_BLOCO'
}
