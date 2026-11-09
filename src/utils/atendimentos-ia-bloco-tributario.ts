/**
 * O BLOCO TRIBUTÁRIO do item da tabela de fornecedor (dono do produto, 02/11/2026; migração `20261102000001`, pendente até o dono do produto aplicar).
 *
 * Formulação do dono do produto, registrada como está:
 *   "Leia essas 12 colunas do arquivo pelo cabeçalho, com os nomes exatos acima. Célula vazia -> NULL. Célula com 0 -> 0. Texto em coluna numérica
 *    -> erro nomeado, não vira 0. Recalcule credito_pct, credito_valor e custo_liquido pelos percentuais e pelo custo bruto. Se divergir do que veio
 *    no arquivo, grave o que veio no arquivo E reporte a divergência item a item no resultado da importação. Não escolha sozinho. Os percentuais do
 *    bloco NÃO creditável não entram no líquido. Arquivo sem essas colunas continua importando como hoje (as 12 ficam NULL)."
 *
 * E as respostas dele às perguntas do PR (02/11/2026):
 *   - o custo bruto é `custo` (a coluna 12 da aba de preço); divergência é diferença acima de 0,01 (R$ e ponto percentual). A conta do resultado
 *     era a soma dos percentuais sobre o bruto; desde 09/11/2026 é a CASCATA (`recalcularBloco`);
 *   - "IPI pelo par; resto exigido": ICMS, PIS/COFINS, IBS e CBS creditáveis têm de estar preenchidos; o IPI creditável entra se preenchido, e
 *     vazio só vale com o IPI não creditável preenchido. Fora disso, o item é NÃO RECALCULÁVEL — reportado, nomeando o que falta —, e grava o que veio;
 *   - texto numa das 12 colunas RECUSA a importação inteira, nomeando cada célula.
 *
 * NULL é "o fornecedor não informou"; 0 é "alíquota zero". Nada aqui troca um pelo outro (`ausente-vs-falso.md`): não há `?? 0` nem COALESCE.
 * Este módulo só LÊ e CONFERE: o cálculo do orçamento e a conversa não usam estas colunas (o pedido: "só gravação e leitura").
 */

/** O bloco creditável, na ordem do pedido. */
export const COLUNAS_CREDITAVEIS = ['cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ibs_pct', 'cred_cbs_pct', 'cred_ipi_pct'] as const
/** O bloco não creditável: nunca entra no líquido. */
export const COLUNAS_NAO_CREDITAVEIS = ['nc_ipi_pct', 'nc_icms_st_pct', 'nc_difal_pct', 'nc_is_pct'] as const
/** O resultado, como veio no arquivo. */
export const COLUNAS_DO_RESULTADO = ['credito_pct', 'credito_valor', 'custo_liquido'] as const
/** As 12, com os nomes EXATOS do cabeçalho do arquivo (são também os nomes das colunas do banco). */
export const COLUNAS_DO_BLOCO_TRIBUTARIO = [...COLUNAS_CREDITAVEIS, ...COLUNAS_NAO_CREDITAVEIS, ...COLUNAS_DO_RESULTADO] as const
export type ColunaDoBlocoTributario = (typeof COLUNAS_DO_BLOCO_TRIBUTARIO)[number]
export type BlocoTributario = Record<ColunaDoBlocoTributario, number | null>

/** Os percentuais (a faixa 0..100 da CHECK `orcamentista_tabela_item_percentual_na_faixa`): as 12 menos as duas em R$. */
export const COLUNAS_PERCENTUAIS: readonly ColunaDoBlocoTributario[] = COLUNAS_DO_BLOCO_TRIBUTARIO.filter((c) => c !== 'credito_valor' && c !== 'custo_liquido')

/** A diferença acima da qual o recalculado diverge do arquivo (dono do produto, 02/11/2026): 0,01 em R$ e em ponto percentual. */
export const TOLERANCIA_DA_DIVERGENCIA = 0.01

/** O item sem bloco tributário: o arquivo não traz as colunas (ou a seção não as tem). Cada uma é NULL — não informado. */
export const blocoVazio = (): BlocoTributario =>
    Object.fromEntries(COLUNAS_DO_BLOCO_TRIBUTARIO.map((c): [string, null] => [c, null])) as BlocoTributario

