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
 *
 * O ARREMATE (dono do produto, 25/10/2026): o PADRÃO é assumido; escolha nenhuma é pendência por si. A
 * pendência de escolha só existe quando o vendedor PEDIU as opções (`opcoes_de`), marcada com `null`.
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
const definicao = (e: { tipologia: string | null }) => (e.tipologia === 'DP-02' ? dp02() : null)
/** Uma família só, com as duas tipologias no motor dela: o caso de hoje em produção. Várias famílias: bloco (V). */
const familiaUnica = (c: string) => (TIPOLOGIAS.includes(c) ? [{ familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff', motorId: 'motor-unico' }] : [])
// as candidatas sem descrição e sem limite (03/11/2026): nestes casos nada é descartado por abertura nem por medida — isso é o teste de `tipologias-candidatas`
type Candidato = import('@/lib/atendimentos-ia/tipologias-candidatas').CandidatoParaAProposta
type Abertura = import('@/lib/atendimentos-ia/tipologias-candidatas').Abertura
const candidatos = (codigos: readonly string[]): Candidato[] => codigos.map((tipologia) => ({ tipologia, descricao: null as string | null, larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: null as number | null }))
const ctx = (ordemPadrao: number | null) => ({ candidatos: candidatos(TIPOLOGIAS), aberturaDaMensagem: null as Abertura | null, aberturasDitas: new Set<'porta' | 'janela'>(), cores: CORES, ordemPadrao, definicao, familiasDoCodigo: familiaUnica })
const COMPLETO_SEM_ESCOLHAS = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm', escolhas: null as Record<string, number> | null, familia: 'PVC' as string | null, motor_id: 'motor-unico' as string | null }

describe('(1) a proposta preenche, e o que não valida é descartado', () => {
    it('um levantamento vazio recebe a esquadria inteira da mensagem como esquadria 1', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }] }, ctx(1))
        expect(r.itens).toEqual([COMPLETO_SEM_ESCOLHAS])
        expect([r.propostos, r.descartados, r.semEsquadria]).toEqual([6, 0, false])
    })

    it.each([
        ['tipologia fora da lista', { tipologia: 'Janela de correr' }, 'tipologia'],
        ['tipologia em outra caixa ("dp-02" não é DP-02)', { tipologia: 'dp-02' }, 'tipologia'],
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
        // a quantidade não dita é 1 (03/11/2026): a esquadria que já diz algo (a largura) nasce com 1 unidade, sem perguntar
        expect(r.itens[0]).toEqual({ ...L().itemVazio(1), largura_mm: 1200, quantidade: 1 })
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
        expect(L().proximaPendencia([{ ...L().itemVazio(1), tipologia: 'DP-02', largura_mm: 1200 }], definicao, familiaUnica)).toEqual({ tipo: 'CAMPO', ordem: 1, campo: 'altura_mm' })
    })

    it('com os campos cheios e NENHUMA escolha: nada pendente — o padrão vale, a conversa não pergunta o arremate', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS }], definicao, familiaUnica)).toBeNull()
    })

    it('o vendedor PEDIU as opções do arremate interno (null): ESSA é a pendência', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARE: 1, ARI: null } }], definicao, familiaUnica)
        expect(p && p.tipo === 'ESCOLHA' && [p.ordem, p.pendente.variavel]).toEqual([1, 'ARI'])
    })

    it('uma tipologia sem as abas (DP-01) não tem escolha: completa só com os campos', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, tipologia: 'DP-01' }], definicao, familiaUnica)).toBeNull()
    })

    it('a segunda esquadria só é perguntada depois da primeira inteira', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: null } }, { ...L().itemVazio(2), tipologia: 'DP-01' }], definicao, familiaUnica)
        expect(p && p.tipo === 'ESCOLHA' && p.ordem).toBe(1)
    })
})

