/**
 * serie-e-estorno.ts — quem sai junto numa exclusão, e o que um estorno lança.
 *
 * Comando do dono do produto de 23/09/2026, §6. Duas decisões moram aqui, e as duas são de
 * servidor: a tela não manda lista de ids, porque *"lista montada no cliente é a que apaga a
 * parcela que alguém pagou entre o clique e o confirm"*.
 *
 * >>> O PAGAMENTO É A LINHA <<<
 *
 *   > NENHUMA parcela da série paga → exclui a série inteira.
 *   > UMA OU MAIS PAGAS → a exclusão da série é VETADA.
 *
 * Não é conservadorismo: uma parcela paga é dinheiro que saiu, e apagá-la faz o caixa
 * discordar do extrato. O caminho para desfazer um pagamento que OCORREU é o estorno, que
 * lança o contrário em vez de apagar o fato.
 *
 * >>> ESTORNO NÃO É CANCELAMENTO DE PAGAMENTO <<<
 *
 * | | o que aconteceu no mundo | o que o sistema faz |
 * |---|---|---|
 * | **Cancelar Pagamento** | o pagamento NUNCA ocorreu — foi registrado por engano | limpa `paid_date` |
 * | **Estornar** | o pagamento OCORREU e foi desfeito — devolução, nota cancelada, chargeback | lança o espelho, e o `paid_date` PERMANECE |
 *
 * Apagar `paid_date` num estorno apagaria a saída de caixa que de fato houve, e o mês
 * original passaria a mentir. O espelho existe para que os dois fatos coexistam: saiu em
 * agosto, voltou em setembro.
 *
 * >>> A COMPETÊNCIA DO ESTORNO É A DO EVENTO QUE O MOTIVA <<<
 *
 * O estorno é lançado no período do evento que o motiva, nunca retroagido: LC 87/1996 art.
 * 21 para o ICMS; mesma lógica de período para PIS/COFINS (Leis 10.637/2002 e 10.833/2003
 * art. 3º) e para IBS/CBS (LC 214/2025 art. 47, crédito vinculado à operação que o
 * originou). Reescrever a apuração de agosto porque a devolução foi em setembro seria
 * refazer uma apuração já entregue — e `fato-vs-referencia.md` é sobre exatamente isso: o
 * apurado é fato histórico, não referência viva.
 */

/** Um lançamento da série, com o mínimo que a decisão precisa. */
export interface LancamentoDaSerie {
  id: string
  due_date: string
  amount: number
  paid_date?: string | null
  is_active?: boolean | null
  reversed_at?: string | null
}

export type EscopoDaExclusao = 'SERIE' | 'SO_ESTE'

/** Como a série foi encontrada — e a terceira é a que o legado tem. */
export type VinculoDaSerie = 'NOTA' | 'GRUPO' | 'SOZINHO'

export const AVISO_SEM_VINCULO =
  'Este lançamento não guarda vínculo com as demais parcelas (lançado antes de 23/09/2026). Só ele será excluído.'

/**
 * Qual vínculo usar, NESTA ordem.
 *
 * A nota vem primeiro porque é o documento: uma compra em 6x é uma nota e seis parcelas, e é
 * a nota que diz quais são as seis. O grupo cobre a despesa parcelada que não tem nota.
 *
 * >>> E NÃO HÁ QUARTA OPÇÃO <<<
 * Inferir irmãs por descrição ("2/6") + categoria + data acertaria nove em dez — e na décima
 * apagaria a parcela de outra compra que por acaso tem a mesma descrição. Um agrupamento que
 * erra em silêncio é pior que a ausência de agrupamento, porque a ausência avisa.
 */
export function vinculoDaSerie(e: {
  purchase_invoice_id?: string | null
  installment_group_id?: string | null
}): VinculoDaSerie {
  if (e.purchase_invoice_id) return 'NOTA'
  if (e.installment_group_id) return 'GRUPO'
  return 'SOZINHO'
}

export interface ParcelaPaga {
  id: string
  due_date: string
  amount: number
}

export interface DecisaoDaExclusao {
  /** `false` só no veto: escopo SERIE com alguma parcela paga. */
  permitido: boolean
  motivo?: 'SERIE_COM_PAGA' | 'ALVO_PAGO' | 'ALVO_FORA_DA_SERIE'
  /** Os ids a desativar. VAZIO quando `permitido` é `false` — nada é tocado. */
  aDesativar: string[]
  /** As pagas, para a tela listar com data e valor e oferecer o estorno. */
  pagas: ParcelaPaga[]
}