export type Recalculo =
    | { ok: true; credito_pct: number; credito_valor: number; custo_liquido: number }
    /**
     * Não recalculável, com o nome do que falta. `ate_o_icms` é o saldo depois do crédito de ICMS quando a cascata andou até ali e parou
     * (PIS/COFINS vazio): a cascata para, e nada é suposto no lugar do que falta — nem 0, nem 9,25.
     */
    | { ok: false; faltam: string[]; ate_o_icms?: number }

/**
 * O recálculo do resultado pela CASCATA (dono do produto, 09/11/2026 — `docs/regras/custo-liquido-por-fracao.md`), na unidade de compra:
 *
 *   crédito de ICMS       = bruto × ICMS                 (sobre o bruto)
 *   crédito de PIS/COFINS = (bruto − crédito de ICMS) × PIS/COFINS   (sobre o SALDO)
 *   crédito de IPI        = bruto × IPI creditável        (fora da cascata, com base própria: o bruto)
 *   IPI sem crédito       = bruto × IPI não creditável    (compõe o custo)
 *   custo_liquido = bruto − créditos + IPI sem crédito;  credito_valor = os créditos;  credito_pct = credito_valor ÷ bruto × 100 (o efetivo)
 *
 * Substitui a soma do #208 (02/11/2026: credito_pct = a soma dos percentuais, aplicada sobre o bruto). Sem arredondar no meio: o número da
 * entrada é o que se divide depois (`custoLiquidoDaFracao`).
 *
 * Falta de dado é NÃO RECALCULÁVEL, com o nome do que falta — nunca 0 no lugar (`faltou-dado-recusa-nomeada.md`):
 *   - o custo e o ICMS são exigidos; sem o ICMS a cascata não começa;
 *   - sem o PIS/COFINS a cascata PARA depois do ICMS (`ate_o_icms`);
 *   - o IPI vai pelo par (decisão de 02/11/2026): o creditável ou o não creditável, um dos dois;
 *   - IBS e CBS continuam exigidos (decisão de 02/11/2026); a regra da cascata não diz onde entram, então só o 0 passa — o percentual acima
 *     de 0 é não recalculável, nomeado, até o dono do produto decidir;
 *   - ICMS-ST, DIFAL e IS não entram (a regra só põe o IPI sem crédito no custo).
 */
export function recalcularBloco(custo: number | null, b: BlocoTributario): Recalculo {
    const faltam: string[] = []
    if (custo === null) faltam.push('custo')
    if (b.cred_icms_pct === null) faltam.push('cred_icms_pct')
    if (b.cred_pis_cofins_pct === null) faltam.push('cred_pis_cofins_pct')
    for (const c of ['cred_ibs_pct', 'cred_cbs_pct'] as const) {
        const v = b[c]
        if (v === null) faltam.push(c)
        else if (v !== 0) faltam.push(`${c} = ${n(v)}: a cascata de 09/11/2026 não diz onde o IBS e a CBS entram`)
    }
    if (b.cred_ipi_pct === null && b.nc_ipi_pct === null) faltam.push('cred_ipi_pct (ou nc_ipi_pct, quando o IPI não é creditável)')
    if (custo === null || b.cred_icms_pct === null) return { ok: false, faltam }
    const icms = (custo * b.cred_icms_pct) / 100
    const saldo = custo - icms
    if (b.cred_pis_cofins_pct === null) return { ok: false, faltam, ate_o_icms: saldo }
    if (faltam.length > 0) return { ok: false, faltam }
    const pis = (saldo * b.cred_pis_cofins_pct) / 100
    const ipiCreditado = b.cred_ipi_pct === null ? 0 : (custo * b.cred_ipi_pct) / 100
    const ipiSemCredito = b.nc_ipi_pct === null ? 0 : (custo * b.nc_ipi_pct) / 100
    const credito_valor = icms + pis + ipiCreditado
    return { ok: true, credito_pct: custo === 0 ? 0 : (credito_valor / custo) * 100, credito_valor, custo_liquido: custo - credito_valor + ipiSemCredito }
}

/**
 * O custo líquido da FRAÇÃO (dono do produto, 09/11/2026): o líquido da unidade de compra dividido pela medida dela (6 m, 5,50 m, 1 peça).
 * A cascata roda antes, na unidade de compra; a divisão vem depois. Medida ausente ou não positiva não divide: é nulo, nunca o líquido inteiro.
 */