describe('(4) o arremate dito em palavras vira escolha; pedir as opções marca a variável', () => {
    it('"sem arremate interno" (ARI 4) é gravado na esquadria', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolhas: [{ variavel: 'ARI', opcao: 4 }] }, ctx(1))
        expect(r.itens[0].escolhas).toEqual({ ARI: 4 })
    })

    it('duas escolhas na mesma mensagem: as duas', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolhas: [{ variavel: 'ARI', opcao: 4 }, { variavel: 'MAE', opcao: 2 }] }, ctx(1))
        expect(r.itens[0].escolhas).toEqual({ ARI: 4, MAE: 2 })
    })

    it('a escolha responde a marca de "pediu as opções": o null vira o número, e as outras marcas ficam', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: null, ARE: null } }], { escolhas: [{ variavel: 'ARI', opcao: 3 }] }, ctx(1))
        expect(r.itens[0].escolhas).toEqual({ ARI: 3, ARE: null })
    })

    it('opção que não existe é descartada', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolhas: [{ variavel: 'ARI', opcao: 9 }] }, ctx(1))
        expect(r.itens[0].escolhas).toBeNull()
        expect(r.descartados).toBe(1)
    })

    it('a DESCRIÇÃO no lugar do código é descartada — é o defeito 1, e quem o evita é o prompt', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { escolhas: [{ variavel: 'ARREMATE INTERNO', opcao: 4 }] }, ctx(1))
        expect([r.itens[0].escolhas, r.descartados]).toEqual([null, 1])
    })

    it('pedir as opções do arremate externo marca ARE com null', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARE: 1 } }], { opcoes_de: ['ARE'] }, ctx(1))
        expect(r.itens[0].escolhas).toEqual({ ARE: null })
    })

    it('pedir as opções de uma variável que não é capturada é descartado', () => {
        const r = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { opcoes_de: ['MTE'] }, ctx(1))
        expect([r.itens[0].escolhas, r.descartados]).toEqual([null, 1])
    })
})

describe('(5) a pergunta da pendência', () => {
    it('uma esquadria só: a pergunta como ela é', () => {
        expect(L().perguntaDaPendencia({ tipo: 'CAMPO', ordem: 1, campo: 'altura_mm' }, 1)).toBe('Qual a altura, em milímetros?')
    })

    it('mais de uma: a pergunta diz de qual esquadria', () => {
        expect(L().perguntaDaPendencia({ tipo: 'CAMPO', ordem: 2, campo: 'altura_mm' }, 2)).toBe('Esquadria 2: Qual a altura, em milímetros?')
    })

    it('a escolha pedida: a pergunta FIXA, por extenso, sem número', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: null } }], definicao, familiaUnica)
        if (!p) throw new Error('era para ter pendência')
        expect(L().perguntaDaPendencia(p, 1)).toBe('Para arremate interno, as opções são: arremate de 65 mm; arremate de 70 mm; arremate de 20 mm; sem arremate interno. Qual você quer?')
    })
})

/**
 * (V) VÁRIAS FAMÍLIAS NA CONTA (PR D, dono do produto, 02/11/2026): "2+: junta as tipologias dos motores de cada família e a IA
 * pergunta de qual é, no mesmo lugar onde hoje pergunta por fornecedor". A esquadria guarda de qual família é (`familia`) e o
 * motor que a calcula (`motor_id`). Quando o código está no motor de mais de uma família, a conversa PERGUNTA de qual, citando
 * os rótulos. Nunca escolhe, nunca usa "a primeira". Sem dado de produção que o exercite hoje (1 família): o caso vive aqui.
 */