const ativa = (e: LancamentoDaSerie) => e.is_active !== false
const paga = (e: LancamentoDaSerie) => !!e.paid_date

/**
 * A classificação, feita sobre a série RELIDA no servidor.
 *
 * `SO_ESTE` também é recusado quando o próprio alvo está pago: a alternativa oferecida ali
 * é o estorno, e deixar passar apagaria o pagamento pela porta estreita depois de a larga
 * ter sido fechada.
 */
export function classificarExclusao(args: {
  escopo: EscopoDaExclusao
  serie: LancamentoDaSerie[]
  alvo: string
}): DecisaoDaExclusao {
  const serie = (args.serie ?? []).filter(ativa)
  const pagas: ParcelaPaga[] = serie
    .filter(paga)
    .map((e) => ({ id: e.id, due_date: e.due_date, amount: Number(e.amount) || 0 }))

  if (args.escopo === 'SO_ESTE') {
    const alvo = serie.find((e) => e.id === args.alvo)
    if (!alvo) return { permitido: false, motivo: 'ALVO_FORA_DA_SERIE', aDesativar: [], pagas }
    if (paga(alvo)) return { permitido: false, motivo: 'ALVO_PAGO', aDesativar: [], pagas }
    return { permitido: true, aDesativar: [alvo.id], pagas }
  }

  if (pagas.length > 0) return { permitido: false, motivo: 'SERIE_COM_PAGA', aDesativar: [], pagas }
  return { permitido: true, aDesativar: serie.map((e) => e.id), pagas }
}

/**
 * A NOTA acompanha a série, e só quando não sobra nada ativo apontando para ela.
 *
 *   > Sobrou parcela paga → A NOTA FICA INTEIRA, COM O CRÉDITO INTEIRO. O crédito é da
 *   > entrada da mercadoria, não da parcela; reduzi-lo proporcionalmente à parcela apagada
 *   > inventaria um rateio que a lei não faz.
 */
export function notaDeveSerDesativada(restantesAtivos: number): boolean {
  return restantesAtivos === 0
}

/** O lançamento original, com o que o espelho precisa copiar. */
export interface LancamentoOriginal {
  id: string
  tenant_id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description?: string | null
  paid_date?: string | null
  expense_category?: string | null
  expense_group?: string | null
  purchase_invoice_id?: string | null
}

export const PREFIXO_DO_ESTORNO = 'Estorno — '

/**
 * O ESPELHO — o lançamento que desfaz, sem apagar o que houve.
 *
 * `type` invertido e `amount` igual: uma despesa paga estornada devolve dinheiro, e no caixa
 * isso é uma entrada. `due_date` e `paid_date` são a data do estorno, porque é quando o
 * dinheiro voltou — e é isso que põe o efeito no mês do evento e deixa o mês original
 * intacto.
 *
 * >>> OS `valor_*` DE CRÉDITO SAEM ZERADOS <<<
 * O crédito é da NOTA, e é lá que ele é estornado. Copiá-los para o espelho criaria um
 * segundo crédito, de sinal trocado, competindo com o da nota pela mesma apuração.
 */
export function espelhoDoEstorno(
  original: LancamentoOriginal,
  dataDoEstorno: string,
): Record<string, unknown> {
  return {
    tenant_id: original.tenant_id,
    type: original.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE',
    amount: Number(original.amount) || 0,
    description: `${PREFIXO_DO_ESTORNO}${original.description ?? ''}`,
    due_date: dataDoEstorno,
    paid_date: dataDoEstorno,
    origin_type: 'ESTORNO',
    origin_id: original.id,
    reversal_of_entry_id: original.id,
    recurrence_type: 'ONCE',
    expense_category: original.expense_category ?? null,
    expense_group: original.expense_group ?? null,
    // Zerados, e NÃO omitidos: a coluna existe e o espelho afirma que ele não carrega
    // crédito nenhum. Omitir deixaria `null`, que em `ausente-vs-falso.md` é "não apurado".
    valor_icms: 0,
    valor_pis: 0,
    valor_cofins: 0,
    valor_ipi: 0,
    valor_cbs: 0,
    valor_ibs: 0,
  }
}

/**
 * A NOTA inteira está estornada?
 *
 * Só quando NENHUMA entrada dela segue ativa e não estornada. Uma parcela ainda viva
 * significa que parte da compra continua de pé, e o crédito com ela.
 */
export function notaEstaEstornada(entradas: LancamentoDaSerie[]): boolean {
  const vivas = (entradas ?? []).filter((e) => ativa(e) && !e.reversed_at)
  return (entradas ?? []).length > 0 && vivas.length === 0
}
