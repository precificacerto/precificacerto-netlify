/** @jest-environment node */
/**
 * OS RELATÓRIOS I.A. EM PDF (dono do produto, 17/11/2026): "Relatório de material e relatório de corte, ambos devem ter um arquivo para
 * impressão." O PDF é a tela no papel: as mesmas categorias, na mesma ordem, os mesmos números; nada recalculado.
 */
import type { RelatorioDeCorte } from '@/lib/atendimentos-ia/relatorio-de-corte'
import type { RelatorioDeMateriais } from '@/lib/atendimentos-ia/relatorio-de-materiais'
import { nomeDoRelatorio, pdfDasBarrasDoPedido, pdfDoRelatorioDeCorte, pdfDoRelatorioDeMateriais } from '@/lib/atendimentos-ia/relatorios-em-pdf'
import { montarBarrasDoPedido, type PecaDoPedido } from '@/lib/atendimentos-ia/barras-do-pedido'

const WIN_ANSI: Record<string, string> = { '\x97': '—', '\x95': '•', '\xb7': '·' }
const textoDoPdf = (pdf: Uint8Array) => [...Buffer.from(pdf).toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, '$1').replace(/[\x97\x95]/g, (c) => WIN_ANSI[c] ?? c))
const paginas = (pdf: Uint8Array) => (Buffer.from(pdf).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length
const cab = { numero: 8, cliente: 'Cristiano Fernandes', geradoEm: new Date('2026-11-17T15:30:00Z') }

const materiais: RelatorioDeMateriais & { itensSemCalculo: number[] } = {
    categorias: [
        { chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'MARCO 60', unidade: 'm' as const, quantidade: 12.5, custo_bruto: 1234.5, custo_liquido: 1000 }],
          total: { custo_bruto: 1234.5, custo_liquido: 1000, codigosSemCusto: [] as string[] } },
        { chave: 'REFORCO', rotulo: 'Reforço metálico', materiais: [{ codigo: '8523', descricao: 'REFORÇO GALV.', unidade: 'm' as const, quantidade: 3, custo_bruto: null, custo_liquido: null }],
          total: { custo_bruto: null, custo_liquido: null, codigosSemCusto: ['8523'] } },
    ],
    semCategoria: [{ codigo: 'X1', descricao: null, unidade: 'un' as const, quantidade: 4, custo_bruto: 10, custo_liquido: 9, motivo: 'a tabela de onde o preço saiu não tem categoria declarada' }],
    ambiguos: [{ codigo: 'Y1', descricao: 'PARAFUSO', unidade: 'un' as const, quantidade: 2, custo_bruto: 1, custo_liquido: 1, categorias: ['FERRAGENS', 'PERFIL'], motivo: 'motivo y' }],
    itensSemCalculo: [3],
    totalGeral: { custo_bruto: null, custo_liquido: null, codigosSemCusto: ['8523'] },
}
const VAZIO: RelatorioDeMateriais & { itensSemCalculo: number[] } = { categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: { custo_bruto: 0, custo_liquido: 0, codigosSemCusto: [] } }

