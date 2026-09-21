/**
 * entrada-de-imposto.ts — a BORDA entre o que o usuário digita e o que a conta recebe.
 *
 * Comando do dono do produto de 22/09/2026, §4, registrado como está:
 *
 *   > **R$:** o usuário digita o valor destacado na nota, e o sistema **converte para
 *   > alíquota na borda** (`aliquota = valor ÷ base × 100`) antes de chamar a função pura.
 *   > **Proibido** reimplementar a conta dentro da tela ou aceitar valor direto na função.
 *
 * >>> POR QUE A CONVERSÃO É UM MÓDULO, E NÃO DUAS LINHAS NA TELA <<<
 *
 * Porque a divisão precisa da MESMA base que a multiplicação usa do outro lado, e a base do
 * PIS/COFINS não é o preço da nota: é o preço menos o ICMS destacado. Escrita na tela, a
 * conversão teria a base do jeito que quem a escreveu lembrasse — e o resultado fecharia
 * consigo mesmo, porque o valor exibido viria da mesma linha errada. É `copia-divergente.md`
 * com a assinatura que ela descreve: nada falha, e o número está errado.
 *
 * Aqui a base NÃO é recomposta: ela vem de `baseDoTributo`, em `custo-liquido-do-item.ts`,
 * que é a mesma função que a conta lê.
 *
 * >>> AUSENTE NÃO É ZERO, E VALE NOS DOIS SENTIDOS <<<
 *
 * Sem valor total da nota não há base, e sem base não há alíquota a derivar. A resposta é
 * `null` — nunca zero. Zero seria uma afirmação sobre a nota ("o tributo incidiu e deu
 * nada"), e ela entraria no custo como se tivesse sido apurada (`ausente-vs-falso.md`).
 */
import { baseDoTributo, type ValoresDaCompra, type TributoCreditavel } from '@/utils/custo-liquido-do-item'

/** Como o usuário está digitando AQUELA linha. */
export type FormatoDaEntrada = 'PCT' | 'BRL'

/**
 * O padrão é o percentual, que é como o sistema sempre funcionou.
 *
 * Ele é o padrão de APRESENTAÇÃO, não um valor gravado: uma linha sem formato gravado reabre
 * em %, e isso é diferente de uma linha gravada COMO %. A distinção não muda conta nenhuma
 * hoje, e é por isso mesmo que ela se perde fácil.
 */
export const FORMATO_PADRAO: FormatoDaEntrada = 'PCT'

/** A alíquota derivada guarda 4 casas; o valor exibido, 2. */
export const CASAS_DA_ALIQUOTA = 4
export const CASAS_DO_VALOR = 2

export const MENSAGEM_SEM_BASE = 'informe o valor total da nota primeiro'

