/**
 * O PREÇO DO ORÇAMENTO I.A. FORMADO NO SERVIDOR — a cadeia do "sim" (dono do produto, 11/11/2026: "o sim do levantamento dispara TUDO, sem
 * intervenção humana"), com a condição (c): NENHUMA terceira cópia. A conta é a dos dois módulos que a tela também chama —
 * `calcularNoMotorDoProduto` (o `doProductCalc`) e `formarPrecoDoProduto` (o `ProductPrice`) —, e este módulo só LIGA as entradas como a tela
 * as liga no modo orçamento de industrialização (`content.component.tsx`, `ehOrcamentoDeIndustrializacao`):
 *
 * - sem produto: personalizado nulo, IRPJ adicional 0, frete/seguro/acessórias 0, IS 0, IPI 0, códigos de base nulos, redução nula, não revenda;
 * - os três percentuais com que o orçamento chegou (nulo entra como 0) e os minutos da fabricação dos itens (`entradaDoMotor`);
 * - os impostos da EMPRESA: o ICMS interno da UF dela (só LR, LP e Simples Híbrido o leem); o PIS/COFINS da referência do regime (LR e LP);
 *   o IBS e a CBS de referência (nulo não entra, nem como zero);
 * - as faltas, o preço não formado e a interna pelas MESMAS funções do salvar da tela (`faltasDaPrecificacao`, `internaParaGravar`).
 *
 * A prova de que a ligação é a da tela é o teste permanente `o-servidor-forma-o-preco-da-tela.test.tsx` (servidor = tela, ao centavo, com a
 * mutação de um centavo que tem de morrer). Módulo puro: a leitura do banco fica em `preco-do-orcamento-servidor.ts`.
 */
import { calcularNoMotorDoProduto, tipoDeCalculoEfetivo } from '@/utils/motor-do-produto'
import { formarPrecoDoProduto } from '@/utils/preco-do-produto'
import { faltasDosTributosPorDentro } from '@/utils/tributo-por-dentro-informado'
import { PRODUCT_PRICE_INFO_BASE } from '@/utils/product-price-info-base'
import { pisCofinsDaReferenciaDoTenant } from '@/utils/ncm-pis-cofins'
import { resolveReducoesDoItem } from '@/utils/classificacao-fiscal'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import type { CalcBaseType } from '@/types/calc-base.type'
import type { LoggedUser } from '@/types/logged-user.type'
import {
    entradaDoMotor, faltasDaPrecificacao, internaParaGravar, PRESET_DA_COMERCIALIZACAO, somaDasLinhas,
    type OrcamentoNaPrecificacao,
} from './precificacao-do-orcamento'

export type EmpresaDoPreco = {
    usuario: Pick<LoggedUser, 'calcType' | 'taxableRegime' | 'monthlyWorkloadInMinutes' | 'unitMeasure' | 'numProductiveSectorEmployee'>
    calcBase: CalcBaseType
    /** O ICMS interno da UF da empresa, em %; `null` = a UF ou a alíquota não estão cadastradas. */
    icmsDaUf: number | null
    /** `ibs_reference_pct`/`cbs_reference_pct` da empresa; `null` = não informado (não entra, nem como zero). */
    ibsDaEmpresa: number | null
    cbsDaEmpresa: number | null
}

export type PrecoDoOrcamento = {
    valor_venda: number
    valor_operacao_interna: number
    comissao_percentual: number
    reserva_tecnica_percentual: number
    lucro_projetado_percentual: number
}

/** As frases que a tela também diz (`content.component.tsx`, `salvarOrcamento`): o servidor recusa pelas mesmas. */
export const FALTA_DA_CARGA_HORARIA = 'a carga horária da equipe produtiva (Configurações → Equipe): sem ela o valor do minuto não existe'
export const FALTA_DO_PRECO_FORMADO = 'o preço formado: a precificação não saiu (confira os percentuais e a margem)'

