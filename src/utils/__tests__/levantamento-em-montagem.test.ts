/**
 * PORTÃO — o LEVANTAMENTO EM MONTAGEM (`src/lib/atendimentos-ia/levantamento-em-montagem.ts`): as
 * esquadrias de um levantamento, o que a proposta da LLM muda nelas, e a próxima pendência — o campo
 * que falta ou a escolha da tipologia. Funções puras.
 *
 * A REGRA QUE NÃO SE NEGOCIA continua: a LLM PROPÕE, o código VALIDA. Os campos passam pela mesma
 * validação da pré-definição (`valorValido`): a tipologia só da lista, a cor só da lista e exata, as
 * medidas inteiras na faixa.
 *
 * HISTÓRICO: sobrescreve (decisão 3 do dono do produto, 25/10/2026). Uma alteração substitui o valor
 * anterior; trocar a TIPOLOGIA apaga as escolhas da esquadria, porque as variáveis são da tipologia.
 */
export {}

/* eslint-disable @typescript-eslint/no-require-imports */
type Modulo = typeof import('@/lib/atendimentos-ia/levantamento-em-montagem')
const L = () => require('@/lib/atendimentos-ia/levantamento-em-montagem') as Modulo
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const AV = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const ABAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */

const TIPOLOGIAS = ['DP-01', 'DP-02']
const CORES = ['BRANCO']
function dp02() {
    const r = AV().lerTipologia(ABAS, 'DP-02')
    if ('recusas' in r) throw new Error('abas recusadas')
    return r.tipologia
}
/** Só a DP-02 tem as abas: a DP-01 não tem escolhas a perguntar. */
const definicao = (t: string | null) => (t === 'DP-02' ? dp02() : null)
const ctx = (ordemPadrao: number | null) => ({ tipologias: TIPOLOGIAS, cores: CORES, ordemPadrao, definicao })
const COMPLETO_SEM_ESCOLHAS = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm', escolhas: null as Record<string, number> | null }

describe('(1) a proposta preenche, e o que não valida é descartado', () => {
    it('um levantamento vazio recebe a esquadria inteira da mensagem como esquadria 1', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }] }, ctx(1))
        expect(r.itens).toEqual([COMPLETO_SEM_ESCOLHAS])
        expect([r.propostos, r.descartados, r.semEsquadria]).toEqual([6, 0, false])
    })

    it.each([
        ['tipologia fora da lista', { tipologia: 'Janela de correr' }, 'tipologia'],
        ['cor fora da lista exata ("Branco")', { cor_perfil: 'Branco' }, 'cor_perfil'],
        ['largura como texto', { largura_mm: 'mil e duzentos' }, 'largura_mm'],
        ['altura fora da faixa', { altura_mm: 50 }, 'altura_mm'],
        ['quantidade fracionária', { quantidade: 1.5 }, 'quantidade'],
    ])('%s → descartado, o campo fica nulo', (_nome, campos, campo) => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...campos }] }, ctx(1))
        expect(r.itens[0][campo as 'tipologia']).toBeNull()
        expect(r.descartados).toBe(1)
    })

    it('chaves que não são campo da esquadria (tenant_id, levantamento_id) são ignoradas, sem contar', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tenant_id: 'outro', levantamento_id: 'x', largura_mm: 1200 }] }, ctx(1))
        expect(r.itens[0]).toEqual({ ...L().itemVazio(1), largura_mm: 1200 })
        expect([r.propostos, r.descartados]).toEqual([1, 0])
    })
})

