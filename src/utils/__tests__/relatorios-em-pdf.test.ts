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
        { chave: 'PERFIL', rotulo: 'Perfil', materiais: [{ codigo: '9681', descricao: 'MARCO 60', unidade: 'm' as const, quantidade: 12.5 }] },
        { chave: 'REFORCO', rotulo: 'Reforço metálico', materiais: [{ codigo: '8523', descricao: 'REFORÇO GALV.', unidade: 'm' as const, quantidade: 3 }] },
    ],
    semCategoria: [{ codigo: 'X1', descricao: null, unidade: 'un' as const, quantidade: 4 }],
    ambiguos: [{ codigo: 'Y1', descricao: 'PARAFUSO', unidade: 'un' as const, quantidade: 2, categorias: ['FERRAGENS', 'PERFIL'] }],
    itensSemCalculo: [3],
}

describe('o PDF do relatório de materiais', () => {
    it('o cabeçalho do orçamento, as categorias na ordem da rota, cada código com a quantidade e a unidade, e o rodapé Página N de M', () => {
        const t = textoDoPdf(pdfDoRelatorioDeMateriais(materiais, cab))
        expect(t[0]).toBe('Relatório de materiais')
        expect(t).toContain('Orçamento 8 — Cristiano Fernandes')
        expect(t.indexOf('Perfil')).toBeLessThan(t.indexOf('Reforço metálico'))
        expect(t.indexOf('Reforço metálico')).toBeLessThan(t.indexOf('Em mais de uma categoria'))
        expect(t.indexOf('Em mais de uma categoria')).toBeLessThan(t.indexOf('Sem categoria'))
        expect(t).toEqual(expect.arrayContaining(['9681', 'MARCO 60', '12,50 m', '8523', '3,00 m', 'X1', '4 un', 'PARAFUSO (FERRAGENS, PERFIL)']))
        expect(t).toContain('O item 3 sem cálculo: os materiais não estão neste relatório.')
        expect(t).toContain('Página 1 de 1')
    })
    it('sem material nenhum, o vazio é dito', () => {
        const t = textoDoPdf(pdfDoRelatorioDeMateriais({ categorias: [], semCategoria: [], ambiguos: [], itensSemCalculo: [] }, cab))
        expect(t).toContain('Nenhum material calculado neste orçamento.')
        expect(t.some((l) => l.includes('sem cálculo'))).toBe(false)
    })
    it('a lista longa quebra em páginas, e cada página diz "Página N de M" e repete o cabeçalho', () => {
        const muitos = Array.from({ length: 120 }, (_, i) => ({ codigo: `C${i}`, descricao: 'PEÇA', unidade: 'un' as const, quantidade: i + 1 }))
        const pdf = pdfDoRelatorioDeMateriais({ categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', materiais: muitos }], semCategoria: [], ambiguos: [], itensSemCalculo: [] }, cab)
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