describe('o PDF do relatório de materiais', () => {
    it('o cabeçalho do orçamento, as categorias na ordem da rota, cada código com a quantidade e a unidade, e o rodapé Página N de M', () => {
        const t = textoDoPdf(pdfDoRelatorioDeMateriais(materiais, cab))
        expect(t[0]).toBe('Relatório de materiais')
        expect(t).toContain('Orçamento 8 — Cristiano Fernandes')
        // o NÚMERO EXIBIDO (23/11/2026) no cabeçalho do PDF
        expect(textoDoPdf(pdfDoRelatorioDeMateriais(materiais, { ...cab, numero: '27-PVC' }))).toContain('Orçamento 27-PVC — Cristiano Fernandes')
        expect(t.indexOf('Perfil')).toBeLessThan(t.indexOf('Reforço metálico'))
        expect(t.indexOf('Reforço metálico')).toBeLessThan(t.indexOf('Em mais de uma categoria'))
        expect(t.indexOf('Em mais de uma categoria')).toBeLessThan(t.indexOf('Sem categoria'))
        expect(t).toEqual(expect.arrayContaining(['9681', 'MARCO 60', '12,50 m', '8523', '3,00 m', 'X1', '4 un', 'PARAFUSO (FERRAGENS, PERFIL: motivo y)',
            '— (a tabela de onde o preço saiu não tem categoria', 'declarada)']))
        // o custo de cada linha, o total de cada categoria e o total geral (22/11/2026); o que falta não é somado como zero
        expect(t.map((l) => l.replace(/\s/g, ' '))).toEqual(expect.arrayContaining(['R$ 1.234,50', 'R$ 1.000,00', 'não sai',
            'Total de Perfil: custo bruto R$ 1.234,50 · custo líquido R$ 1.000,00',
            'Total de Reforço metálico: o total não sai: o código 8523 não tem o custo gravado pelo cálculo.',
            'Total geral do pedido: o total não sai: o código 8523 não tem o custo gravado pelo cálculo.']))
        expect(t.indexOf('Sem categoria')).toBeLessThan(t.indexOf('Total geral'))
        expect(t).toContain('O item 3 sem cálculo: os materiais não estão neste relatório.')
        expect(t).toContain('Página 1 de 1')
    })
    it('sem material nenhum, o vazio é dito', () => {
        const t = textoDoPdf(pdfDoRelatorioDeMateriais(VAZIO, cab))
        expect(t).toContain('Nenhum material calculado neste orçamento.')
        expect(t.some((l) => l.includes('sem cálculo'))).toBe(false)
    })
    it('a lista longa quebra em páginas, e cada página diz "Página N de M" e repete o cabeçalho', () => {
        const muitos = Array.from({ length: 120 }, (_, i) => ({ codigo: `C${i}`, descricao: 'PEÇA', unidade: 'un' as const, quantidade: i + 1, custo_bruto: 1, custo_liquido: 1 }))
        const total = { custo_bruto: 120, custo_liquido: 120, codigosSemCusto: [] as string[] }
        const pdf = pdfDoRelatorioDeMateriais({ ...VAZIO, categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', materiais: muitos, total }], totalGeral: total }, cab)
        const n = paginas(pdf)
        expect(n).toBeGreaterThan(1)
        const t = textoDoPdf(pdf)
        expect(t).toContain(`Página ${n} de ${n}`)
        expect(t.filter((l) => l === 'Relatório de materiais')).toHaveLength(n)
        expect(t).toContain('C119')
    })
})

describe('o PDF do relatório de corte', () => {
    const corte: RelatorioDeCorte & { itensSemCalculo: number[]; itensSemPecas: number[] } = {
        categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', codigos: [
            { codigo: '9681', perfil: 'MARCO', descricao: 'MARCO 60', linhas: [{ comprimento_mm: 2000, corte: '45S/45S', posicao: 'Superior', quantidade: 2 }],
              plano: { barra_mm: 6000, serra_mm: 5, n_barras: 1, aproveitamento_pct: 66.7, barras: [{ pecas_mm: [2000, 2000], cortes: 2, usado_mm: 4010, sobra_mm: 1990 }] } },
            { codigo: '9682', perfil: 'FOLHA', descricao: null, linhas: [{ comprimento_mm: 1500.5, corte: null, posicao: null, quantidade: 1 }],
              plano: { semPlano: 'o código 9682 não teve barra no cálculo.' } },
        ] }],
        semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [1, 2],
    }
    it('cada código com a medida, o corte, a posição, a quantidade e o plano gravado; o sem plano diz por quê', () => {
        const t = textoDoPdf(pdfDoRelatorioDeCorte(corte, cab))
        expect(t[0]).toBe('Relatório de corte')
        expect(t).toEqual(expect.arrayContaining(['9681 — MARCO 60 (MARCO)', '2.000 mm', '45S/45S', 'Superior', '2', '9682 (FOLHA)', '1.500,5 mm', '—']))
        expect(t).toContain('Barra de 6.000 mm, serra de 5 mm: 1 barra, aproveitamento de 66,7%')
        expect(t.some((l) => l.startsWith('Barra 1: 2.000 mm + 2.000 mm') && l.endsWith('sobra 1.990 mm'))).toBe(true)
        expect(t).toContain('Sem plano de barras: o código 9682 não teve barra no cálculo.')
        expect(t.some((l) => l.startsWith('Os itens 1, 2 calculado(s) antes do relatório de corte existir'))).toBe(true)
    })
    it('sem peça nenhuma, o vazio é dito', () => {
        const t = textoDoPdf(pdfDoRelatorioDeCorte({ categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] }, cab))
        expect(t).toContain('Nenhuma peça de corte neste orçamento.')
    })
})

