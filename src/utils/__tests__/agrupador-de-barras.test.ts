/**
 * PORTÃO — o AGRUPADOR DE BARRAS (`src/lib/atendimentos-ia/agrupador-de-barras.ts`): dadas as peças
 * de um LEVANTAMENTO inteiro, quantas barras de cada código comprar, quanto sobra, e quanto custa por
 * barra inteira e por consumo real.
 *
 * As regras são as da mensagem do dono do produto de 24/10/2026. A seção XL de
 * `claude/Regra_Secao_Clientes.md`, citada como fonte, NÃO está no repositório e não foi lida.
 *
 * O MODELO DO CORTE — corrigido pelo dono do produto em 24/10/2026, substituindo o "um corte por
 * peça, sempre" do #143, que não deixava uma peça de 6.000 mm caber numa barra de 6.000 mm:
 *     cortes = (n − 1) + (1 se sobrar material, 0 se a soma fechar exata)
 * Um corte entre cada par de peças, mais o que separa a última peça da sobra — e esse só existe
 * quando há sobra. Uma barra comporta as peças se Σ peças + (n − 1) × serra ≤ barra (encostar no
 * fim é permitido). Quando sobra MENOS que a largura da serra, as peças cabem e o último corte come
 * só o que sobra — decisão do dono do produto, na mesma data. A serra que discrimina 3 × 1.900 é
 * 151 mm; 150 é a FRONTEIRA, em que a soma fecha exata com 2 cortes.
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
// O estreitamento é por `'recusas' in r`, não por `r.ok`: com `strictNullChecks: false` (tsconfig),
// o tsc não estreita a união pelo booleano — o jest rodaria verde e o tsc acusaria.

type Peca = { codigo: string; comprimento_mm: number; quantidade: number }
type Barra = { comprimento_mm: number | null; valor_barra_interno?: number | null; valor_metro_interno?: number | null }

function agrupar(pecas: Peca[], barras: Record<string, Barra>, serra_mm: number) {
    return G().agruparEmBarras({ pecas, barras, serra_mm })
}
function ok(pecas: Peca[], barras: Record<string, Barra>, serra_mm: number) {
    const r = agrupar(pecas, barras, serra_mm)
    if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
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
describe('a serra entra na conta — um corte ENTRE as peças, e o da sobra só quando há sobra', () => {
    it('3 peças de 1,9 m numa barra de 6 m, serra 5 mm: 5.700 + 2 × 5 = 5.710 ≤ 6.000 — cabem as 3, com 3 cortes', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900, 1900]])
        expect(doCodigo(r, 'P1').barras[0].cortes).toBe(3) // sobram 290: o 3º corte separa a última peça da sobra
        expect(doCodigo(r, 'P1').n_cortes).toBe(3)
    })

    it('a mesma entrada com serra de 151 mm: 5.700 + 2 × 151 = 6.002 > 6.000 — cabem só 2, 2 barras', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 151)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900], [1900]])
    })

    it('FRONTEIRA: serra de 150 mm fecha EXATO (5.700 + 2 × 150 = 6.000) — cabem 3, 2 cortes, sobra 0', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 150)
        expect(composicao(r, 'P1')).toEqual([[1900, 1900, 1900]])
        const b = doCodigo(r, 'P1').barras[0]
        expect(b.cortes).toBe(2)
        expect(b.sobra_mm).toBe(0)
        expect(doCodigo(r, 'P1').serra_consumida_mm).toBe(300)
    })

    it('sobra MENOR que a serra: as peças cabem e o último corte come só o resto — serra 120, sobram 60 de 6.000', () => {
        // 5.700 + 2 × 120 = 5.940; o resto, 60 mm, é menor que a serra: o corte que separa a última
        // peça come os 60, e não os 120. Decisão do dono do produto, 24/10/2026.
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 120), 'P1')
        expect(c.barras.map((b) => b.pecas_mm)).toEqual([[1900, 1900, 1900]])
        expect(c.barras[0].cortes).toBe(3)
        expect(c.serra_consumida_mm).toBe(300) // 2 × 120 + 60
        expect(c.barras[0].usado_mm).toBe(6000)
        expect(c.barras[0].sobra_mm).toBe(0)
    })

    it('duas peças que fecham a barra EXATO com o corte entre elas: 3.000 + 5 + 2.995 = 6.000 — 1 barra, 1 corte, sobra 0', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 3000, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 2995, quantidade: 1 }], { P1: B6 }, 5), 'P1')
        expect(c.barras.map((b) => b.pecas_mm)).toEqual([[3000, 2995]])
        expect(c.barras[0].cortes).toBe(1)
        expect(c.barras[0].sobra_mm).toBe(0)
        expect(c.sobra_mm).toBe(5) // comprado − útil: o corte entre as duas
    })

    it('4,5 m e 1,5 m numa barra de 6 m NÃO cabem juntas (4.500 + 5 + 1.500 = 6.005 > 6.000): 2 barras', () => {
        const r = ok([{ codigo: 'P1', comprimento_mm: 4500, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 1500, quantidade: 1 }], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[4500], [1500]])
        expect(doCodigo(r, 'P1').n_barras).toBe(2)
    })

    it('peças com decimais que fecham EXATO a barra cabem: 2.043,4 + 2.043,3 + 1.903,3 + 2 × 5 = 6.000', () => {
        // somada em mm com ponto flutuante, NA ORDEM E NAS OPERAÇÕES DO AGRUPADOR (decrescente; ocupado
        // + serra + peça), a mesma conta dá 6000.000000000001 e a barra recusaria o que cabe. Medido em
        // 24/10/2026. O caso do #143 (2.046,3 + 2.042,9 + 1.895,8) fechava com 3 cortes; com 2 sobram
        // 5 mm, ele saiu da fronteira e deixou de discriminar o M24.
        const r = ok([{ codigo: 'P1', comprimento_mm: 1903.3, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 2043.4, quantidade: 1 },
            { codigo: 'P1', comprimento_mm: 2043.3, quantidade: 1 }], { P1: B6 }, 5)
        expect(composicao(r, 'P1')).toEqual([[2043.4, 2043.3, 1903.3]])
        expect(doCodigo(r, 'P1').barras[0].cortes).toBe(2)
        expect(doCodigo(r, 'P1').barras[0].sobra_mm).toBe(0)
    })

    it('o consumo da serra sai à parte, e a sobra é TUDO o que se compra e não vira peça (retalho + serra)', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }], { P1: B6 }, 5), 'P1')
        expect(c.metros_uteis).toBe(5.7)
        expect(c.serra_consumida_mm).toBe(15)
        expect(c.sobra_mm).toBe(300)          // 6.000 − 5.700: os 15 da serra estão dentro
        // na barra, o retalho de verdade: depois dos 2 cortes entre as peças restam 290 mm, e o corte
        // que separa a última peça da sobra consome 5 deles — 6.000 − 5.715 = 285
        expect(c.barras[0].sobra_mm).toBe(285)
    })
})

describe('o agrupamento é do LEVANTAMENTO, e por CÓDIGO', () => {
    it('duas esquadrias diferentes, mesmo código: as peças COMPARTILHAM barra (2.900 + 5 + 2.900 = 5.805)', () => {
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
    it('barra de 5,5 m: 2 peças de 2,8 m não cabem (2.800 + 5 + 2.800 = 5.605 > 5.500) — numa de 6 m caberiam', () => {
        const r = ok([{ codigo: 'P55', comprimento_mm: 2800, quantidade: 2 }], { P55: { comprimento_mm: 5500 } }, 5)
        expect(composicao(r, 'P55')).toEqual([[2800], [2800]])
        expect(doCodigo(r, 'P55').metros_comprados).toBe(11)
    })

    it('milimetrosDaBarra: 2,01 m são 2.010 mm EXATOS (2,01 × 1000 dá 2009.9999999999998 em ponto flutuante)', () => {
        // MEDIDO em 24/10/2026: nenhuma medida que existe hoje em produção (6; 5,8; 5,5; 1; 100; 300)
        // falha em `m × 1000` — 175 das 12.000 medidas de até 3 casas, até 12 m, falham. O caso usa uma
        // delas, porque com as de produção ele passaria verde sem a conversão (`teste-que-nao-exercita.md`).
        expect(G().milimetrosDaBarra(2.01)).toBe(2010)
        expect(G().milimetrosDaBarra(5.8)).toBe(5800)
        expect(G().milimetrosDaBarra(5.5)).toBe(5500)
        expect(G().milimetrosDaBarra(6)).toBe(6000)
        expect(G().milimetrosDaBarra(null)).toBeNull()
    })

    it('código SEM comprimento de barra: recusa nomeando o código — nunca supõe 6 m', () => {
        const r = agrupar([{ codigo: 'SEM', comprimento_mm: 1000, quantidade: 1 }], { SEM: { comprimento_mm: null } }, 5)
        expect(r.ok).toBe(false)
        if (!('recusas' in r)) return
        expect(r.recusas).toEqual([{ motivo: 'BARRA_SEM_COMPRIMENTO', codigo: 'SEM', mensagem: G().fraseDaBarraSemComprimento('SEM') }])
    })
})

describe('a peça é INDIVISÍVEL', () => {
    it('peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos', () => {
        const r = agrupar([{ codigo: 'P1', comprimento_mm: 6200, quantidade: 1 }], { P1: B6 }, 5)
        expect(r.ok).toBe(false)
        if (!('recusas' in r)) return
        expect(r.recusas).toEqual([{
            motivo: 'PECA_MAIOR_QUE_A_BARRA', codigo: 'P1', comprimento_peca_mm: 6200, comprimento_barra_mm: 6000,
            mensagem: G().fraseDaPecaMaiorQueABarra('P1', 6200, 6000),
        }])
        expect(r.recusas[0].mensagem).toContain('P1')
        expect(r.recusas[0].mensagem).toContain('6200')
        expect(r.recusas[0].mensagem).toContain('6000')
    })

    it('peça do tamanho EXATO da barra CABE: 1 peça, 0 cortes, sobra 0, aproveitamento 100% — não há o que separar', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 6000, quantidade: 1 }], { P1: B6 }, 5), 'P1')
        expect(c.barras.map((b) => b.pecas_mm)).toEqual([[6000]])
        expect(c.n_pecas).toBe(1)
        expect(c.barras[0].cortes).toBe(0)
        expect(c.n_cortes).toBe(0)
        expect(c.serra_consumida_mm).toBe(0)
        expect(c.barras[0].sobra_mm).toBe(0)
        expect(c.sobra_mm).toBe(0)
        expect(c.aproveitamento_pct).toBe(100)
    })

    it('peça a menos de uma serra do fim da barra CABE: 5.998 em 6.000 com serra 5 — o corte come os 2 mm', () => {
        const c = doCodigo(ok([{ codigo: 'P1', comprimento_mm: 5998, quantidade: 1 }], { P1: B6 }, 5), 'P1')
        expect(c.barras.map((b) => b.pecas_mm)).toEqual([[5998]])
        expect(c.barras[0].cortes).toBe(1)
        expect(c.serra_consumida_mm).toBe(2)
        expect(c.barras[0].sobra_mm).toBe(0)
    })

    it('uma recusa não esconde as outras: todas saem, na ordem do código', () => {
        const r = agrupar([
            { codigo: 'P2', comprimento_mm: 7000, quantidade: 1 },
            { codigo: 'P1', comprimento_mm: 6200, quantidade: 1 },
            { codigo: 'P3', comprimento_mm: 1000, quantidade: 1 },
        ], { P1: B6, P2: B6, P3: B6 }, 5)
        expect(r.ok).toBe(false)
        if (!('recusas' in r)) return
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

describe('MONOTONICIDADE: serra maior nunca dá MENOS barras', () => {
    // É a razão de o outro modelo de corte ter caído, em 24/10/2026: na leitura em que o último corte
    // cobra a serra inteira mesmo quando sobra menos que ela, 3 × 1.900 numa barra de 6.000 dava 1
    // barra com serra 100, 2 com serra 101 a 149, 1 com serra 150 (fecha exato) e 2 de 151 em
    // diante. Uma serra MAIS LARGA comprando MENOS barras é uma conta que nenhum serralheiro aceita.
    // Até este caso a razão só estava na conversa; a mutação M26 (aquela leitura) o derruba.
    //
    // O que este caso NÃO afirma: que o first fit decrescente é monótono para QUALQUER conjunto. O
    // critério de encaixe de uma barra é monótono na serra, mas o FFD tem anomalias conhecidas
    // quando as peças crescem. Medido em 24/10/2026: em 27.000 conjuntos aleatórios de 3 a 23 peças,
    // serra de 0 a 200 mm, nenhuma. É medição, não teorema — o caso fixa o conjunto abaixo.
    const CONJUNTO: Peca[] = [
        { codigo: 'P1', comprimento_mm: 4000, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 2000, quantidade: 2 },
        { codigo: 'P1', comprimento_mm: 1900, quantidade: 1 }, { codigo: 'P1', comprimento_mm: 3100, quantidade: 3 },
        { codigo: 'P2', comprimento_mm: 2950, quantidade: 4 }, { codigo: 'P2', comprimento_mm: 800.5, quantidade: 3 },
        // 5.200, e não os 5.400 do caso de determinismo: nenhuma peça pode ficar a menos de 200 mm do fim
        // da sua barra, ou a mutação M26 a RECUSA e derruba o caso por recusa, não por queda — medido:
        // com 5.400 em barra de 5.500 foi exatamente o que aconteceu, e o caso caía pelo motivo errado
        { codigo: 'P10', comprimento_mm: 5200, quantidade: 1 }, { codigo: 'P10', comprimento_mm: 500, quantidade: 5 },
        { codigo: 'A9', comprimento_mm: 1200, quantidade: 2 },
        { codigo: 'T3', comprimento_mm: 1900, quantidade: 3 },                                   // fecha exato com serra 150
        { codigo: 'D2', comprimento_mm: 3000, quantidade: 1 }, { codigo: 'D2', comprimento_mm: 2995, quantidade: 1 }, // fecha exato com serra 5
    ]
    const BARRAS = { P1: B6, P2: { comprimento_mm: 5800 }, P10: { comprimento_mm: 5500 }, A9: B6, T3: B6, D2: B6 }

    it('serra de 0 a 200 mm, de 1 em 1: o número de barras de cada código e do levantamento nunca diminui', () => {
        const varredura = Array.from({ length: 201 }, (_, serra) => ({ serra, r: ok(CONJUNTO, BARRAS, serra) }))
        const quedas: string[] = []
        for (let i = 1; i < varredura.length; i++) {
            const antes = varredura[i - 1], agora = varredura[i]
            if (agora.r.total.n_barras < antes.r.total.n_barras) quedas.push(`levantamento: serra ${antes.serra} → ${agora.serra}, ${antes.r.total.n_barras} → ${agora.r.total.n_barras} barras`)
            for (const codigo of Object.keys(BARRAS)) {
                const a = doCodigo(antes.r, codigo).n_barras, b = doCodigo(agora.r, codigo).n_barras
                if (b < a) quedas.push(`${codigo}: serra ${antes.serra} → ${agora.serra}, ${a} → ${b} barras`)
            }
        }
        expect(quedas).toEqual([])
        // e a varredura de fato atravessa mudanças — senão o caso não exercitaria nada
        expect(varredura[0].r.total.n_barras).toBeLessThan(varredura[200].r.total.n_barras)
        expect(doCodigo(varredura[150].r, 'T3').n_barras).toBe(1)
        expect(doCodigo(varredura[151].r, 'T3').n_barras).toBe(2)
        expect(doCodigo(varredura[5].r, 'D2').n_barras).toBe(1)
        expect(doCodigo(varredura[6].r, 'D2').n_barras).toBe(2)
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
        // P1: 5,7 úteis em 6 comprados (95%); P2: 10 úteis em 12 comprados (83,3%). Úteis ÷ comprados:
        // 15,7 ÷ 18 = 87,22%; a MÉDIA dos códigos daria 89,17%. Com códigos de mesmo peso as duas
        // contas coincidem e o caso não discriminaria — foi o que a mutação M14 mostrou na 1ª versão.
        const r = ok([{ codigo: 'P1', comprimento_mm: 1900, quantidade: 3 }, { codigo: 'P2', comprimento_mm: 5000, quantidade: 2 }], { P1: B6, P2: B6 }, 5)
        expect(r.total.barras_por_codigo).toEqual({ P1: 1, P2: 2 })
        expect(r.total.n_barras).toBe(3)
        expect(r.total.metros_uteis).toBe(15.7)
        expect(r.total.metros_comprados).toBe(18)
        expect(r.total.aproveitamento_pct).toBeCloseTo((15.7 / 18) * 100, 10)
        expect(r.total.aproveitamento_pct).not.toBeCloseTo((95 + (10 / 12) * 100) / 2, 2)
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
        if (!('recusas' in r)) return
        expect(r.recusas.map((x) => x.motivo)).toEqual(['SERRA_INVALIDA', 'QUANTIDADE_INVALIDA', 'COMPRIMENTO_INVALIDO'])
    })
})
