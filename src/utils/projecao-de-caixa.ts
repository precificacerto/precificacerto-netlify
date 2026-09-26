/**
 * projecao-de-caixa.ts — QUEM entra no saldo acumulado, e com que sinal.
 *
 * >>> UMA LEITURA SÓ: ENTRADAS LANÇADAS MENOS SAÍDAS LANÇADAS <<<
 *
 * Com ou sem baixa, dos dois lados. É a definição de fluxo de caixa.
 *
 * O #79 entregou DUAS leituras, Previsto e Confirmado, com um seletor na tela. O seletor
 * saiu em 26/09/2026, por decisão do PO, e a razão vale mais que o botão:
 *
 *   "Confirmado" NÃO é fluxo de caixa — é extrato do que já ocorreu, e essa pergunta é
 *   respondida pelo DRE por caixa. Duas leituras na mesma tela obrigam o usuário a saber
 *   em qual delas está ANTES de acreditar no número, e o modo errado é indistinguível do
 *   certo quando alguém tira print.
 *
 * O parâmetro `modo` foi REMOVIDO, e não deixado com valor padrão. Parâmetro que ninguém
 * passa é caminho morto, e caminho morto não é testado — o verde dele é o de
 * `teste-que-nao-exercita.md`. Se o Confirmado voltar, volta como tela própria.
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
 * o saldo já soma, nunca um total paralelo. Ela SOBREVIVEU à saída do seletor porque a
 * faixa sobreviveu: sem ela, o usuário soma o valor ao saldo de novo.
 */
export function ehRecebimentoPrevisto(e: EntradaDeCaixa): boolean {
  if (e?.type !== 'INCOME') return false
  if (e.paid_date) return false
  return FORMAS_QUE_ESPERAM_BAIXA.has(String(e.payment_method ?? '')) || e.is_split_remaining === true
}

/**
 * A entrada conta no fluxo? Vale para os dois tipos, e é a ÚNICA porta.
 *
 * >>> ELA FICOU, MESMO DEVOLVENDO `true` PARA TUDO QUE É LANÇAMENTO <<<
 *
 * A tentação é apagá-la e deixar cada chamador filtrar por tipo. Ela existe por duas razões
 * que continuam de pé sem o modo: é ela que recusa uma linha de tipo desconhecido — o
 * `PREV_MONTH_BALANCE` e o que vier depois dele —, e é ela o lugar ÚNICO onde a próxima
 * exclusão vai morar. Espalhada pelos quatro chamadores, a próxima regra nasce em três.
 */
export function entraNaProjecao(e: EntradaDeCaixa): boolean {
  return e?.type === 'INCOME' || e?.type === 'EXPENSE'
}

/**
 * Assinado: receita positiva, despesa negativa. Sempre — com baixa ou sem.
 *
 * O zero é ausência de EFEITO, não um valor apurado: uma linha que não é lançamento não
 * move o saldo. É a distinção de `ausente-vs-falso.md` com o sinal certo.
 */
export function efeitoNoSaldo(e: EntradaDeCaixa): number {
  if (!entraNaProjecao(e)) return 0
  return e.type === 'INCOME' ? getEffectiveIncomeAmount(e as never) : -(Number(e.amount) || 0)
}

/**
 * O rótulo da faixa amarela — texto ÚNICO, agora que a leitura é uma só.
 *
 * Continua sendo função e não constante de propósito: é o ponto onde o texto é decidido, e
 * um `const` exportado seria copiado para dentro do JSX na primeira vez que alguém quisesse
 * "só ajustar a frase".
 */
export function rotuloDaFaixaDePrevisto(): string {
  return 'já somado no saldo'
}

/**
 * O SALDO ACUMULADO DO MÊS, dia a dia.
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
  opcoes: { diasNoMes: number; saldoInicial?: number },
): { movimento: Record<number, number>; saldoDiaAnterior: Record<number, number>; saldoAcumulado: Record<number, number> } {
  const { diasNoMes } = opcoes
  const movimento: Record<number, number> = {}
  for (let d = 1; d <= diasNoMes; d++) movimento[d] = 0

  for (const e of entradas) {
    if (!e?.due_date) continue
    const dia = parseInt(String(e.due_date).substring(8, 10), 10)
    if (!(dia >= 1 && dia <= diasNoMes)) continue
    movimento[dia] += efeitoNoSaldo(e)
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
