/**
 * PORTÃO — o AGRUPADOR DE BARRAS (`src/lib/atendimentos-ia/agrupador-de-barras.ts`): dadas as peças
 * de um LEVANTAMENTO inteiro, quantas barras de cada código comprar, quanto sobra, e quanto custa por
 * barra inteira e por consumo real.
 *
 * As regras são as da mensagem do dono do produto de 24/10/2026. A seção XL de
 * `claude/Regra_Secao_Clientes.md`, citada como fonte, NÃO está no repositório e não foi lida.
 *
 * O MODELO DO CORTE, decidido pelo dono do produto em 24/10/2026: cada peça consome UM corte de
 * `serra_mm`, inclusive a última (que a separa da sobra). Uma barra comporta as peças cuja soma de
 * (comprimento + serra) não passa do comprimento da barra — encostar no fim é permitido (≤).
 * O enunciado original pedia "com serra de 100 mm, cabem só 2", o que nenhum modelo de corte fazia
 * concordar com a conta escrita ("5,7 + 2 cortes"): o caso que discrimina a serra usa 101 mm, e o
 * de 100 mm fica como FRONTEIRA.
 *
 * Cada caso fica VERMELHO sem a sua regra: a tabela das mutações está em
 * `scripts/harness/agrupador-de-barras/README.md`.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// Lido DENTRO dos casos: no commit do portão o módulo ainda não existe, e um `require` no topo
// derrubaria o arquivo inteiro de uma vez — cada caso tem de ficar vermelho por conta própria.
type Agrupador = typeof import('@/lib/atendimentos-ia/agrupador-de-barras')
const G = () => require('@/lib/atendimentos-ia/agrupador-de-barras') as Agrupador
/* eslint-enable @typescript-eslint/no-require-imports */

type Peca = { codigo: string; comprimento_mm: number; quantidade: number }
type Barra = { comprimento_mm: number | null; valor_barra_interno?: number | null; valor_metro_interno?: number | null }

function agrupar(pecas: Peca[], barras: Record<string, Barra>, serra_mm: number) {
    return G().agruparEmBarras({ pecas, barras, serra_mm })
}
function ok(pecas: Peca[], barras: Record<string, Barra>, serra_mm: number) {
    const r = agrupar(pecas, barras, serra_mm)
    if (!r.ok) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r
}
const doCodigo = (r: ReturnType<typeof ok>, codigo: string) => {
    const c = r.por_codigo.find((x) => x.codigo === codigo)
    if (!c) throw new Error(`código ${codigo} ausente do resultado`)
    return c
}
/** As barras de um código como listas de comprimentos — o "barra por barra" dos casos. */
const composicao = (r: ReturnType<typeof ok>, codigo: string) => doCodigo(r, codigo).barras.map((b) => b.pecas_mm)

const B6 = { comprimento_mm: 6000 }

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('a serra entra na conta — cada peça consome um corte', () => {
    it('3 peças de 1,9 m numa barra de 6 m, serra 5 mm: cabem as 3 numa barra (3 × 1.905 = 5.715)', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900, 1900]])
    })

    it('a mesma entrada com serra de 101 mm: cabem só 2 (3 × 2.001 = 6.003 > 6.000) — 2 barras', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 101)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900], [1900]])
    })

    it('FRONTEIRA: serra de 100 mm dá exatamente 6.000 — encostar no fim da barra é permitido, cabem 3', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 100)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900, 1900]])
        expect(doCodigo(r, 'P1').barras[0].sobra_mm).toBe(0)
    })

    it('4,5 m e 1,5 m numa barra de 6 m NÃO cabem juntas (4.505 + 1.505 = 6.010 > 6.000): 2 barras', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 4500, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 1500, quantidade: 1 }], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[4500], [1500]])
        expect(doCodigo(r, 'P1').n_barras).toBe(2)
    })

    it('o consumo da serra sai à parte, e a sobra é TUDO o que se compra e não vira peça (retalho + serra)', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 5), 'P1')
        expect(c.metros_uteis).toBe(5.7)
        expect(c.serra_consumida_mm).toBe(15)
        expect(c.sobra_mm).toBe(300)          // 6.000 − 5.700: os 15 da serra estão dentro
        expect(c.barras[0].sobra_mm).toBe(285) // na barra, o retalho de verdade: 6.000 − 5.715
    })
})

describe('o agrupamento é do LEVANTAMENTO, e por CÓDIGO', () => {
    it('duas esquadrias diferentes, mesmo código: as peças COMPARTILHAM barra (2 × 2.905 = 5.810)', () => {
        const r = ok([
            { codigo: 'P1', comprimento_mm: 2900, quantidade: 1 }, // da esquadria A
            { codigo: 'P1', comprimento_mm: 2900, quantidade: 1 }, // da esquadria B
        ], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[2900, 2900]])
    })

    it('mesmo comprimento, códigos DIFERENTES: NÃO compartilham — uma barra de cada, mesmo cabendo numa', () => {
        const r = ok([
            { codigo: 'P1', comprimento_mm: 2900, quantidade: 1 },
            { codigo: 'P2', comprimento_mm: 2900, quantidade: 1 },
        ], { P1: B6, P2: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[2900]])
        expect(composicao(r, 'P2')).toEqual([[2900]])
        expect(r.total.n_barras).toBe(2)
    })
})