describe('o nome do arquivo', () => {
    it('sem acento nem caractere estranho, com o número e o cliente', () => {
        expect(nomeDoRelatorio('materiais', 8, 'José da Conceição / Obra')).toBe('Relatorio_de_materiais_8_-_Jose_da_Conceicao_Obra.pdf')
        expect(nomeDoRelatorio('corte', 3, '  ')).toBe('Relatorio_de_corte_3.pdf')
        // o NÚMERO EXIBIDO (23/11/2026): o do orçamento por família
        expect(nomeDoRelatorio('orientativo_de_montagem', '27-PVC', 'Ana')).toBe('Relatorio_de_orientativo_de_montagem_27-PVC_-_Ana.pdf')
    })
})

describe('as BARRAS DO PEDIDO em PDF (22/11/2026)', () => {
    const peca = (o: Partial<PecaDoPedido> & { comprimento_mm: number }): PecaDoPedido => ({
        codigo: '1023', perfil: '1023/WOLFF', descricao: 'CLICK GUIA', quantidade: 1, corte: '90/90', posicao: 'Largura',
        comprimento_barra_mm: 6000, serra_mm: 5, item: 6, tipologia: 'DP-72', cor: 'Branco', ...o,
    })
    const r = montarBarrasDoPedido([peca({ comprimento_mm: 4646 }), peca({ comprimento_mm: 1495, quantidade: 4, item: 3, tipologia: 'DP-07' }),
        peca({ codigo: '9681', perfil: 'SF66/WOLFF', descricao: null, comprimento_mm: 100, comprimento_barra_mm: null })], new Map([['1023', 0.101]]))
    it('o resumo com o total, uma barra por linha com as frações e a sobra, e o sem plano dito', () => {
        const t = textoDoPdf(pdfDasBarrasDoPedido({ ...r, itensSemCalculo: [], itensSemPecas: [], codigosSemPeso: ['9681'] }, cab))
        expect(t[0]).toBe('Barras do pedido')
        expect(t).toEqual(expect.arrayContaining(['Resumo por perfil', 'Total', '1023 — CLICK GUIA (1023/WOLFF) · Branco']))
        expect(t.join(' ')).toContain('4.646 mm 90/90 (Item 6 DP-72)')
        expect(t.join(' ')).toContain('1.495 mm 90/90 (Item 3 DP-07) + 1.495 mm 90/90 (Item 3 DP-07)')
        expect(t).toContain('1.349 mm')
        expect(t.join(' ')).toContain('Aproveitamento do PEDIDO: não muda o preço do orçamento')
        expect(t.join(' ')).toContain('não teve barra no cálculo')
        expect(t.join(' ')).toContain('Sem peso na tabela de preço: 9681')
    })
    it('o nome do arquivo', () => {
        expect(nomeDoRelatorio('barras_do_pedido', 12, 'Cristiano')).toBe('Relatorio_de_barras_do_pedido_12_-_Cristiano.pdf')
    })
})