export function custoLiquidoDaFracao(custoLiquidoDaUnidade: number, medidaDaUnidade: number | null): number | null {
    if (medidaDaUnidade === null || !Number.isFinite(medidaDaUnidade) || medidaDaUnidade <= 0) return null
    return custoLiquidoDaUnidade / medidaDaUnidade
}

export type DivergenciaDoBloco = { coluna: (typeof COLUNAS_DO_RESULTADO)[number]; arquivo: number; calculado: number }

/**
 * As colunas do resultado em que o arquivo e o recalculado diferem por mais de `TOLERANCIA_DA_DIVERGENCIA`. Coluna do resultado vazia no
 * arquivo não diverge: o fornecedor não a informou, e o vazio fica gravado como vazio (nada é preenchido com o calculado).
 */
export function divergenciasDoBloco(b: BlocoTributario, r: Extract<Recalculo, { ok: true }>): DivergenciaDoBloco[] {
    const saida: DivergenciaDoBloco[] = []
    for (const coluna of COLUNAS_DO_RESULTADO) {
        const arquivo = b[coluna]
        if (arquivo === null) continue
        if (Math.abs(arquivo - r[coluna]) > TOLERANCIA_DA_DIVERGENCIA) saida.push({ coluna, arquivo, calculado: r[coluna] })
    }
    return saida
}

/** O número como se lê na mensagem: até 4 casas, com vírgula. */
const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export const fraseDaDivergenciaDoBloco = (codigo: string, linha: number, ds: readonly DivergenciaDoBloco[]) =>
    `código ${codigo} (linha ${linha}): ${ds.map((d) => `${d.coluna} veio ${n(d.arquivo)} e o recálculo dá ${n(d.calculado)}`).join('; ')} — gravado o que veio no arquivo`

export const fraseDoBlocoNaoRecalculavel = (codigo: string, linha: number, faltam: readonly string[]) =>
    `código ${codigo} (linha ${linha}): o resultado do bloco tributário não pôde ser recalculado — falta ${faltam.join(', ')}; gravado o que veio no arquivo`

/** Uma célula das 12 que não é número, nomeada para a recusa. */
export type CelulaInvalidaDoBloco = { linha: number; coluna: string; valor: string; motivo: string }

const MAX_NOMEADAS = 10
const nomeadas = <T>(xs: readonly T[], f: (x: T) => string) =>
    xs.slice(0, MAX_NOMEADAS).map(f).join('; ') + (xs.length > MAX_NOMEADAS ? `; e mais ${xs.length - MAX_NOMEADAS}` : '')

export const fraseDasCelulasInvalidasDoBloco = (aba: string, cs: readonly CelulaInvalidaDoBloco[]) =>
    `A aba "${aba}" tem ${cs.length} ${cs.length === 1 ? 'célula' : 'células'} do bloco tributário que não ${cs.length === 1 ? 'é número' : 'são números'}: `
    + `${nomeadas(cs, (c) => `linha ${c.linha}, ${c.coluna} = "${c.valor}" (${c.motivo})`)}. Vazio é "não informado" e 0 é "alíquota zero"; texto não vira nenhum dos dois. Nada foi gravado.`

/** Um item que o banco recusaria (a CHECK do IPI ou a da faixa), nomeado antes de gravar. */
export type ItemForaDaRegraDoBloco = { codigo: string; linha: number; motivo: string }

export const fraseDosItensForaDaRegraDoBloco = (aba: string, xs: readonly ItemForaDaRegraDoBloco[]) =>
    `A aba "${aba}" tem ${xs.length} ${xs.length === 1 ? 'item' : 'itens'} com o bloco tributário fora da regra: `
    + `${nomeadas(xs, (x) => `código ${x.codigo} (linha ${x.linha}): ${x.motivo}`)}. Nada foi gravado.`

/** As regras que o banco confere (as duas CHECKs da `20261102000001`), conferidas antes de gravar para a recusa nomear o item. */
export function foraDaRegraDoBloco(b: BlocoTributario): string[] {
    const motivos: string[] = []
    if (b.cred_ipi_pct !== null && b.nc_ipi_pct !== null) motivos.push('cred_ipi_pct e nc_ipi_pct preenchidos — o IPI é creditável ou não creditável, nunca os dois')
    for (const c of COLUNAS_PERCENTUAIS) {
        const v = b[c]
        if (v !== null && (v < 0 || v > 100)) motivos.push(`${c} = ${n(v)}, fora de 0 a 100`)
    }
    return motivos
}
