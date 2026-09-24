/**
 * projecao-de-caixa.ts — QUEM entra no saldo acumulado, e com que sinal.
 *
 * Comando do PO de 25/09/2026, §2:
 *
 *   > PREVISTO   = tudo que está lançado, dos DOIS lados.
 *   > CONFIRMADO = só o que tem `paid_date`, dos DOIS lados.
 *   > Nenhuma leitura mistura os lados.
 *
 * >>> O DEFEITO QUE ESTE ARQUIVO EXISTE PARA APAGAR <<<
 *
 * O saldo somava TODA despesa lançada e NENHUM recebimento previsto. A regra estava escrita
 * no próprio código, em comentário: *"Receitas: apenas confirmadas · Despesas: TODAS contam
 * (lançadas = comprometidas)"*. Passivo previsto com ativo confirmado não é conservadorismo:
 * é o número que dispara decisão de caixa, errado, e sempre para pior.
 *
 * Medido em produção — Esquadrias De Paula Ltda, setembro/2026: cinco recebimentos
 * previstos, R$ 68.925,99, nenhum deles no saldo acumulado.
 *
 * >>> POR QUE É UM MÓDULO, E NÃO UMA FUNÇÃO NA TELA <<<
 *
 * A condição `(BOLETO || CHEQUE_PRE_DATADO || is_split_remaining) && !paid_date` estava
 * escrita QUATRO vezes em `fluxo-de-caixa/index.tsx` — no aviso de hoje, no resumo do DFC,
 * no total diário e no pivô. É `copia-divergente.md` literal: mudar a regra em três e
 * esquecer a quarta produz uma tela que discorda de si mesma, e a divergência só aparece
 * somando à mão.
 *
 * As quatro passam a chamar daqui, e há um caso que falha se a quinta cópia nascer.
 *
 * >>> ESTE MÓDULO NÃO SABE O QUE É "EFETIVO" <<<
 *
 * O valor de uma receita vem de `getEffectiveIncomeAmount`, que é quem conhece a antecipação
 * de cartão. Reimplementá-la aqui faria o saldo e a tabela divergirem no único caso em que
 * elas não podem divergir.
 */
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'

export type ModoDaProjecao = 'PREVISTO' | 'CONFIRMADO'

/** O padrão da tela. "Projeção" só significa alguma coisa com os dois lados previstos. */
export const MODO_PADRAO: ModoDaProjecao = 'PREVISTO'

/**
 * O que uma entrada de caixa precisa ter para este módulo decidir.
 *
 * É um tipo ESTRUTURAL de propósito: a linha vem do Supabase com dezenas de colunas, e
 * pedir o tipo inteiro amarraria o módulo ao schema. O que ele lê está aqui, e só isto.
 */
export interface EntradaDeCaixa {
  type?: string | null
  amount?: number | string | null
  paid_date?: string | null
  payment_method?: string | null
  is_split_remaining?: boolean | null
  anticipated_amount?: number | string | null
}

/** As formas de recebimento que NÃO contam na competência: elas esperam a baixa. */
const FORMAS_QUE_ESPERAM_BAIXA = new Set(['BOLETO', 'CHEQUE_PRE_DATADO'])

/**
 * Recebimento lançado e ainda não baixado: boleto, cheque pré-datado ou resto de split.
 *
 * É esta função que a faixa amarela da tela usa para existir — ela é a DECOMPOSIÇÃO do que
 * o modo Previsto soma, nunca um total paralelo.
 */
export function ehRecebimentoPrevisto(e: EntradaDeCaixa): boolean {
  if (e?.type !== 'INCOME') return false
  if (e.paid_date) return false
  return FORMAS_QUE_ESPERAM_BAIXA.has(String(e.payment_method ?? '')) || e.is_split_remaining === true
}