describe('o comprimento da barra vem DO ITEM', () => {
    it('barra de 5,5 m: 2 peças de 2,8 m não cabem (2 × 2.805 = 5.610 > 5.500) — numa de 6 m caberiam', () => {
        const r = ok([{ codigo: 'P55', comprimento_mm: 2800, quantidade: 2 }], { P55: { comprimento_mm: 5500 } }, 5)
        expect(composicao(r, 'P55')).toEqual([[2800], [2800]])
        expect(doCodigo(r, 'P55').metros_comprados).toBe(11)
    })

    it('milimetrosDaBarra: 5,8 m são 5.800 mm EXATOS (5,8 × 1000 dá 5800.000000000001 em ponto flutuante)', () => {
        expect(G().milimetrosDaBarra(5.8)).toBe(5800)
        expect(G().milimetrosDaBarra(5.5)).toBe(5500)
        expect(G().milimetrosDaBarra(6)).toBe(6000)
        expect(G().milimetrosDaBarra(null)).toBeNull()
    })

    it('código SEM comprimento de barra: recusa nomeando o código — nunca supõe 6 m', () => {
        const r = agrupar([{ codigo: 'SEM', comprimento_mm: 1000, quantidade: 1 }], { SEM: { comprimento_mm: null } }, 5)
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.recusas).toEqual([{ motivo: 'BARRA_SEM_COMPRIMENTO', codigo: 'SEM', mensagem: G().fraseDaBarraSemComprimento('SEM') }])
    })
})

describe('a peça é INDIVISÍVEL', () => {
    it('peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos', () => {
        const r = agrupar([{ codigo: 'P1', comprimento_mm: 6200, quantidade: 1 }], { P1: B6 }, 5)
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.recusas).toEqual([{
            motivo: 'PECA_MAIOR_QUE_A_BARRA', codigo: 'P1', comprimento_peca_mm: 6200, comprimento_barra_mm: 6000,
            mensagem: G().fraseDaPecaMaiorQueABarra('P1', 6200, 6000),
        }])
        expect(r.recusas[0].mensagem).toContain('P1')
        expect(r.recusas[0].mensagem).toContain('6200')
        expect(r.recusas[0].mensagem).toContain('6000')
    })

    it('peça do tamanho EXATO da barra: não cabe com o corte (6.000 + 5 > 6.000) — recusa com motivo próprio, não "maior"', () => {
        const r = agrupar([{ codigo: 'P1', comprimento_mm: 6000, quantidade: 1 }], { P1: B6 }, 5)
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.recusas).toEqual([{
            motivo: 'PECA_NAO_CABE_COM_O_CORTE', codigo: 'P1', comprimento_peca_mm: 6000, comprimento_barra_mm: 6000, serra_mm: 5,
            mensagem: G().fraseDaPecaQueNaoCabeComOCorte('P1', 6000, 6000, 5),
        }])
    })

    it('uma recusa não esconde as outras: todas saem, na ordem do código', () => {
        const r = agrupar([
            { codigo: 'P2', comprimento_mm: 7000, quantidade: 1 },
            { codigo: 'P1', comprimento_mm: 6200, quantidade: 1 },
            { codigo: 'P3', comprimento_mm: 1000, quantidade: 1 },
        ], { P1: B6, P2: B6, P3: B6 }, 5)
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.recusas.map((x) => x.codigo)).toEqual(['P1', 'P2'])
    })
})

describe('DETERMINÍSTICO: mesma entrada, mesmas barras, sempre', () => {
    const LEVANTAMENTO: Peca[] = [
        { codigo: 'P1', comprimento_mm: 4000, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 2000, quantidade: 2 },
        { codigo: 'P1', comprimento_mm: 1900, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 3100, quantidade: 3 },
        { codigo: 'P2', comprimento_mm: 2950, quantidade: 4 }, { codigo: 'P2', comprimento_mm: 800.5, quantidade: 3 },
        { codigo: 'P10', comprimento_mm: 5400, quantidade: 1 }, { codigo: 'P10', comprimento_mm: 500, quantidade: 5 },
        { codigo: 'A9', comprimento_mm: 1200, quantidade: 2 },
    ]
    const BARRAS = { P1: B6, P2: { comprimento_mm: 5800 }, P10: { comprimento_mm: 5500 }, A9: B6 }
    /** Embaralha com um gerador DETERMINÍSTICO (o teste também tem de ser repetível), e quebra as quantidades. */
    function variante(semente: number): Peca[] {
        let s = semente
        const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
        const quebradas = LEVANTAMENTO.flatMap((p) => (rnd() < 0.5 || p.quantidade === 1 ? [p] : Array.from({ length: p.quantidade }, () => ({ ...p, quantidade: 1 }))))
        for (let i = quebradas.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [quebradas[i], quebradas[j]] = [quebradas[j], quebradas[i]] }
        return quebradas
    }

    it('a mesma entrada embaralhada de 20 formas (e com as quantidades quebradas) dá EXATAMENTE o mesmo resultado, barra por barra', () => {
        const base = ok(LEVANTAMENTO, BARRAS, 5)
        const variantes = Array.from({ length: 20 }, (_, i) => variante(i + 1))
        // as variantes são de fato diferentes da entrada — senão o caso não exercitaria nada
        expect(variantes.filter((v) => JSON.stringify(v) !== JSON.stringify(LEVANTAMENTO)).length).toBe(20)
        for (const v of variantes) expect(ok(v, BARRAS, 5)).toEqual(base)
    })

    it('a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decrescente)', () => {
        const r = ok(LEVANTAMENTO, BARRAS, 5)
        expect(r.por_codigo.map((c) => c.codigo)).toEqual(['A9', 'P1', 'P10', 'P2'])
        expect(composicao(r, 'P1')).toEqual([[4000, 1900], [3100, 2000], [3100, 2000], [3100]])
        expect(composicao(r, 'P10')).toEqual([[5400], [500, 500, 500, 500, 500]])
    })
})