export function formarPrecoDoOrcamento(orcamento: OrcamentoNaPrecificacao, empresa: EmpresaDoPreco): { preco: PrecoDoOrcamento } | { faltas: string[] } {
    const { usuario, calcBase } = empresa
    const regime = usuario.taxableRegime
    const isLucroReal = regime === 'LUCRO_REAL'
    const isLucroPresumido = regime === 'LUCRO_PRESUMIDO'
    const isLRorLP = isLucroReal || isLucroPresumido
    const isLRorLPorSH = isLRorLP || regime === 'SIMPLES_HIBRIDO'
    const modo = { tipo: 'orcamento' as const, itens: orcamento.itens }

    const inicial = {
        ...PRODUCT_PRICE_INFO_BASE,
        salesCommissionPercent: orcamento.comissao_percentual ?? 0,
        rtReservePercent: orcamento.reserva_tecnica_percentual ?? 0,
        productProfitPercent: orcamento.lucro_projetado_percentual ?? 0,
        productWorkloadInMinutes: entradaDoMotor(modo, { itemsPriceSum: 0, workloadMinutes: 0 }).productWorkloadMinutes,
    }
    // o bloqueio da carga horária da tela (`isWorkloadBlocking`): a industrialização com minutos e sem a carga da equipe
    const carga = resolveMonthlyWorkload(usuario.monthlyWorkloadInMinutes, usuario.unitMeasure, usuario.numProductiveSectorEmployee)
    if (carga.isUnset && tipoDeCalculoEfetivo('PRODUZIDO', usuario.calcType) !== 'REVENDA' && inicial.productWorkloadInMinutes > 0) {
        return { faltas: [FALTA_DA_CARGA_HORARIA] }
    }

    const conta = calcularNoMotorDoProduto({
        currentUser: usuario, calcBase, productType: 'PRODUZIDO', productPriceInfo: inicial, additionalIrpjPercent: 0, customTaxPercent: null,
        isLRorLP, modo, itemsPriceSum: 0,
    })
    const info = conta ? { ...inicial, ...conta.campos, ...conta.porProdutoDoServico(inicial) } : inicial

    // os impostos da empresa, como a tela os lê (`fetchIvaRefRates` só roda em LR, LP e Simples Híbrido)
    const icmsDaUf = isLRorLPorSH ? empresa.icmsDaUf : null
    const pisCofins = isLRorLP && icmsDaUf !== null ? pisCofinsDaReferenciaDoTenant({ isLucroReal, isLucroPresumido, icmsPct: icmsDaUf }) : null
    const reducoes = resolveReducoesDoItem({ iva_reduction_ibs_pct: null, iva_reduction_cbs_pct: null, iva_dual_reduction_factor: null })
    const p = formarPrecoDoProduto({
        currentUser: usuario, calcBase, productPriceInfo: info, customTaxPercent: null, additionalIrpjPercent: 0,
        icmsPct: icmsDaUf ?? 0, pisCofinsLRPct: pisCofins ?? 0, freightValue: 0, insuranceValue: 0, accessoryExpensesValue: 0,
        ibsPct: isLRorLPorSH ? empresa.ibsDaEmpresa : null, cbsPct: isLRorLPorSH ? empresa.cbsDaEmpresa : null, isPct: 0, ipiPct: 0,
        ibsBaseCode: null, cbsBaseCode: null, isBaseCode: null, ipiBaseCode: null,
        ivaReductionIbsPct: reducoes.ibs, ivaReductionCbsPct: reducoes.cbs, isResaleProduct: false,
    })

    const faltas = faltasDaPrecificacao({
        orcamento, fiscal: { ...PRESET_DA_COMERCIALIZACAO }, aliquotaDoNcm: null,
        referenciaDoTenant: isLRorLP ? icmsDaUf !== null : null,
        // sem o motor formado não há custo a reconciliar: a falta é o preço não formado (abaixo), nunca "recalcule", que mandaria refazer um
        // cálculo que está certo (a tela, ali, mantém o custo da rodada anterior do motor e também não acusa a reconciliação)
        custoDoMotor: conta ? Number(info.productCost) || 0 : somaDasLinhas(orcamento.itens),
    })
    // NULO NÃO É ZERO (10/11/2026), aqui como na tela: no Lucro Real e no Presumido, o ICMS ou o PIS/COFINS NÃO INFORMADOS (a UF da empresa sem
    // ICMS interno) não formam preço — a conta acima usa número, e a FALTA é decidida pelo valor informado, pela MESMA função da tela
    // (`tributo-por-dentro-informado.ts`). Sem isso o servidor formaria o preço com o ICMS em zero, e a tela não.
    const semTributo = faltasDosTributosPorDentro({ taxableRegime: regime, segmento: p._segmento, icmsPct: icmsDaUf, pisCofinsPct: pisCofins }).length > 0
    // o preço que a tela emite: só o positivo, e o não formado o zera (`zerarPrecoNaoFormado`)
    const venda = p.formado && !semTributo && p.finalPriceWithTaxes > 0 ? p.finalPriceWithTaxes : 0
    if (!(venda > 0)) faltas.push(FALTA_DO_PRECO_FORMADO)
    const interna = venda > 0 ? internaParaGravar(p.baseForSalePrice, p.valorPrecificado) : null
    if (interna && 'falta' in interna) faltas.push(interna.falta)
    if (faltas.length || !interna || !('interna' in interna)) return { faltas }
    return {
        preco: {
            valor_venda: venda,
            valor_operacao_interna: interna.interna,
            comissao_percentual: Number(info.salesCommissionPercent) || 0,
            reserva_tecnica_percentual: Number(info.rtReservePercent) || 0,
            lucro_projetado_percentual: Number(info.productProfitPercent) || 0,
        },
    }
}