describe('(V) várias famílias: a tipologia no motor de mais de uma, a pergunta é de qual família', () => {
    const PVC = { familia: 'PVC', rotulo: 'PVC Wolf', fornecedor: 'Wolff', motorId: 'motor-wolf' }
    const ALU = { familia: 'ALUMINIO', rotulo: 'Alumínio Sul', fornecedor: 'Perfis Sul', motorId: 'motor-sul' }
    const OPCOES = [{ rotulo: 'Alumínio Sul', fornecedor: 'Perfis Sul' }, { rotulo: 'PVC Wolf', fornecedor: 'Wolff' }]
    const familiasDoCodigo = (c: string) => (c === 'DP-02' ? [PVC, ALU] : c === 'DP-01' ? [PVC] : [])
    // as abas da DP-02 só no motor do PVC: a definição depende da FAMÍLIA da esquadria, não só do código
    const def = (i: { tipologia: string | null; familia: string | null }) => (i.tipologia === 'DP-02' && i.familia === 'PVC' ? dp02() : null)
    const ctxV = (ordemPadrao: number | null) => ({ candidatos: candidatos(TIPOLOGIAS), aberturaDaMensagem: null as Abertura | null, aberturasDitas: new Set<'porta' | 'janela'>(), cores: CORES, ordemPadrao, definicao: def, familiasDoCodigo })
    const COMPLETA = { tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }

    it('o código em DUAS famílias: a esquadria fica sem família e sem motor, e a pendência é de qual família — as duas, em ordem, nunca "a primeira"', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1))
        expect([r.itens[0].familia, r.itens[0].motor_id]).toEqual([null, null])
        const p = L().proximaPendencia(r.itens, def, familiasDoCodigo)
        expect(p).toEqual({ tipo: 'FAMILIA', ordem: 1, tipologia: 'DP-02', opcoes: OPCOES })
        expect(L().perguntaDaPendencia(p!, 1)).toBe('A DP-02 está em 2 famílias da sua empresa: Alumínio Sul ou PVC Wolf. De qual família é?')
        expect(L().perguntaDaPendencia(p!, 2)).toBe('Esquadria 1: A DP-02 está em 2 famílias da sua empresa: Alumínio Sul ou PVC Wolf. De qual família é?')
    })

    it('a pendência da família vem logo depois da tipologia, antes das medidas', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02' }] }, ctxV(1))
        expect(L().proximaPendencia(r.itens, def, familiasDoCodigo)).toEqual({ tipo: 'FAMILIA', ordem: 1, tipologia: 'DP-02', opcoes: OPCOES })
    })

    it('o código em UMA família (1 família na conta, ou o código num motor só): a esquadria leva a família e o motor dela, sem pergunta', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...COMPLETA, tipologia: 'DP-01' }] }, ctxV(1))
        expect([r.itens[0].familia, r.itens[0].motor_id]).toEqual(['PVC', 'motor-wolf'])
        expect(L().proximaPendencia(r.itens, def, familiasDoCodigo)).toBeNull()
    })

    it('a resposta com o RÓTULO da família (sem caixa e sem acento) resolve a família e o motor, e a pendência some', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        const r = L().aplicarProposta(antes, { itens: [{ familia: 'aluminio sul' }] }, ctxV(1))
        expect([r.itens[0].familia, r.itens[0].motor_id]).toEqual(['ALUMINIO', 'motor-sul'])
        expect([r.propostos, r.descartados]).toEqual([1, 0])
        expect(L().proximaPendencia(r.itens, def, familiasDoCodigo)?.tipo).not.toBe('FAMILIA')
    })

    it('a resposta com a CHAVE da família, ou com o fornecedor do motor, também resolve — e no mesmo pedido da tipologia', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        expect(L().aplicarProposta(antes, { itens: [{ familia: 'PVC' }] }, ctxV(1)).itens[0].familia).toBe('PVC')
        expect(L().aplicarProposta(antes, { itens: [{ fornecedor: 'perfis sul' }] }, ctxV(1)).itens[0].motor_id).toBe('motor-sul')
        const junto = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...COMPLETA, familia: 'PVC Wolf' }] }, ctxV(1))
        expect([junto.itens[0].familia, junto.itens[0].motor_id]).toEqual(['PVC', 'motor-wolf'])
        expect(L().proximaPendencia(junto.itens, def, familiasDoCodigo)).toBeNull()
    })

    it('a família que não é uma das da tipologia é descartada: a esquadria continua sem família', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        const r = L().aplicarProposta(antes, { itens: [{ familia: 'Madeira' }] }, ctxV(1))
        expect([r.itens[0].familia, r.itens[0].motor_id]).toEqual([null, null])
        expect([r.propostos, r.descartados]).toEqual([1, 1])
        expect(L().proximaPendencia(r.itens, def, familiasDoCodigo)?.tipo).toBe('FAMILIA')
    })

    it('a família e o fornecedor que apontam famílias DIFERENTES não resolvem nada: descartado', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        const r = L().aplicarProposta(antes, { itens: [{ familia: 'PVC', fornecedor: 'Perfis Sul' }] }, ctxV(1))
        expect(r.itens[0].familia).toBeNull()
        expect(r.descartados).toBe(1)
    })

    it('trocar a tipologia troca a família: a escolhida para a DP-02 não fica na DP-01', () => {
        const comAlu = [{ ...L().itemVazio(1), ...COMPLETA, familia: 'ALUMINIO', motor_id: 'motor-sul' }]
        const r = L().aplicarProposta(comAlu, { itens: [{ ordem: 1, tipologia: 'DP-01' }] }, ctxV(1))
        expect([r.itens[0].familia, r.itens[0].motor_id]).toEqual(['PVC', 'motor-wolf'])
    })

    it('a família guardada que já não tem o código (saiu da conta) não vale: volta a ser pergunta', () => {
        expect(L().familiaDaEsquadria({ tipologia: 'DP-02', familia: 'MADEIRA' }, familiasDoCodigo)).toEqual({ opcoes: OPCOES })
        expect(L().familiaDaEsquadria({ tipologia: 'DP-02', familia: 'ALUMINIO' }, familiasDoCodigo)).toEqual(ALU)
        expect(L().familiaDaEsquadria({ tipologia: 'DP-01', familia: null }, familiasDoCodigo)).toEqual(PVC)
        expect(L().familiaDaEsquadria({ tipologia: 'XX-9', familia: null }, familiasDoCodigo)).toBeNull()
        expect(L().familiaDaEsquadria({ tipologia: null, familia: null }, familiasDoCodigo)).toBeNull()
    })

    it('resolverFamilias: o que fica gravado é a família resolvida e o motor do CÁLCULO dela; sem resolver, os dois nulos', () => {
        const itens = [
            { ...L().itemVazio(1), tipologia: 'DP-01' },
            { ...L().itemVazio(2), tipologia: 'DP-02' },
            { ...L().itemVazio(3), tipologia: 'DP-02', familia: 'ALUMINIO', motor_id: 'motor-velho' },
            { ...L().itemVazio(4), tipologia: 'XX-9', familia: 'PVC', motor_id: 'motor-wolf' },
        ]
        expect(L().resolverFamilias(itens, familiasDoCodigo).map((i) => [i.familia, i.motor_id])).toEqual([
            ['PVC', 'motor-wolf'], [null, null], ['ALUMINIO', 'motor-sul'], [null, null],
        ])
    })
})

