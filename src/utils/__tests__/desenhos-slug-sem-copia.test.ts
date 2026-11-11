/**
 * @jest-environment node
 *
 * PORTÃO — O SLUG DO GRUPO NÃO TEM CÓPIA (dono do produto, 11/11/2026): "UMA FUNÇÃO SÓ para o slug, exportada de um módulo puro, usada
 * pela tela E pela importação. Nenhuma cópia." Duas cópias passariam as duas na CHECK da FORMA da migração e o PDF ficaria sem desenho, em
 * silêncio (`copia-divergente.md`).
 *
 * O DETECTOR varre os arquivos de src/ fora dos testes e acusa dois sinais, fora do módulo puro:
 *   (a) uma transformação de slug — `normalize('NFD')` junto com a troca do que não é letra/dígito por hífen;
 *   (b) um LITERAL que MONTA o caminho — começa com `tipologias/` e segue com `${` ou fecha ali (`'tipologias/' + …`) — fora de comentário;
 *       quem monta o caminho tem de chamar `caminhoDoDesenho`. O texto que só CITA o caminho para o usuário não é montagem.
 * O detector é provado nos dois sentidos (`instrumento-que-nao-enxerga.md`): a cópia de controle TEM de aparecer, e o comentário que só
 * cita o caminho NÃO pode.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const RAIZ = join(__dirname, '..', '..', '..')
const MODULO = 'src/lib/atendimentos-ia/desenhos-das-tipologias.ts'

/** O código sem os comentários de linha e de bloco (o suficiente para estes dois sinais). */
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n')
const SLUG = /normalize\(\s*['"]NFD['"]\s*\)[\s\S]*\[\^a-z0-9\]\+\/g\s*,\s*['"]-['"]/
const LITERAL_DO_CAMINHO = /(['"`])tipologias\/(\$\{|\1)/

/** Os arquivos com sinal de cópia, fora do módulo puro. */
export function copiasDoSlug(arquivos: ReadonlyArray<[string, string]>): string[] {
    return arquivos.filter(([caminho, texto]) => {
        if (caminho === MODULO) return false
        const codigo = semComentario(texto)
        return SLUG.test(codigo) || LITERAL_DO_CAMINHO.test(codigo)
    }).map(([c]) => c)
}

function arquivosDe(pasta: string): Array<[string, string]> {
    const saida: Array<[string, string]> = []
    for (const nome of readdirSync(pasta)) {
        const p = join(pasta, nome)
        if (statSync(p).isDirectory()) { if (nome !== '__tests__' && nome !== 'node_modules') saida.push(...arquivosDe(p)); continue }
        if (/\.(ts|tsx)$/.test(nome)) saida.push([relative(RAIZ, p).split('\\').join('/'), readFileSync(p, 'utf-8')])
    }
    return saida
}

describe('o detector de cópia do slug', () => {
    it('ACUSA a cópia de controle (a transformação e o literal do caminho), e NÃO acusa o comentário nem o módulo puro', () => {
        const copia = "export const slug = (g: string) => g.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')"
        const literal = 'const caminho = `tipologias/${grupo}/${arquivo}`'
        const concatenado = "const caminho = 'tipologias/' + grupo + '/' + arquivo"
        const comentario = '/** vai para `tipologias/<grupo>/<arquivo>` */\nconst x = 1 // tipologias/pvc'
        const textoDeAjuda = "export const AVISO = 'Cada imagem vai para tipologias/<grupo>/<arquivo>, com o grupo do índice.'"
        expect(copiasDoSlug([['src/a.ts', copia], ['src/b.ts', literal], ['src/d.ts', concatenado], ['src/c.ts', comentario], ['src/e.ts', textoDeAjuda], [MODULO, copia + '\n' + literal]]))
            .toEqual(['src/a.ts', 'src/b.ts', 'src/d.ts'])
    })
    it('o módulo puro TEM o slug (o detector enxerga onde ele está)', () => {
        expect(SLUG.test(semComentario(readFileSync(join(RAIZ, MODULO), 'utf-8')))).toBe(true)
    })
})

describe('o código de hoje', () => {
    it('NENHUMA cópia do slug nem caminho montado à mão fora do módulo puro', () => {
        expect(copiasDoSlug(arquivosDe(join(RAIZ, 'src')))).toEqual([])
    })
})
