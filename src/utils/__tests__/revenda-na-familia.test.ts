/**
 * PORTÃO — a família de REVENDA (dono do produto, 23/11/2026): "na precificação, que é por industrialização, nós vamos ter, PARALELO a isso,
 * o REVENDA para algumas famílias. E ele funciona praticamente igual, praticamente ESPELHADO o fabricação." Sem mão de obra de produção,
 * com a margem de contribuição — o produto de revenda da tela de produto.
 *
 * O que este portão fica vermelho:
 *   (1) o custo: o item de revenda não exige tempo nem valor do minuto, e grava fabricação 0, tempo 0 e valor do minuto NULO; o fabricado
 *       ao lado continua exigindo os dois;
 *   (2) o formato do orçamento pelas famílias dos itens: não escolhido, item sem família e fabricação com revenda no mesmo orçamento são
 *       recusa nomeada — nunca a fabricação por omissão; o tipo do produto no motor sai dele;
 *   (3) a falta do formato entra nas faltas da precificação, e o orçamento sem item não ganha uma segunda falta.
 */
import { custoDoOrcamento, entradaDaPrecificacao, valorDoMinuto, type EntradaDoCusto, type MaterialDaTabela, type Percentuais } from '@/lib/atendimentos-ia/custo-do-orcamento'
import {
    faltasDaPrecificacao, formatoDoOrcamento, fraseDaFamiliaSemFormato, fraseDosFormatosMisturados, FRASE_ITEM_SEM_FAMILIA,
    FRASE_ORCAMENTO_SEM_ITEM_PARA_O_FORMATO, tipoDoProdutoDoOrcamento, type OrcamentoNaPrecificacao,
} from '@/lib/atendimentos-ia/precificacao-do-orcamento'

const COMPLETO: Percentuais = { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null, cred_ibs_pct: 0, cred_cbs_pct: 0 }
const material = (codigo: string, valor: number): MaterialDaTabela =>
    ({ caminho: 'perfil', codigo, codigo_na_tabela: codigo, resolucao: 'exato', custo: null, descricao: `PERFIL ${codigo}`, unidade: 'BR', vendido_por: 'barra', medida_barra_m: 6, valor_barra_interno: valor, bloco: COMPLETO })
const MINUTO = valorDoMinuto(40813.03, 52800) as number
const entrada = (itens: EntradaDoCusto['itens'], valor_minuto: number | null): EntradaDoCusto => ({
    itens, barras_por_codigo: { A: 1 }, materiais: { 'perfil:A': material('A', 600) }, valor_minuto,
})
const peca = [{ codigo: 'A', comprimento_mm: 1500, quantidade: 2 }]

describe('(1) o custo do item de revenda', () => {
    it('sem tempo e SEM valor do minuto: fecha, com fabricação 0, tempo 0 e valor do minuto nulo — o total é só o material', () => {
        const r = custoDoOrcamento(entrada([{ referencia: 'item 1 (DP-02)', minutos: null, pecas: peca, revenda: true }], null))
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        const [i] = r.itens
        expect(i.tempo_fabricacao_min).toBe(0)
        expect(i.valor_minuto).toBeNull()
        expect(i.custo_fabricacao).toBe(0)
        expect(i.custo_liquido_total).toBeCloseTo(i.custo_liquido_materiais, 12)
        expect(i.custo_liquido_materiais).toBeGreaterThan(0)
        expect(entradaDaPrecificacao(r.itens).productWorkloadMinutes).toBe(0)
    })
    it('os minutos que viessem num item de revenda são IGNORADOS (não fabrica), mesmo com valor do minuto', () => {
        const r = custoDoOrcamento(entrada([{ referencia: 'item 1', minutos: 240, pecas: peca, revenda: true }], MINUTO))
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        expect(r.itens[0]).toMatchObject({ tempo_fabricacao_min: 0, custo_fabricacao: 0, valor_minuto: null })
    })
    it('CONTRASTE: o mesmo item FABRICADO sem tempo recusa pelo tempo, e sem valor do minuto recusa pelo valor', () => {
        const semTempo = custoDoOrcamento(entrada([{ referencia: 'item 1 (DP-02)', minutos: null, pecas: peca }], MINUTO))
        expect('recusas' in semTempo && semTempo.recusas.join(' ')).toContain('item 1 (DP-02)')
        const semValor = custoDoOrcamento(entrada([{ referencia: 'item 1', minutos: 60, pecas: peca }], null))
        expect('recusas' in semValor).toBe(true)
    })
    it('revenda AO LADO de um fabricado: o fabricado continua exigindo o valor do minuto, e só ele tem fabricação', () => {
        const itens = [{ referencia: 'item 1', minutos: 60, pecas: peca }, { referencia: 'item 2', minutos: null as number | null, pecas: peca, revenda: true }]
        expect('recusas' in custoDoOrcamento(entrada(itens, null))).toBe(true)
        const r = custoDoOrcamento(entrada(itens, MINUTO))
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        expect(r.itens.map((i) => i.custo_fabricacao)).toEqual([60 * MINUTO, 0])
        expect(r.itens.map((i) => i.valor_minuto)).toEqual([MINUTO, null])
    })
})