const arredondar = (n: number, casas: number): number => {
  const f = 10 ** casas
  return Math.round(n * f) / f
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * A base SERVE para converter?
 *
 * Zero e negativo não servem, e por razões diferentes: zero é ausência de valor total, e
 * negativo é erro de digitação. As duas respondem `false`, e a tela desabilita o campo com
 * `MENSAGEM_SEM_BASE` em vez de aceitar uma divisão que não tem sentido.
 */
export function baseDisponivel(base: number | null | undefined): boolean {
  const b = num(base)
  return b != null && b > 0
}

/**
 * `alíquota = valor ÷ base × 100`, com 4 casas.
 *
 * Esta é a ÚNICA escrita da fórmula no repositório, e o caso de teste que afirma isso lê o
 * arquivo. `null` quando não há base ou não há valor — e `null` é "não informada", que a
 * função pura já sabe tratar tirando a linha da conta.
 */
export function aliquotaAPartirDoValor(
  valor: number | null | undefined,
  base: number | null | undefined,
): number | null {
  const valorDigitado = num(valor)
  const baseDaLinha = num(base)
  if (valorDigitado == null || baseDaLinha == null || !(baseDaLinha > 0)) return null
  return arredondar(valorDigitado / baseDaLinha * 100, CASAS_DA_ALIQUOTA)
}

/** O caminho inverso, para EXIBIR o valor de uma linha digitada em %. */
export function valorAPartirDaAliquota(
  aliquotaPct: number | null | undefined,
  base: number | null | undefined,
): number | null {
  const a = num(aliquotaPct)
  const b = num(base)
  if (a == null || b == null || !(b > 0)) return null
  return arredondar(b * a / 100, CASAS_DO_VALOR)
}

/**
 * A TROCA DE FORMATO — converte o que está digitado e devolve os dois lados.
 *
 * O comando pede que a troca "não mude o imposto calculado", e o que a garante é a alíquota
 * ser sempre o número que segue para a conta: o R$ é uma forma de ENTRADA, nunca um segundo
 * valor de verdade. Trocar para R$ recompõe o valor a partir da alíquota; trocar para % deriva
 * a alíquota do valor.
 *
 * Sem base, a troca não inventa nada — e, principalmente, **não apaga o que já estava
 * digitado**: a alíquota volta intacta, para que desistir da troca não custe o dado.
 */
export function converterFormato(args: {
  de: FormatoDaEntrada
  para: FormatoDaEntrada
  aliquotaPct: number | null | undefined
  valor: number | null | undefined
  base: number | null | undefined
}): { aliquotaPct: number | null; valor: number | null } {
  const { para, aliquotaPct, valor, base } = args
  if (para === 'BRL') {
    return { aliquotaPct: num(aliquotaPct), valor: valorAPartirDaAliquota(aliquotaPct, base) }
  }
  // Para %: a alíquota já é a fonte quando ela existe; o valor só manda se foi ele o digitado.
  const derivada = aliquotaAPartirDoValor(valor, base)
  return { aliquotaPct: derivada ?? num(aliquotaPct), valor: num(valor) }
}

/**
 * O formato como ele foi GRAVADO — e `null` quando o que veio não é um formato.
 *
 * Um valor desconhecido não cai no padrão em silêncio aqui: quem decide o que fazer com a
 * ausência é `entradaParaReabertura`, e ela o faz declaradamente.
 */
export function formatoGravado(v: unknown): FormatoDaEntrada | null {
  return v === 'PCT' || v === 'BRL' ? v : null
}

/**
 * A REABERTURA — o lançamento volta do jeito que foi digitado.
 *
 * O formato é propriedade DO LANÇAMENTO, não da sessão: quem digitou o ICMS em reais quer
 * conferi-lo em reais seis meses depois, contra a nota que está na gaveta. Guardá-lo só em
 * memória de tela faria a nota reabrir em % e o usuário reconferir uma divisão que ele nunca
 * fez (`fato-vs-referencia.md`: o formato é memória de como aquela nota foi lida).
 *
 * Sem base hoje, o formato é RESPEITADO e o valor fica nulo — exibir o campo em % porque a
 * base sumiu trocaria a escolha do usuário por uma conveniência da tela.
 */
export function entradaParaReabertura(
  gravado: { aliquotaPct?: number | null; formato?: unknown },
  base: number | null | undefined,
): { formato: FormatoDaEntrada; aliquotaPct: number | null; valor: number | null } {
  const formato = formatoGravado(gravado?.formato) ?? FORMATO_PADRAO
  const aliquotaPct = num(gravado?.aliquotaPct)
  return {
    formato,
    aliquotaPct,
    valor: aliquotaPct == null ? null : valorAPartirDaAliquota(aliquotaPct, base),
  }
}

/**
 * A base de uma linha, a partir dos valores da compra — o atalho que a tela usa.
 *
 * Ele existe para que a tela NÃO importe `baseDoTributo` e decida sozinha o que passar:
 * a assinatura aqui pede os `ValoresDaCompra` inteiros, que é o objeto que a tela já monta
 * para a conta. Um atalho que aceitasse "a base" receberia a base errada mais cedo ou mais
 * tarde.
 */
export function baseDaLinha(valores: ValoresDaCompra, tributo: TributoCreditavel): number {
  return baseDoTributo(valores, tributo)
}

/**
 * O NOME DO CAMPO no formulário, por tributo — e a coluna correspondente na nota.
 *
 * Os três mapas moram juntos de propósito. Eles são o mesmo mapeamento visto de três
 * lugares (tela, alíquota gravada, formato gravado), e é exatamente a figura de
 * `copia-divergente.md`: escritos em três arquivos, acrescentar um tributo acertaria dois e
 * esqueceria o terceiro — sem nada falhar, porque a coluna que falta chega `undefined`.
 */
export const CAMPO_DA_ALIQUOTA: Record<TributoCreditavel, string> = {
  ICMS: 'icms_rate',
  PIS_COFINS: 'pis_cofins_rate',
  IPI: 'ipi_rate',
  CBS: 'cbs_rate',
  IBS: 'ibs_rate',
}

export const COLUNA_DA_ALIQUOTA: Record<TributoCreditavel, string> = {
  ICMS: 'rate_icms',
  PIS_COFINS: 'rate_pis_cofins',
  IPI: 'rate_ipi',
  CBS: 'rate_cbs',
  IBS: 'rate_ibs',
}

export const COLUNA_DO_FORMATO: Record<TributoCreditavel, string> = {
  ICMS: 'input_mode_icms',
  PIS_COFINS: 'input_mode_pis_cofins',
  IPI: 'input_mode_ipi',
  CBS: 'input_mode_cbs',
  IBS: 'input_mode_ibs',
}

const TRIBUTOS: readonly TributoCreditavel[] = ['ICMS', 'PIS_COFINS', 'IPI', 'CBS', 'IBS'] as const

/**
 * O que a nota grava sobre a ENTRADA: a alíquota e o formato de cada linha.
 *
 * A alíquota vai junto do formato porque sozinho ele não reabre nada — é a alíquota que
 * recompõe o valor em R$. E ela é gravada como `null` quando ausente: zero afirmaria que o
 * tributo incidiu e deu nada, que é a distinção do oráculo E.
 */
export function colunasDaEntrada(
  aliquotas: Partial<Record<TributoCreditavel, number | null | undefined>>,
  formatos: Partial<Record<TributoCreditavel, FormatoDaEntrada | undefined>>,
): Record<string, number | string | null> {
  const saida: Record<string, number | string | null> = {}
  for (const t of TRIBUTOS) {
    saida[COLUNA_DA_ALIQUOTA[t]] = num(aliquotas[t])
    saida[COLUNA_DO_FORMATO[t]] = formatoGravado(formatos[t]) ?? FORMATO_PADRAO
  }
  return saida
}

/**
 * O caminho de volta: da linha gravada para o estado do formulário, tributo a tributo.
 *
 * >>> ESTA FUNÇÃO AINDA NÃO TEM TELA QUE A CHAME <<<
 *
 * A edição de uma nota de compra já lançada NÃO EXISTE no sistema — o drawer de despesa só
 * cria. O formato é gravado e esta função o devolve, testada; o que falta é a tela, e está
 * declarado aqui em vez de a ausência ser descoberta depois (`portao-que-nao-alcanca.md`:
 * dizer o alcance real vale mais que o nome bonito).
 */
export function entradaDaNotaGravada(
  linha: Record<string, unknown> | null | undefined,
  base: number | null | undefined,
): Record<TributoCreditavel, { formato: FormatoDaEntrada; aliquotaPct: number | null; valor: number | null }> {
  const saida = {} as Record<TributoCreditavel, ReturnType<typeof entradaParaReabertura>>
  for (const t of TRIBUTOS) {
    saida[t] = entradaParaReabertura(
      {
        aliquotaPct: num(linha?.[COLUNA_DA_ALIQUOTA[t]]),
        formato: linha?.[COLUNA_DO_FORMATO[t]],
      },
      // A base do PIS/COFINS depende da alíquota do ICMS gravada, e não do preço da nota.
      baseDoTributo(
        {
          base: num(base) ?? 0,
          icmsPct: num(linha?.[COLUNA_DA_ALIQUOTA.ICMS]),
        },
        t,
      ),
    )
  }
  return saida
}