/**
 * A entrada conta NESTE modo? Vale para os dois tipos, e é a ÚNICA porta.
 *
 * >>> A SIMETRIA É A REGRA, E ELA É LITERAL <<<
 *
 * `CONFIRMADO` pede `paid_date` dos DOIS lados. Não é "o de hoje do lado da receita": hoje
 * uma receita em PIX sem baixa conta na competência, e sob esta regra ela não conta. A
 * diferença é pequena e está medida — 13 linhas em toda a base, R$ 102.690,00, porque o
 * lançamento em PIX com vencimento passado já nasce com `paid_date` preenchido.
 *
 * Manter a exceção do lado da receita seria reintroduzir a assimetria em miniatura: dinheiro
 * que ninguém marcou como recebido entrando num saldo que se chama CONFIRMADO.
 */
export function entraNaProjecao(e: EntradaDeCaixa, modo: ModoDaProjecao): boolean {
  if (e?.type !== 'INCOME' && e?.type !== 'EXPENSE') return false
  if (modo === 'CONFIRMADO') return !!e.paid_date
  // PREVISTO: tudo que está lançado, dos dois lados. Nada a filtrar.
  return true
}

/**
 * Assinado: receita positiva, despesa negativa. Zero quando não entra no modo.
 *
 * O zero aqui é ausência de EFEITO, não um valor apurado — quem não entra no modo não move
 * o saldo. É a distinção de `ausente-vs-falso.md` com o sinal certo: a linha continua
 * existindo na tela, decomposta na faixa que lhe cabe.
 */
export function efeitoNoSaldo(e: EntradaDeCaixa, modo: ModoDaProjecao): number {
  if (!entraNaProjecao(e, modo)) return 0
  return e.type === 'INCOME' ? getEffectiveIncomeAmount(e as never) : -(Number(e.amount) || 0)
}

/** O rótulo da faixa amarela, que muda com o modo para o valor não ser lido duas vezes. */
export function rotuloDaFaixaDePrevisto(modo: ModoDaProjecao): string {
  return modo === 'PREVISTO' ? 'já somado no saldo previsto' : 'não entra no saldo confirmado'
}

/**
 * O SALDO ACUMULADO DO MÊS, dia a dia, nos dois modos.
 *
 * >>> POR QUE A DOBRA MORA AQUI, E NÃO NO COMPONENTE <<<
 *
 * O número que este comando corrige é o saldo do último dia. Deixá-lo dentro de um `useMemo`
 * o tornaria mensurável só renderizando a página — que exige sessão —, e o oráculo do
 * comando pede o número medido, não a forma dele. Aqui ele é uma função de dados em dados.
 *
 * A soma percorre as ENTRADAS, não as células de um pivô. Era por aí que o recebimento
 * previsto escapava: ele ia para um balde que a lista de rótulos somados não continha.
 */
export function saldoAcumuladoPorDia(
  entradas: readonly (EntradaDeCaixa & { due_date?: string | null })[],
  opcoes: { diasNoMes: number; saldoInicial?: number; modo: ModoDaProjecao },
): { movimento: Record<number, number>; saldoDiaAnterior: Record<number, number>; saldoAcumulado: Record<number, number> } {
  const { diasNoMes, modo } = opcoes
  const movimento: Record<number, number> = {}
  for (let d = 1; d <= diasNoMes; d++) movimento[d] = 0

  for (const e of entradas) {
    if (!e?.due_date) continue
    const dia = parseInt(String(e.due_date).substring(8, 10), 10)
    if (!(dia >= 1 && dia <= diasNoMes)) continue
    movimento[dia] += efeitoNoSaldo(e, modo)
  }

  const saldoDiaAnterior: Record<number, number> = {}
  const saldoAcumulado: Record<number, number> = {}
  let corrente = opcoes.saldoInicial ?? 0
  for (let d = 1; d <= diasNoMes; d++) {
    saldoDiaAnterior[d] = corrente
    corrente += movimento[d]
    saldoAcumulado[d] = corrente
  }
  return { movimento, saldoDiaAnterior, saldoAcumulado }
}