describe('o PDF do orientativo de montagem (22/11/2026)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pdfDoOrientativoDeMontagem } = require('@/lib/atendimentos-ia/relatorios-em-pdf') as typeof import('@/lib/atendimentos-ia/relatorios-em-pdf')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const O = require('@/lib/atendimentos-ia/orientativo-de-montagem') as typeof import('@/lib/atendimentos-ia/orientativo-de-montagem')
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    const esquadria = (ordem: number, desenho: boolean, perfis = 1) => O.montarEsquadria({
        ordem, tipologia: 'DP-02', descricao: 'JANELA DE CORRER', largura_mm: 1500, altura_mm: 1200, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'vidro 8mm',
        desenho: desenho ? { dados: PNG, formato: 'PNG' } : null, semDesenho: desenho ? null : 'Sem desenho: a tipologia DP-02 não está no catálogo.',
        gravadas: Array.from({ length: perfis }, (_, k) => ({ perfil: `P${k}/WOLFF`, codigo: `P${k}`, descricao: 'PERFIL', comprimento_mm: 1000 + k, quantidade_por_esquadria: 1, corte: '90/90', posicao: 'Largura' })),
        materiais: [],
        recalculo: {
            pecas: Array.from({ length: perfis }, (_, k) => ({ perfil: `P${k}/WOLFF`, codigo: `P${k}`, descricao: 'PERFIL', comprimento_mm: 1000 + k, quantidade_por_esquadria: 1, quantidade: 1, corte: '90/90', posicao: 'Largura', linha: k + 1, obs: `MONT. FIXO ${k}` })),
            insumos: [{ codigo: 'NYL', descricao: 'BUCHA', quantidade: 4, linha: 1, obs: 'FIXAR NYL-190', codigo_na_tabela: 'NYL-0630', descricao_na_tabela: 'BUCHA NYLON', unidade: 'PC', por_comprimento: false }],
            vidros: [{ vidro: 'VIDRO', largura_mm: 700, altura_mm: 1000, quantidade: 2, fixacao: 'Fixo', linha: 1 }],
            vidro: { codigo: 'VTIN08', descricao: 'TEMPERADO 8MM' },
        },
    }, new Map())
    const texto = (pdf: Uint8Array) => textoDoPdf(pdf).map((l) => l.replace(/\s/g, ' '))

    it('os blocos na ordem que a fábrica conhece — Perfis, Acessórios, Vidro, Serviços —, com a Obs., as lacunas e os avisos com palavras nossas', () => {
        const t = texto(pdfDoOrientativoDeMontagem({ esquadrias: [esquadria(1, true)], itensSemCalculo: [], avisosDoRodape: O.AVISOS_DO_RODAPE }, cab))
        expect(t[0]).toBe('Orientativo de montagem')
        expect(t).toContain('Item 1 — DP-02 · JANELA DE CORRER')
        const i = (x: string) => t.indexOf(x)
        expect(i('Perfis')).toBeGreaterThan(0)
        expect(i('Perfis')).toBeLessThan(i('Acessórios'))
        expect(i('Acessórios')).toBeLessThan(i('Vidro'))
        expect(i('Vidro')).toBeLessThan(i('Serviços'))
        expect(t).toEqual(expect.arrayContaining(['MONT. FIXO 0', 'FIXAR NYL-190', 'Figura', 'Observações', 'Fixação', 'Total M² do item: 1,400 m²', O.FALTA_DOS_SERVICOS,
            O.LACUNA_DA_COR_DO_VIDRO, O.LACUNA_DA_POSICAO_DO_VIDRO]))
        expect(t.join(' ')).toContain('profissional habilitado')
    })
    it('o DESENHO vai na página (uma imagem); sem desenho, a razão no lugar dele', () => {
        const com = Buffer.from(pdfDoOrientativoDeMontagem({ esquadrias: [esquadria(1, true)], itensSemCalculo: [], avisosDoRodape: [] }, cab)).toString('latin1')
        // o PNG com transparência vira a imagem e a máscara dela: pelo menos uma
        expect((com.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThan(0)
        const sem = pdfDoOrientativoDeMontagem({ esquadrias: [esquadria(1, false)], itensSemCalculo: [], avisosDoRodape: [] }, cab)
        expect(Buffer.from(sem).toString('latin1')).not.toMatch(/\/Subtype \/Image/)
        expect(texto(sem).join(' ')).toContain('Sem desenho: a tipologia DP-02')
    })
    it('uma esquadria por página; a que não cabe numa página repete o título e o desenho no topo de CADA página dela', () => {
        const pdf = pdfDoOrientativoDeMontagem({ esquadrias: [esquadria(1, true, 70), esquadria(2, true)], itensSemCalculo: [], avisosDoRodape: [] }, cab)
        const t = texto(pdf)
        const n = paginas(pdf)
        expect(n).toBeGreaterThanOrEqual(3)
        expect(t.filter((l) => l === 'Item 1 — DP-02 · JANELA DE CORRER')).toHaveLength(n - 1)
        expect(t.filter((l) => l === 'Item 2 — DP-02 · JANELA DE CORRER')).toHaveLength(1)
        expect(t).toContain(`Página ${n} de ${n}`)
    })
    it('o nome do arquivo', () => {
        expect(nomeDoRelatorio('orientativo_de_montagem', 12, 'De Paula')).toBe('Relatorio_de_orientativo_de_montagem_12_-_De_Paula.pdf')
    })
})

describe('o RESPIRO ENTRE OS PERFIS (dono do produto, 22/11/2026): só o espaçamento muda, nos quatro relatórios', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const P = require('@/lib/atendimentos-ia/relatorios-em-pdf') as typeof import('@/lib/atendimentos-ia/relatorios-em-pdf')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const O = require('@/lib/atendimentos-ia/orientativo-de-montagem') as typeof import('@/lib/atendimentos-ia/orientativo-de-montagem')
    const PT = 72 / 25.4
    /** A altura (em pt, de baixo para cima) de cada texto da primeira página, como o jsPDF o escreve: "x y Td (texto) Tj". */
    const alturas = (pdf: Uint8Array) => {
        const bruto = Buffer.from(pdf).toString('latin1')
        const m = new Map<string, number>()
        for (const x of bruto.matchAll(/[\d.]+ ([\d.]+) Td\s*\(((?:\\.|[^\\)])*)\) Tj/g)) {
            const t = x[2].replace(/\\([()\\])/g, '$1')
            if (!m.has(t)) m.set(t, Number(x[1]))
        }
        return (t: string) => { const v = m.get(t); if (v === undefined) throw new Error(`sem o texto ${t}`); return v }
    }
    const respiro = (a: number) => Math.round((a / PT) * 10) / 10

    it('MATERIAIS: entre dois perfis, 3 mm a mais que entre duas linhas de outra categoria', () => {
        const m = (codigo: string) => ({ codigo, descricao: 'X', unidade: 'm' as const, quantidade: 1, custo_bruto: 1, custo_liquido: 1 })
        const total = { custo_bruto: 2, custo_liquido: 2, codigosSemCusto: [] as string[] }
        const y = alturas(P.pdfDoRelatorioDeMateriais({ categorias: [
            { chave: 'PERFIL', rotulo: 'Perfil', materiais: [m('P1'), m('P2')], total },
            { chave: 'REFORCO', rotulo: 'Reforço', materiais: [m('R1'), m('R2')], total },
        ], semCategoria: [], ambiguos: [], itensSemCalculo: [], totalGeral: total }, cab))
        expect(respiro((y('P1') - y('P2')) - (y('R1') - y('R2')))).toBe(P.RESPIRO_ENTRE_PERFIS)
    })
    it('ORIENTATIVO: entre dois perfis, 3 mm a mais que entre dois acessórios', () => {
        const e = O.montarEsquadria({
            ordem: 1, tipologia: 'DP-02', descricao: 'J', largura_mm: 1, altura_mm: 1, quantidade: 1, cor_perfil: null, vidro: null, desenho: null, semDesenho: null,
            gravadas: [], materiais: [],
            recalculo: {
                pecas: [], insumos: ['A1', 'A2'].map((c) => ({ codigo: c, descricao: 'X', quantidade: 1, linha: 1, obs: null as string | null, codigo_na_tabela: c, descricao_na_tabela: 'X', unidade: 'PC', por_comprimento: false })),
                vidros: [], vidro: null,
            },
        }, new Map())
        const comPerfis = { ...e, perfis: { ...e.perfis, linhas: ['P1', 'P2'].map((c) => ({ codigo: c, perfil: c, descricao: 'X', quantidade: 1, comprimento_mm: 1, corte: '90/90', posicao: 'L', peso_kg: null as number | null, obs: null as string | null })) } }
        const y = alturas(P.pdfDoOrientativoDeMontagem({ esquadrias: [comPerfis], itensSemCalculo: [], avisosDoRodape: [] }, cab))
        expect(respiro((y('P1') - y('P2')) - (y('A1') - y('A2')))).toBe(P.RESPIRO_ENTRE_PERFIS)
    })
    it('CORTE: entre o bloco de um perfil e o próximo, 3 mm a mais que entre duas linhas do mesmo bloco', () => {
        const codigo = (c: string) => ({ codigo: c, perfil: `${c}/W`, descricao: null as string | null, linhas: [{ comprimento_mm: 100, corte: '90/90', posicao: 'L', quantidade: 1 }],
            plano: { barra_mm: 6000, serra_mm: 5, n_barras: 2, aproveitamento_pct: 1, barras: [{ pecas_mm: [100], cortes: 1, usado_mm: 105, sobra_mm: 5895 }, { pecas_mm: [100], cortes: 1, usado_mm: 105, sobra_mm: 5894 }] } })
        const y = alturas(P.pdfDoRelatorioDeCorte({ categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', codigos: [codigo('C1'), codigo('C2')] }], semCategoria: [], ambiguos: [], itensSemCalculo: [], itensSemPecas: [] }, cab))
        const b1 = 'Barra 1: 100 mm · sobra 5.895 mm', b2 = 'Barra 2: 100 mm · sobra 5.894 mm'
        expect(respiro((y(b2) - y('C2 (C2/W)')) - (y(b1) - y(b2)))).toBe(P.RESPIRO_ENTRE_PERFIS)
    })
    it('BARRAS: no resumo, entre dois perfis, 3 mm a mais que entre duas barras do mesmo perfil', () => {
        const pecas: PecaDoPedido[] = [
            { codigo: 'C1', perfil: 'C1/W', descricao: null, comprimento_mm: 4000, quantidade: 2, corte: '90/90', posicao: 'L', comprimento_barra_mm: 6000, serra_mm: 5, item: 1, tipologia: 'DP-02', cor: 'Branco' },
            { codigo: 'C2', perfil: 'C2/W', descricao: null, comprimento_mm: 4000, quantidade: 1, corte: '90/90', posicao: 'L', comprimento_barra_mm: 6000, serra_mm: 5, item: 1, tipologia: 'DP-02', cor: 'Branco' },
        ]
        const r = montarBarrasDoPedido(pecas, new Map())
        const y = alturas(P.pdfDasBarrasDoPedido({ ...r, itensSemCalculo: [], itensSemPecas: [] }, cab))
        // as duas barras do C1 (a tabela das barras, sem respiro) contra as duas linhas do resumo (C1 e C2, com respiro)
        const barras = Buffer.from(P.pdfDasBarrasDoPedido({ ...r, itensSemCalculo: [], itensSemPecas: [] }, cab)).toString('latin1')
        const topoDoC1 = y('C1 (C1/W) · Branco')
        const ys = [...barras.matchAll(/[\d.]+ ([\d.]+) Td\s*\((\d)\) Tj/g)].filter((x) => (x[2] === '1' || x[2] === '2') && Number(x[1]) < topoDoC1).map((x) => Number(x[1]))
        expect(respiro((y('C1') - y('C2')) - (ys[0] - ys[1]))).toBe(P.RESPIRO_ENTRE_PERFIS)
    })
})