describe('(2) a esquadria certa recebe o valor', () => {
    it('sem ordem e sem tipologia, vai para a esquadria PADRÃO (a da pergunta em aberto)', () => {
        const dois = [{ ...COMPLETO_SEM_ESCOLHAS }, { ...L().itemVazio(2), tipologia: 'DP-01' }]
        const r = L().aplicarProposta(dois, { itens: [{ largura_mm: 800 }] }, ctx(2))
        expect(r.itens[1].largura_mm).toBe(800)
        expect(r.itens[0].largura_mm).toBe(1200)
    })

    it('sem ordem, sem tipologia e SEM esquadria padrão, com duas esquadrias: não escolhe — semEsquadria', () => {
        const dois = [{ ...COMPLETO_SEM_ESCOLHAS }, { ...COMPLETO_SEM_ESCOLHAS, ordem: 2 }]
        const r = L().aplicarProposta(dois, { itens: [{ altura_mm: 1300 }] }, ctx(null))
        expect(r.semEsquadria).toBe(true)
        expect(r.itens).toEqual(dois)
    })

    it('com a ordem dita, vai para aquela esquadria — e SOBRESCREVE (decisão 3)', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { itens: [{ ordem: 1, altura_mm: 1200 }] }, ctx(null))
        expect(r.itens[0].altura_mm).toBe(1200)
    })

    it('uma esquadria NOVA (com tipologia) entra com a ordem seguinte', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { itens: [{ tipologia: 'DP-01', largura_mm: 600 }] }, ctx(null))
        expect(r.itens.map((i) => [i.ordem, i.tipologia, i.largura_mm])).toEqual([[1, 'DP-02', 1200], [2, 'DP-01', 600]])
    })

    it('a tipologia vai PRIMEIRO para a esquadria que ainda não tem tipologia, em vez de criar outra', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02' }] }, ctx(1))
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0].tipologia).toBe('DP-02')
    })

    it('trocar a TIPOLOGIA apaga as escolhas da esquadria; trocar a MEDIDA, não', () => {
        const comEscolhas = { ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }
        expect(L().aplicarProposta([comEscolhas], { itens: [{ ordem: 1, altura_mm: 1200 }] }, ctx(null)).itens[0].escolhas).toEqual({ ARI: 4, ARE: 1, MAE: 2 })
        expect(L().aplicarProposta([comEscolhas], { itens: [{ ordem: 1, tipologia: 'DP-01' }] }, ctx(null)).itens[0].escolhas).toBeNull()
    })
})

describe('(3) a próxima pendência: os campos da esquadria, depois as escolhas dela', () => {
    it('o primeiro campo vazio da primeira esquadria incompleta', () => {
        expect(L().proximaPendencia([{ ...L().itemVazio(1), tipologia: 'DP-02', largura_mm: 1200 }], definicao)).toEqual({ tipo: 'CAMPO', ordem: 1, campo: 'altura_mm' })
    })

    it('com os campos cheios, a primeira escolha pendente da tipologia', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS }], definicao)
        expect(p && p.tipo === 'ESCOLHA' && [p.ordem, p.pendente.variavel]).toEqual([1, 'ARI'])
    })

    it('com ARI 4 e ARE 2, a MAE não se aplica: nada pendente', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: 4, ARE: 2 } }], definicao)).toBeNull()
    })

    it('uma tipologia sem as abas (DP-01) não tem escolha: completa só com os campos', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, tipologia: 'DP-01' }], definicao)).toBeNull()
    })

    it('a segunda esquadria só é perguntada depois da primeira inteira', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS }, { ...L().itemVazio(2), tipologia: 'DP-01' }], definicao)
        expect(p && p.tipo === 'ESCOLHA' && p.ordem).toBe(1)
    })
})

describe('(4) a escolha respondida vai para a esquadria da pendência', () => {
    it('"4" para a ARI da esquadria 1 é gravado', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolha: { variavel: 'ARI', opcao: 4 } }, ctx(1))
        expect(r.itens[0].escolhas).toEqual({ ARI: 4 })
    })

    it('opção que não existe é descartada', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolha: { variavel: 'ARI', opcao: 9 } }, ctx(1))
        expect(r.itens[0].escolhas).toBeNull()
        expect(r.descartados).toBe(1)
    })
})

describe('(5) a pergunta da pendência', () => {
    it('uma esquadria só: a pergunta como ela é', () => {
        expect(L().perguntaDaPendencia({ tipo: 'CAMPO', ordem: 1, campo: 'altura_mm' }, 1)).toBe('Qual a altura, em milímetros?')
    })

    it('mais de uma: a pergunta diz de qual esquadria', () => {
        expect(L().perguntaDaPendencia({ tipo: 'CAMPO', ordem: 2, campo: 'altura_mm' }, 2)).toBe('Esquadria 2: Qual a altura, em milímetros?')
    })

    it('a escolha: a pergunta FIXA da aba, com as opções por extenso', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS }], definicao)
        if (!p) throw new Error('era para ter pendência')
        expect(L().perguntaDaPendencia(p, 1)).toBe('ARREMATE INTERNO — qual opção? 1 = BZ0006 - ARREMATE 65MM; 2 = BZ1770 - ARREMATE 70MM; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO.')
    })
})
