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
/** Uma tabela só, com as duas tipologias: o caso de hoje em produção. Várias tabelas: bloco (V). */
const UNICA = 'tabela-unica'
const tabelasUnica = (c: string) => (TIPOLOGIAS.includes(c) ? [{ tabelaId: UNICA, fornecedor: 'Wolff' }] : [])
const ctx = (ordemPadrao: number | null) => ({ tipologias: TIPOLOGIAS, cores: CORES, ordemPadrao, definicao, tabelasDoCodigo: tabelasUnica })
const COMPLETO_SEM_ESCOLHAS = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm', escolhas: null as Record<string, number> | null, tabela_id: UNICA as string | null }

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
        expect(L().proximaPendencia([{ ...L().itemVazio(1), tipologia: 'DP-02', largura_mm: 1200 }], definicao, tabelasUnica)).toEqual({ tipo: 'CAMPO', ordem: 1, campo: 'altura_mm' })
    })

    it('com os campos cheios e NENHUMA escolha: nada pendente — o padrão vale, a conversa não pergunta o arremate', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS }], definicao, tabelasUnica)).toBeNull()
    })

    it('o vendedor PEDIU as opções do arremate interno (null): ESSA é a pendência', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARE: 1, ARI: null } }], definicao, tabelasUnica)
        expect(p && p.tipo === 'ESCOLHA' && [p.ordem, p.pendente.variavel]).toEqual([1, 'ARI'])
    })

    it('uma tipologia sem as abas (DP-01) não tem escolha: completa só com os campos', () => {
        expect(L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, tipologia: 'DP-01' }], definicao, tabelasUnica)).toBeNull()
    })

    it('a segunda esquadria só é perguntada depois da primeira inteira', () => {
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: null } }, { ...L().itemVazio(2), tipologia: 'DP-01' }], definicao, tabelasUnica)
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
        const p = L().proximaPendencia([{ ...COMPLETO_SEM_ESCOLHAS, escolhas: { ARI: null } }], definicao, tabelasUnica)
        if (!p) throw new Error('era para ter pendência')
        expect(L().perguntaDaPendencia(p, 1)).toBe('Para arremate interno, as opções são: arremate de 65 mm; arremate de 70 mm; arremate de 20 mm; sem arremate interno. Qual você quer?')
    })
})

/**
 * (V) VÁRIAS TABELAS NA CONTA (dono do produto, 26/10/2026; migração 20261026000004). Cai a trava "a sua
 * empresa tem 2 tabelas e ele trabalha com uma só": a conta pode ter duas tabelas — inclusive da mesma
 * família —, e a esquadria guarda de qual tabela é a tipologia (`tabela_id`). Quando o código está em mais
 * de uma, a conversa PERGUNTA de qual fornecedor, citando os nomes. Nunca escolhe, nunca usa "a primeira".
 * Sem dado de produção que o exercite hoje (1 tabela ligada): o caso vive aqui.
 */