describe('(L) os limites com DUAS candidatas do mesmo código (duas famílias): basta UMA caber', () => {
    const PVC = { familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff', motorId: 'motor-wolf' }
    const ALU = { familia: 'ALUMINIO', rotulo: 'Alumínio Sul', fornecedor: 'Perfis Sul', motorId: 'motor-sul' }
    const duas = (altMaxPvc: number, altMaxAlu: number): Candidato[] => [
        { tipologia: 'DP-02', descricao: 'JANELA DE CORRER', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: 388, alt_max_mm: altMaxPvc },
        { tipologia: 'DP-02', descricao: 'JANELA DE CORRER', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: 388, alt_max_mm: altMaxAlu },
    ]
    const ctxL = (cands: Candidato[]) => ({ candidatos: cands, aberturaDaMensagem: null as Abertura | null, aberturasDitas: new Set<'porta' | 'janela'>(), cores: CORES, ordemPadrao: 1, definicao, familiasDoCodigo: (c: string) => (c === 'DP-02' ? [PVC, ALU] : []) })

    it('2.500 de altura cabe só na do alumínio (3.000): a tipologia FICA — a família é a pergunta seguinte, não o descarte', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 2500 }] }, ctxL(duas(2439, 3000)))
        expect(r.itens[0]).toEqual(expect.objectContaining({ tipologia: 'DP-02', altura_mm: 2500, familia: null }))
        expect(r.recusas).toEqual([])
        expect(r.descartados).toBe(0)
    })

    it('2.500 de altura não cabe em nenhuma das duas (2.439 e 2.400): a tipologia cai, com a recusa LIMITES', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 2500 }] }, ctxL(duas(2439, 2400)))
        expect(r.itens[0]).toEqual(expect.objectContaining({ tipologia: null, altura_mm: 2500, largura_mm: 1200 }))
        expect(r.recusas).toEqual([{ ordem: 1, motivo: 'LIMITES', tipologia: 'DP-02', abertura: null, medidas: { largura_mm: 1200, altura_mm: 2500 } }])
        expect(r.descartados).toBe(1)
    })
})

/**
 * (VI) TODAS AS PENDÊNCIAS NUMA PERGUNTA (dono do produto, 03/11/2026, "a conversa sai do modo formulário"): "uma pergunta por turno que
 * cubra TODAS as pendências do momento, não um campo por mensagem". `pendenciasDoLevantamento` lista todas, na ordem de sempre (a primeira é
 * a `proximaPendencia`); `perguntaDasPendencias` as junta numa pergunta — com uma só, a fixa de sempre.
 */