describe('(2) o formato do orçamento, pelas famílias dos itens', () => {
    const f = (pares: Array<[string, 'FABRICACAO' | 'REVENDA' | null]>) => new Map(pares)
    it('todas de revenda: REVENDA; todas de fabricação: FABRICACAO — e o tipo do produto no motor acompanha', () => {
        const rev = formatoDoOrcamento([{ ordem: 1, familia: 'ALU' }, { ordem: 2, familia: 'ALU' }], f([['ALU', 'REVENDA']]))
        expect(rev).toEqual({ formato: 'REVENDA' })
        expect(tipoDoProdutoDoOrcamento({ formato: rev })).toBe('REVENDA')
        const fab = formatoDoOrcamento([{ ordem: 1, familia: 'PVC' }], f([['PVC', 'FABRICACAO']]))
        expect(fab).toEqual({ formato: 'FABRICACAO' })
        expect(tipoDoProdutoDoOrcamento({ formato: fab })).toBe('PRODUZIDO')
    })
    it('a família sem formato (null ou ausente do mapa) é recusa que a nomeia — nunca a fabricação por omissão', () => {
        expect(formatoDoOrcamento([{ ordem: 1, familia: 'PVC' }], f([['PVC', null]]))).toEqual({ recusa: fraseDaFamiliaSemFormato(['PVC']) })
        expect(formatoDoOrcamento([{ ordem: 1, familia: 'PVC' }, { ordem: 2, familia: 'ALU' }], f([['PVC', 'FABRICACAO']])))
            .toEqual({ recusa: fraseDaFamiliaSemFormato(['ALU']) })
        expect(tipoDoProdutoDoOrcamento({ formato: { recusa: 'x' } })).toBe('PRODUZIDO')
    })
    it('o item sem família gravada é recusa, nomeando os itens', () => {
        expect(formatoDoOrcamento([{ ordem: 1, familia: 'PVC' }, { ordem: 3, familia: null }, { ordem: 4, familia: '' }], f([['PVC', 'FABRICACAO']])))
            .toEqual({ recusa: FRASE_ITEM_SEM_FAMILIA([3, 4]) })
        expect(FRASE_ITEM_SEM_FAMILIA([3])).toBe('o item 3 não tem família gravada: recalcule o orçamento')
    })
    it('fabricação e revenda no MESMO orçamento: recusa, nomeando as famílias de cada lado', () => {
        const r = formatoDoOrcamento([{ ordem: 1, familia: 'PVC' }, { ordem: 2, familia: 'ALU' }], f([['PVC', 'FABRICACAO'], ['ALU', 'REVENDA']]))
        expect(r).toEqual({ recusa: fraseDosFormatosMisturados(['PVC'], ['ALU']) })
    })
    it('sem item: a recusa própria', () => {
        expect(formatoDoOrcamento([], new Map())).toEqual({ recusa: FRASE_ORCAMENTO_SEM_ITEM_PARA_O_FORMATO })
    })
})

describe('(3) a falta do formato na precificação', () => {
    const item = { id: 'i-1', ordem: 1, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1, calculo_id: 'c', calculado_em: '2026-11-23T10:00:00Z',
        atualizado_em: '2026-11-23T10:00:00Z', custo_bruto_materiais: 800, custo_liquido_materiais: 700, tempo_fabricacao_min: 0, valor_minuto: null as number | null, custo_fabricacao: 0, custo_liquido_total: 700 }
    const orc = (formato: OrcamentoNaPrecificacao['formato'], itens = [item]): OrcamentoNaPrecificacao => ({
        id: 'o', numero: 1, nome: 'X', comissao_percentual: 5, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 10, valor_total_bruto: 800,
        valor_total_liquido: 700, valor_venda: null, valor_operacao_interna: null, ncm_code: null, sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
        itens, formato,
    })
    const fiscal = { ncm_code: null as string | null, sale_scope: 'INTRAESTADUAL' as const, buyer_type: 'CONSUMIDOR_FINAL' as const, uf_destino: null as string | null }
    const faltas = (o: OrcamentoNaPrecificacao) => faltasDaPrecificacao({ orcamento: o, fiscal, aliquotaDoNcm: null, referenciaDoTenant: null, custoDoMotor: 700 })
    it('a recusa do formato vira falta, com a frase dela; com formato que vale, nenhuma', () => {
        expect(faltas(orc({ recusa: fraseDaFamiliaSemFormato(['PVC']) }))).toEqual([fraseDaFamiliaSemFormato(['PVC'])])
        expect(faltas(orc({ formato: 'REVENDA' }))).toEqual([])
    })
    it('o orçamento sem item tem UMA falta (a do estado), não duas', () => {
        expect(faltas(orc({ recusa: FRASE_ORCAMENTO_SEM_ITEM_PARA_O_FORMATO }, []))).toEqual(['O orçamento não tem nenhum item.'])
    })
})