describe('os DOIS valores — sempre os dois; quem escolhe é o orçamentista', () => {
    const PRECO = { comprimento_mm: 6000, valor_barra_interno: 75, valor_metro_interno: 12.5 }

    it('por barra inteira = nº de barras × valor da barra; por consumo real = metros úteis × valor do metro', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 4500, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 1500, quantidade: 1 }], { P1: PRECO }, 5), 'P1')
        expect(c.total_por_barra_inteira).toBe(150)   // 2 barras × 75
        expect(c.total_por_consumo_real).toBe(75)     // 6,0 m úteis × 12,5
    })

    it('a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro)', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: PRECO }, 5), 'P1')
        expect(c.total_por_barra_inteira! - c.total_por_consumo_real!).toBe((c.sobra_mm / 1000) * PRECO.valor_metro_interno)
        expect(c.total_por_barra_inteira! - c.total_por_consumo_real!).toBe(3.75) // 300 mm × 12,5/m
    })

    it('sem o preço do item, os dois saem NULL (não apurado), nunca zero; com só um dos preços, só aquele sai null', () => {
        const sem = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 1 }], { P1: B6 }, 5), 'P1')
        expect(sem.total_por_barra_inteira).toBeNull()
        expect(sem.total_por_consumo_real).toBeNull()
        const soMetro = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 1 }], { P1: { comprimento_mm: 6000, valor_metro_interno: 12.5 } }, 5), 'P1')
        expect(soMetro.total_por_barra_inteira).toBeNull()
        expect(soMetro.total_por_consumo_real).toBe(23.75)
    })

    it('no total do levantamento: os dois somados quando TODO código tem preço; se um não tem, o total é null — soma parcial mentiria', () => {
        const com = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }, { codigo: 'P2', comprimento_mm: 5000, quantidade: 1 }], { P1: PRECO, P2: PRECO }, 5)
        expect(com.total.total_por_barra_inteira).toBe(150)
        expect(com.total.total_por_consumo_real).toBe(133.75) // (5,7 + 5,0) m × 12,5
        const parcial = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }, { codigo: 'P2', comprimento_mm: 5000, quantidade: 1 }], { P1: PRECO, P2: B6 }, 5)
        expect(parcial.total.total_por_barra_inteira).toBeNull()
        expect(parcial.total.total_por_consumo_real).toBeNull()
    })
})

describe('o total do levantamento', () => {
    it('barras por código, metros úteis e comprados, e o aproveitamento = úteis ÷ comprados (não a média dos códigos)', () => {
        // P1: 5,7 úteis em 6 comprados (95%); P2: 1,0 útil em 6 comprados (16,7%). A média daria 55,8%.
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }, { codigo: 'P2', comprimento_mm: 1000, quantidade: 1 }], { P1: B6, P2: B6 }, 5)
        expect(r.total.barras_por_codigo).toEqual({ P1: 1, P2: 1 })
        expect(r.total.n_barras).toBe(2)
        expect(r.total.metros_uteis).toBe(6.7)
        expect(r.total.metros_comprados).toBe(12)
        expect(r.total.aproveitamento_pct).toBeCloseTo((6.7 / 12) * 100, 10)
        expect(doCodigo(r, 'P1').aproveitamento_pct).toBeCloseTo(95, 10)
    })
})

describe('entrada inválida é recusada, nunca corrigida', () => {
    it('serra negativa, quantidade não inteira e comprimento não positivo: cada um vira uma recusa própria', () => {
        const r = agrupar([
            { codigo: 'P1', comprimento_mm: 1000, quantidade: 1.5 },
            { codigo: 'P2', comprimento_mm: 0, quantidade: 1 },
        ], { P1: B6, P2: B6 }, -1)
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.recusas.map((x) => x.motivo)).toEqual(['SERRA_INVALIDA', 'QUANTIDADE_INVALIDA', 'COMPRIMENTO_INVALIDO'])
    })
})