describe('(VI) todas as pendências, e a pergunta que as cobre de uma vez', () => {
    const vazia = (ordem: number) => L().itemVazio(ordem)

    it('lista TODAS, esquadria por esquadria: os campos vazios, depois as escolhas pedidas; a primeira é a proximaPendencia', () => {
        const itens = [{ ...COMPLETO_SEM_ESCOLHAS, vidro: null, escolhas: { ARI: null } }, { ...vazia(2), tipologia: 'DP-02', cor_perfil: 'BRANCO' }]
        const ps = L().pendenciasDoLevantamento(itens, definicao, familiaUnica)
        expect(ps.map((p) => [p.tipo, p.ordem, p.tipo === 'CAMPO' ? p.campo : p.tipo === 'ESCOLHA' ? p.pendente.variavel : p.tipologia])).toEqual([
            ['CAMPO', 1, 'vidro'], ['ESCOLHA', 1, 'ARI'],
            ['CAMPO', 2, 'largura_mm'], ['CAMPO', 2, 'altura_mm'], ['CAMPO', 2, 'quantidade'], ['CAMPO', 2, 'vidro'],
        ])
        expect(L().proximaPendencia(itens, definicao, familiaUnica)).toEqual(ps[0])
    })

    it('sem a tipologia, só os campos: a família e as escolhas dependem dela', () => {
        const ps = L().pendenciasDoLevantamento([{ ...vazia(1), largura_mm: 1200, escolhas: { ARI: null } }], definicao, familiaUnica)
        expect(ps.map((p) => (p.tipo === 'CAMPO' ? p.campo : p.tipo))).toEqual(['tipologia', 'altura_mm', 'quantidade', 'cor_perfil', 'vidro'])
    })

    it('nada pendente: lista vazia, pergunta vazia', () => {
        expect(L().pendenciasDoLevantamento([COMPLETO_SEM_ESCOLHAS], definicao, familiaUnica)).toEqual([])
        expect(L().perguntaDasPendencias([], 1)).toBe('')
    })

    it('UMA pendência: a pergunta fixa de sempre, com "Esquadria N:" só com mais de uma esquadria', () => {
        const p = { tipo: 'CAMPO' as const, ordem: 1, campo: 'vidro' as const }
        expect(L().perguntaDasPendencias([p], 1)).toBe('Qual o vidro?')
        expect(L().perguntaDasPendencias([p], 2)).toBe('Esquadria 1: Qual o vidro?')
    })

    it('vários campos da mesma esquadria: uma frase com todos', () => {
        const ps = L().pendenciasDoLevantamento([{ ...vazia(1), tipologia: 'DP-02', quantidade: 1 }], definicao, familiaUnica)
        expect(L().perguntaDasPendencias(ps, 1)).toBe('Me diga a largura (em mm), a altura (em mm), a cor do perfil e o vidro.')
    })

    it('a tipologia e mais campos: a pergunta de obra, e o resto junto', () => {
        const ps = L().pendenciasDoLevantamento([{ ...vazia(1), largura_mm: 1200, altura_mm: 1000, quantidade: 1, vidro: 'Temperado 5mm' }], definicao, familiaUnica)
        expect(L().perguntaDasPendencias(ps, 1)).toBe('É janela ou porta? Abre de correr, de abrir ou maxim-ar? Tem persiana? E me diga a cor do perfil.')
    })

    it('duas esquadrias: uma linha por esquadria, cada uma com o que lhe falta', () => {
        const ps = L().pendenciasDoLevantamento([{ ...COMPLETO_SEM_ESCOLHAS, vidro: null }, { ...vazia(2), tipologia: 'DP-02', quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }], definicao, familiaUnica)
        expect(L().perguntaDasPendencias(ps, 2)).toBe('Esquadria 1: Qual o vidro?\nEsquadria 2: Me diga a largura (em mm) e a altura (em mm).')
    })

    it('o campo e a escolha pedida da mesma esquadria vão juntos', () => {
        const ps = L().pendenciasDoLevantamento([{ ...COMPLETO_SEM_ESCOLHAS, vidro: null, escolhas: { ARI: null } }], definicao, familiaUnica)
        expect(L().perguntaDasPendencias(ps, 1)).toBe('Qual o vidro? Para arremate interno, as opções são: arremate de 65 mm; arremate de 70 mm; arremate de 20 mm; sem arremate interno. Qual você quer?')
    })

    it('a família e os campos: a pergunta da família vem depois dos campos da esquadria', () => {
        const PVC = { familia: 'PVC', rotulo: 'PVC Wolf', fornecedor: 'Wolff', motorId: 'motor-wolf' }
        const ALU = { familia: 'ALUMINIO', rotulo: 'Alumínio Sul', fornecedor: 'Perfis Sul', motorId: 'motor-sul' }
        const duas = (c: string) => (c === 'DP-02' ? [PVC, ALU] : [])
        const ps = L().pendenciasDoLevantamento([{ ...vazia(1), tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO' }], () => null, duas)
        expect(ps.map((p) => p.tipo)).toEqual(['FAMILIA', 'CAMPO'])
        expect(L().perguntaDasPendencias(ps, 1)).toBe('Qual o vidro? A DP-02 está em 2 famílias da sua empresa: Alumínio Sul ou PVC Wolf. De qual família é?')
    })

    it('a cabeça da IA entra no lugar da pergunta fixa do PRIMEIRO campo, e o resto vem junto', () => {
        const ps = L().pendenciasDoLevantamento([{ ...vazia(1), largura_mm: 1200, altura_mm: 1000, quantidade: 1, vidro: 'Temperado 5mm' }], definicao, familiaUnica)
        expect(L().perguntaDasPendencias(ps, 1, 'Ela tem persiana integrada?')).toBe('Ela tem persiana integrada? E me diga a cor do perfil.')
        const so = [{ tipo: 'CAMPO' as const, ordem: 2, campo: 'vidro' as const }]
        expect(L().perguntaDasPendencias(so, 2, 'Que vidro vai nela?')).toBe('Esquadria 2: Que vidro vai nela?')
    })
})

/**
 * (VII) O VIDRO (dono do produto, 04/11/2026): o PADRÃO da instrução entra só na esquadria que ficou sem vidro, uma vez, e nunca sobrescreve;
 * o agrupamento compara o vidro pela FORMA CANÔNICA — o texto que o vendedor disse continua gravado.
 */
describe('(VII) o vidro padrão da instrução e o agrupamento pela forma canônica do vidro', () => {
    const SEM_VIDRO = { tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO' }

    it('sem vidro dito, o vidro_padrao preenche a esquadria — e conta', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...SEM_VIDRO, vidro_padrao: 'incolor 4 mm comum' }] }, ctx(1))
        expect(r.itens[0].vidro).toBe('incolor 4 mm comum')
        expect(r.vidrosPadrao).toBe(1)
    })

    it('com o vidro dito, o dito vence e o padrão não conta', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...SEM_VIDRO, vidro: 'vidro 4mm', vidro_padrao: 'incolor 4 mm comum' }] }, ctx(1))
        expect(r.itens[0].vidro).toBe('vidro 4mm')
        expect(r.vidrosPadrao).toBe(0)
    })

    it('o padrão NUNCA sobrescreve: a esquadria que já tem vidro (dito ou do padrão de antes) fica como está nos turnos seguintes', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...SEM_VIDRO, vidro_padrao: 'incolor 4 mm comum' }] }, ctx(1)).itens
        const depois = L().aplicarProposta(antes, { itens: [{ ordem: 1, vidro_padrao: 'incolor 4 mm temperado' }] }, ctx(1))
        expect(depois.itens[0].vidro).toBe('incolor 4 mm comum')
        expect(depois.vidrosPadrao).toBe(0)
        const dito = L().aplicarProposta([{ ...COMPLETO_SEM_ESCOLHAS }], { itens: [{ ordem: 1, vidro_padrao: 'incolor 4 mm comum' }] }, ctx(1))
        expect(dito.itens[0].vidro).toBe('Temperado 5mm')
    })

    it('o padrão passa pela mesma validação do vidro: vazio ou fora do tamanho não entra', () => {
        expect(L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...SEM_VIDRO, vidro_padrao: '   ' }] }, ctx(1)).itens[0].vidro).toBeNull()
        expect(L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...SEM_VIDRO, vidro_padrao: 'x'.repeat(10_000) }] }, ctx(1)).itens[0].vidro).toBeNull()
    })

    it('o agrupamento funde "vidro 4mm" com "4 mm vidro" (a mesma forma), e mantém o texto do primeiro; "4 mm" e "temperado 4 mm" continuam dois', () => {
        const base = { ...COMPLETO_SEM_ESCOLHAS, familia: 'PVC', motor_id: 'm', escolhas: null as Record<string, number | null> | null }
        const r = L().agruparIguais([{ ...base, ordem: 1, vidro: 'vidro 4mm' }, { ...base, ordem: 2, vidro: '4 mm vidro', quantidade: 2 }])
        expect(r.itens.map((i) => [i.quantidade, i.vidro])).toEqual([[3, 'vidro 4mm']])
        expect(r.fundidos).toBe(1)
        const dois = L().agruparIguais([{ ...base, ordem: 1, vidro: 'vidro 4mm' }, { ...base, ordem: 2, vidro: 'temperado 4 mm' }])
        expect(dois.itens).toHaveLength(2)
        expect(dois.fundidos).toBe(0)
    })
})