describe('(V) várias tabelas: a tipologia em mais de uma, a pergunta é de qual fornecedor', () => {
    const WOLFF = { tabelaId: 'tab-wolff', fornecedor: 'Wolff', familia: 'PVC' as string | null }
    const SUL = { tabelaId: 'tab-sul', fornecedor: 'Perfis Sul', familia: 'Alumínio' as string | null }
    const OPCOES = [{ fornecedor: 'Perfis Sul', familia: 'Alumínio' }, { fornecedor: 'Wolff', familia: 'PVC' }]
    const tabelasDoCodigo = (c: string) => (c === 'DP-02' ? [WOLFF, SUL] : c === 'DP-01' ? [WOLFF] : [])
    // as abas da DP-02 só na Wolff: a definição depende da TABELA da esquadria, não só do código
    const def = (i: { tipologia: string | null; tabela_id: string | null }) => (i.tipologia === 'DP-02' && i.tabela_id === 'tab-wolff' ? dp02() : null)
    const ctxV = (ordemPadrao: number | null) => ({ tipologias: TIPOLOGIAS, cores: CORES, ordemPadrao, definicao: def, tabelasDoCodigo })
    const COMPLETA = { tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }

    it('o código em DUAS tabelas: a esquadria fica sem tabela, e a pendência é de qual fornecedor — os dois, em ordem, nunca "a primeira"', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1))
        expect(r.itens[0].tabela_id).toBeNull()
        const p = L().proximaPendencia(r.itens, def, tabelasDoCodigo)
        expect(p).toEqual({ tipo: 'FORNECEDOR', ordem: 1, tipologia: 'DP-02', opcoes: OPCOES })
        expect(L().perguntaDaPendencia(p!, 1)).toBe(L().fraseDeQualFornecedor('DP-02', OPCOES))
        expect(L().fraseDeQualFornecedor('DP-02', OPCOES)).toBe('A DP-02 está nas tabelas de 2 fornecedores: Perfis Sul ou Wolff. De qual deles é?')
        expect(L().perguntaDaPendencia(p!, 2)).toBe(`Esquadria 1: ${L().fraseDeQualFornecedor('DP-02', OPCOES)}`)
    })

    it('a pendência do fornecedor vem logo depois da tipologia, antes das medidas', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ tipologia: 'DP-02' }] }, ctxV(1))
        expect(L().proximaPendencia(r.itens, def, tabelasDoCodigo)).toEqual({ tipo: 'FORNECEDOR', ordem: 1, tipologia: 'DP-02', opcoes: OPCOES })
    })

    it('o código em UMA tabela: a esquadria leva a tabela dela, e não há pergunta', () => {
        const r = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...COMPLETA, tipologia: 'DP-01' }] }, ctxV(1))
        expect(r.itens[0].tabela_id).toBe('tab-wolff')
        expect(L().proximaPendencia(r.itens, def, tabelasDoCodigo)).toBeNull()
    })

    it('a resposta com o fornecedor (sem caixa e sem acento) resolve a tabela, e a pendência some', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        const r = L().aplicarProposta(antes, { itens: [{ fornecedor: 'wolff' }] }, ctxV(1))
        expect(r.itens[0].tabela_id).toBe('tab-wolff')
        expect([r.propostos, r.descartados]).toEqual([1, 0])
        expect(L().proximaPendencia(r.itens, def, tabelasDoCodigo)).toBeNull()
        // e no MESMO pedido da tipologia também
        const junto = L().aplicarProposta([L().itemVazio(1)], { itens: [{ ...COMPLETA, fornecedor: 'Perfis Sul' }] }, ctxV(1))
        expect(junto.itens[0].tabela_id).toBe('tab-sul')
    })

    it('o fornecedor que não é um dos da tipologia é descartado: a tabela continua sem escolha', () => {
        const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxV(1)).itens
        const r = L().aplicarProposta(antes, { itens: [{ fornecedor: 'Alumínio Norte' }] }, ctxV(1))
        expect(r.itens[0].tabela_id).toBeNull()
        expect([r.propostos, r.descartados]).toEqual([1, 1])
        expect(L().proximaPendencia(r.itens, def, tabelasDoCodigo)?.tipo).toBe('FORNECEDOR')
    })

    it('trocar a tipologia troca a tabela: a escolhida para a DP-02 não fica na DP-01', () => {
        const comSul = [{ ...L().itemVazio(1), ...COMPLETA, tabela_id: 'tab-sul' }]
        // a ordem dita: sem ela, a tipologia abriria uma esquadria nova (a regra de "qual esquadria recebe")
        const r = L().aplicarProposta(comSul, { itens: [{ ordem: 1, tipologia: 'DP-01' }] }, ctxV(1))
        expect(r.itens[0].tabela_id).toBe('tab-wolff')
    })

    it('a tabela guardada que já não tem o código (tirada da conta) não vale: volta a ser pergunta', () => {
        expect(L().tabelaDaEsquadria({ tipologia: 'DP-02', tabela_id: 'tab-velha' }, tabelasDoCodigo)).toEqual({ opcoes: OPCOES })
        expect(L().tabelaDaEsquadria({ tipologia: 'DP-02', tabela_id: 'tab-sul' }, tabelasDoCodigo)).toEqual({ tabelaId: 'tab-sul' })
        expect(L().tabelaDaEsquadria({ tipologia: 'DP-01', tabela_id: null }, tabelasDoCodigo)).toEqual({ tabelaId: 'tab-wolff' })
        expect(L().tabelaDaEsquadria({ tipologia: 'XX-9', tabela_id: null }, tabelasDoCodigo)).toBeNull()
        expect(L().tabelaDaEsquadria({ tipologia: null, tabela_id: null }, tabelasDoCodigo)).toBeNull()
    })

    /**
     * O MESMO fornecedor com FAMÍLIAS diferentes (dono do produto, 26/10/2026: a Wolff com PVC e alumínio): a
     * desambiguação é por FORNECEDOR + FAMÍLIA, e a pergunta cita a família.
     */
    describe('o mesmo fornecedor, famílias diferentes', () => {
        const PVC = { tabelaId: 'tab-wolff-pvc', fornecedor: 'Wolff', familia: 'PVC' as string | null }
        const ALU = { tabelaId: 'tab-wolff-alu', fornecedor: 'Wolff', familia: 'Alumínio' as string | null }
        const doCodigo = (c: string) => (c === 'DP-02' ? [ALU, PVC] : [])
        const ctxF = { tipologias: TIPOLOGIAS, cores: CORES, ordemPadrao: 1, definicao: def, tabelasDoCodigo: doCodigo }

        it('a pergunta cita a FAMÍLIA, e a resposta pela família resolve a tabela', () => {
            const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxF).itens
            const p = L().proximaPendencia(antes, def, doCodigo)
            expect(p).toEqual({ tipo: 'FORNECEDOR', ordem: 1, tipologia: 'DP-02', opcoes: [{ fornecedor: 'Wolff', familia: 'Alumínio' }, { fornecedor: 'Wolff', familia: 'PVC' }] })
            expect(L().perguntaDaPendencia(p!, 1)).toBe('A DP-02 está em 2 tabelas da Wolff: de Alumínio ou de PVC. De qual família é?')
            const r = L().aplicarProposta(antes, { itens: [{ familia: 'pvc' }] }, ctxF)
            expect(r.itens[0].tabela_id).toBe('tab-wolff-pvc')
            expect([r.propostos, r.descartados]).toEqual([1, 0])
        })

        it('só o fornecedor, que as duas têm, não resolve: descartado, e a pergunta continua', () => {
            const antes = L().aplicarProposta([L().itemVazio(1)], { itens: [COMPLETA] }, ctxF).itens
            const r = L().aplicarProposta(antes, { itens: [{ fornecedor: 'Wolff' }] }, ctxF)
            expect(r.itens[0].tabela_id).toBeNull()
            expect([r.propostos, r.descartados]).toEqual([1, 1])
        })

        it('fornecedores e famílias misturados: cada opção pelo nome, e a família só onde o fornecedor se repete', () => {
            expect(L().fraseDeQualFornecedor('DP-02', [{ fornecedor: 'Perfis Sul', familia: 'PVC' }, { fornecedor: 'Wolff', familia: 'Alumínio' }, { fornecedor: 'Wolff', familia: 'PVC' }]))
                .toBe('A DP-02 está em 3 tabelas: Perfis Sul, Wolff (Alumínio) ou Wolff (PVC). De qual delas é?')
            expect(L().fraseDeQualFornecedor('DP-02', [{ fornecedor: 'Wolff', familia: null }, { fornecedor: 'Wolff', familia: 'PVC' }]))
                .toBe('A DP-02 está em 2 tabelas da Wolff: de família não informada ou de PVC. De qual família é?')
        })
    })
})
