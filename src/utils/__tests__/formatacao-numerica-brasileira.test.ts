/**
 * formatacao-numerica-brasileira.test.ts — ponto para milhar, vírgula para centavos, em
 * toda exibição: R$ 1.234,56 e 12,34%.
 *
 * O DEFEITO: `toFixed(2)` devolve `1234.56` — ponto decimal, sem separador de milhar. Doze
 * pontos de exibição usavam isso, em seis telas e três PDFs.
 *
 * O QUE ESTE PR NÃO TOCA, e é a distinção que importa: das 48 ocorrências de `toFixed(2)` no
 * código, 33 são ARREDONDAMENTO INTERMEDIÁRIO ou `value` de `InputNumber` — não são exibição
 * e mudá-las mexeria em conta. Outras 3 estão em alerta interno, fora de tela de usuário.
 * Nenhuma das 12 corrigidas alimenta cálculo: são rótulos, colunas de relatório e células de
 * PDF. O número não muda; muda o separador.
 */

import fs from 'fs'
import path from 'path'
import { formatBRL, formatPercent, formatPercentWithDigits } from '../formatters'
import { getMonetaryValue } from '../get-monetary-value'

const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

/** O `Intl` insere espaço NÃO SEPARÁVEL depois de "R$"; normaliza para comparar. */
const semNbsp = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatPercentWithDigits — o formatador que faltava', () => {
    it('usa vírgula decimal, não ponto', () => {
        expect(formatPercentWithDigits(12.34)).toBe('12,34%')
    })

    it('separa milhar com ponto', () => {
        expect(formatPercentWithDigits(1234.5)).toBe('1.234,50%')
    })

    it('completa as casas — 5 vira 5,00%, nunca 5%', () => {
        expect(formatPercentWithDigits(5)).toBe('5,00%')
    })

    it('casas configuráveis', () => {
        expect(formatPercentWithDigits(1.23456, 3)).toBe('1,235%')
        expect(formatPercentWithDigits(1.6, 0)).toBe('2%')
    })

    it('não multiplica por 100 — recebe já em forma percentual', () => {
        expect(formatPercentWithDigits(0.5)).toBe('0,50%')
    })

    it('valor inválido vira zero formatado, não NaN na tela', () => {
        expect(formatPercentWithDigits(null)).toBe('0,00%')
        expect(formatPercentWithDigits(undefined)).toBe('0,00%')
        expect(formatPercentWithDigits(Number.NaN)).toBe('0,00%')
        expect(formatPercentWithDigits(Number.POSITIVE_INFINITY)).toBe('0,00%')
    })

    // O DEFEITO, lado a lado: é a mesma grandeza, escrita de dois jeitos.
    it('contraste com `toFixed(2)`, que era o que estava na tela', () => {
        expect((1234.5).toFixed(2)).toBe('1234.50')
        expect(formatPercentWithDigits(1234.5)).toBe('1.234,50%')
    })
})

describe('Os três formatadores de dinheiro continuam concordando', () => {
    it('formatBRL prefixa R$ e usa o padrão brasileiro', () => {
        expect(semNbsp(formatBRL(1234.56))).toBe('R$ 1.234,56')
        expect(semNbsp(formatBRL(0.5))).toBe('R$ 0,50')
    })

    it('getMonetaryValue devolve só o número, para quem prefixa por conta', () => {
        expect(getMonetaryValue(1234.56)).toBe('1.234,56')
    })

    it('valor inválido não vaza NaN', () => {
        expect(semNbsp(formatBRL(null))).toBe('R$ 0,00')
        expect(semNbsp(formatBRL(Number.NaN))).toBe('R$ 0,00')
        expect(getMonetaryValue(Number.NaN as number)).toBe('0,00')
    })

    it('formatPercent segue com as suas 3 casas — não foi alterado', () => {
        expect(formatPercent(14.524)).toBe('14,524%')
    })
})

describe('Os doze pontos de exibição', () => {
    const casos: { onde: string; arquivo: string; grandeza: string }[] = [
        { onde: 'Divergências MRM — coluna de valor', arquivo: 'pages/admin/mrm-divergences.tsx', grandeza: 'dinheiro' },
        { onde: 'Relatório de vendas — Margem Média', arquivo: 'pages/relatorio-vendas/index.tsx', grandeza: 'percentual' },
        { onde: 'PDF de RT — comissão por linha', arquivo: 'utils/export-rt-pdf.ts', grandeza: 'percentual' },
        { onde: 'PDF de comissões — média por vendedor', arquivo: 'utils/export-commission-pdf.ts', grandeza: 'percentual' },
        { onde: 'Rótulo do regime — tax-sync', arquivo: 'utils/tax-sync.ts', grandeza: 'percentual' },
        { onde: 'Rótulo do regime — prévia de imposto', arquivo: 'utils/calc-tax-preview.ts', grandeza: 'percentual' },
        { onde: 'Configurações — ISS municipal', arquivo: 'pages/configuracoes/index.tsx', grandeza: 'percentual' },
    ]

    it.each(casos)('$onde ($grandeza) não usa mais `toFixed`', ({ arquivo, grandeza }) => {
        const conteudo = read(arquivo)
        const formatador = grandeza === 'dinheiro' ? 'formatBRL' : 'formatPercentWithDigits'
        expect(conteudo).toContain(formatador)
        // Nenhum `toFixed` sobrando GRUDADO em cifrão ou por-cento neste arquivo.
        expect(conteudo).not.toMatch(/R\$ *\$\{[^}]*toFixed/)
        expect(conteudo).not.toMatch(/toFixed\(2\)\}%/)
    })

    // PRODUTO E SERVIÇO: os dois PDFs corrigidos listam linha de produto e de serviço com a
    // mesma coluna de percentual — o formato tem que valer para as duas.
    it('a mesma coluna formata produto e serviço', () => {
        const produto = { nome: 'Agua mineral', comissao: 5 }
        const servico = { nome: 'Coloração', comissao: 12.345 }
        expect(formatPercentWithDigits(produto.comissao)).toBe('5,00%')
        expect(formatPercentWithDigits(servico.comissao)).toBe('12,35%')
    })
})

describe('O que ficou de fora, deliberadamente', () => {
    it('`create-pdf.ts` já convertia à mão — segue como está', () => {
        // Três ocorrências com `.replace('.', ',')`: já corretas, mexer seria ruído.
        expect(read('utils/create-pdf.ts')).toContain(".replace('.', ',')")
    })

    it('o CSV do painel é pt-BR e já usa vírgula', () => {
        expect(read('pages/index.tsx')).toContain(".replace('.', ',')")
    })

    it('arredondamento intermediário continua com toFixed — não é exibição', () => {
        // `distribute-discount` arredonda o total do item antes de gravar. Trocar por
        // formatador quebraria o cálculo: aqui `toFixed` produz NÚMERO, não texto de tela.
        expect(read('utils/distribute-discount.ts')).toContain('toFixed(2)')
    })
})
