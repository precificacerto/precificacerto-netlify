/**
 * @jest-environment node
 *
 * PORTÃO — A FRASE REJEITADA NÃO VOLTA (dono do produto, 13/11/2026). O levantamento que já virou o orçamento N, alterado, ATUALIZA o orçamento N
 * com o mesmo número: o vendedor nunca é mandado "num levantamento novo, com outro nome" para gerar um orçamento novo. A frase foi rejeitada no
 * #273 (o `a1b4070d`, que ficou fora do merge `07a71131`) e saiu inteira com a atualização; este portão a procura em TODO o código de `src`,
 * no TEXTO CRU de cada arquivo (nenhuma serialização no meio — `assercao-negativa-que-nunca-falha.md`).
 *
 * O instrumento é provado nas duas pontas (`instrumento-que-nao-enxerga.md`): o contraste é a linha EXATA que a main tinha em
 * `travessia-do-levantamento.ts` (copiada de `origin/main` em `b9e8f800`), e ele a acha; o arquivo deste portão, que contém os padrões, é o
 * único fora da busca (`instrumento-que-se-enxerga.md`).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Os pedaços da frase rejeitada: qualquer um deles, em qualquer arquivo de `src`, é a frase voltando. */
const PADROES: readonly RegExp[] = [/levantamento\s+novo,\s*com\s+outro\s+nome/i, /gerar\s+um\s+orçamento\s+novo/i]
const RAIZ = path.join(__dirname, '..', '..')

function arquivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : arquivos(p)
        return /\.(ts|tsx|js|jsx|json|md)$/.test(e.name) ? [p] : []
    })
}
/** Os arquivos (relativos a `raiz`) onde algum pedaço da frase aparece, com o pedaço. */
function ondeAparece(raiz: string, fora: readonly string[] = []): string[] {
    return arquivos(raiz).filter((p) => !fora.includes(p)).flatMap((p) => {
        const texto = fs.readFileSync(p, 'utf8')
        return PADROES.filter((r) => r.test(texto)).map((r) => `${path.relative(raiz, p)} ${r.source}`)
    })
}

describe('a frase do "levantamento novo, com outro nome" não existe em lugar nenhum do código', () => {
    it('em src: nenhum arquivo a tem', () => {
        const varridos = arquivos(RAIZ).length
        // a busca enxergou o código inteiro (e não uma pasta vazia por caminho errado)
        expect(varridos).toBeGreaterThan(500)
        expect(ondeAparece(RAIZ, [__filename])).toEqual([])
    })
    it('o contraste: a linha EXATA que a main tinha é achada — pelos dois pedaços', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frase-rejeitada-'))
        try {
            fs.writeFileSync(path.join(dir, 'travessia.ts'), [
                "        + `depois, e o orçamento ${numero} não muda. Para ${fora.length > 1 ? 'incluí-los' : 'incluí-lo'}, é preciso gerar um orçamento novo: mande `",
                "        + `${fora.length > 1 ? 'esses itens' : 'esse item'} num levantamento novo, com outro nome — um levantamento gera um orçamento só`)",
            ].join('\n'))
            expect(ondeAparece(dir)).toEqual(PADROES.map((r) => `travessia.ts ${r.source}`))
        } finally {
            fs.rmSync(dir, { recursive: true })
        }
    })
})
