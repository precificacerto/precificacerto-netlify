/**
 * A PRECIFICAÇÃO DO ORÇAMENTO PELO AGENTE (a cadeia do "sim", dono do produto, 11/11/2026): lê a empresa como a tela a lê, forma o preço pelos
 * MESMOS dois módulos (`formarPrecoDoOrcamento`) e grava pelo MESMO gravador da tela (`gravarPrecificacao`), com autor nulo — a gravação do
 * agente não é edição manual, e o arquivo sai com `gerado_origem 'agente'`.
 *
 * O que a empresa dá ao preço, lido com o cliente do servidor e o `tenant_id`:
 * - `tenant_settings`: o usuário do cálculo (`usuarioDoCalculo`, o mesmo mapa do `auth.context`), a UF e as referências de IBS e CBS;
 * - `brazilian_states`: o ICMS interno da UF da empresa;
 * - `tenant_expense_config` + `fetchTaxPreview` → `buildCalcBase`, como a página da precificação do orçamento.
 *
 * DIFERENÇA DECLARADA em relação à tela: a página roda `mergeExpenseConfig` antes de ler (recalcula as despesas a partir do fluxo de caixa e
 * GRAVA em `tenant_expense_config`). O agente NÃO grava configuração de conta: lê a que está gravada — a do último merge feito por alguém que
 * abriu uma tela. Se o fluxo de caixa mudou depois disso, o preço do agente sai com as despesas de antes. Está com o dono do produto.
 *
 * Quando o preço não se forma, nada é gravado: a resposta traz as faltas nomeadas (as mesmas frases da tela).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { buildCalcBase } from '@/utils/build-calc-base'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { usuarioDoCalculo } from '@/utils/usuario-do-calculo'
import { gravarPrecificacao, lerOrcamentoParaPrecificar, type ResultadoDaGravacao } from './orcamento-precificado'
import { formarPrecoDoOrcamento, type EmpresaDoPreco } from './preco-do-orcamento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o cliente do servidor não carrega o `Database` tipado do navegador
const db = () => supabaseAdmin as any

const numeroOuNulo = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

/** A empresa como a tela a lê no modo orçamento. A falha de leitura é erro (nunca um preço com a empresa pela metade). */
export async function lerEmpresaDoPreco(tenantId: string): Promise<EmpresaDoPreco> {
    const [settings, despesas] = await Promise.all([
        db().from('tenant_settings').select('*').eq('tenant_id', tenantId).single(),
        db().from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
    ])
    if (settings.error) throw new Error(`tenant_settings: ${settings.error.message}`)
    if (despesas.error) throw new Error(`tenant_expense_config: ${despesas.error.message}`)
    const s = settings.data as Record<string, unknown>
    const uf = typeof s.state_code === 'string' ? s.state_code.trim() : ''
    let icmsDaUf: number | null = null
    if (uf !== '') {
        const { data, error } = await db().from('brazilian_states').select('icms_internal_rate').eq('code', uf).maybeSingle()
        if (error) throw new Error(`brazilian_states: ${error.message}`)
        const taxa = numeroOuNulo((data as { icms_internal_rate?: unknown } | null)?.icms_internal_rate)
        icmsDaUf = taxa === null ? null : taxa * 100
    }
    const taxPreview = await fetchTaxPreview(tenantId, supabaseAdmin as unknown as Parameters<typeof fetchTaxPreview>[1])
    return {
        usuario: usuarioDoCalculo(s),
        calcBase: buildCalcBase(despesas.data, taxPreview),
        icmsDaUf,
        ibsDaEmpresa: numeroOuNulo(s.ibs_reference_pct),
        cbsDaEmpresa: numeroOuNulo(s.cbs_reference_pct),
    }
}

export type PrecificacaoDoAgente = { gravado: ResultadoDaGravacao } | { faltas: string[] }

/** Forma e grava o preço do orçamento como o agente; sem preço formado, devolve as faltas e não grava nada. */
export async function precificarComoAgente(tenantId: string, orcamentoId: string, agora: Date = new Date()): Promise<PrecificacaoDoAgente> {
    const [orcamento, empresa] = await Promise.all([lerOrcamentoParaPrecificar(tenantId, orcamentoId), lerEmpresaDoPreco(tenantId)])
    const r = formarPrecoDoOrcamento(orcamento, empresa)
    if ('faltas' in r) return { faltas: r.faltas }
    return { gravado: await gravarPrecificacao(tenantId, orcamentoId, { ...r.preco }, null, agora) }
}
