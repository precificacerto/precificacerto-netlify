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
 *   (c) O CÓDIGO DO MOTOR NÃO SE NORMALIZA (dono do produto, 12/11/2026): `codigo_dp` — que junta DP-017 (peitoril) com DP-17 (persiana) — é
 *       DADO, NUNCA CHAVE. Fora do módulo puro, qualquer `codigo_dp` ou `codigoDpNormalizado` no código reprova; dentro dele, só as declarações
 *       da leitura e da importação do índice podem usá-los (CODIGO_DP_PERMITIDO). Uma função nova que escolha desenho por eles reprova, ainda
 *       que dentro do módulo.
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

const CODIGO_DP = /\bcodigo_dp\b|\bcodigoDpNormalizado\b/
/** As declarações do módulo puro que podem tocar `codigo_dp`: a leitura do índice e a importação. Nenhuma escolhe desenho. */
const CODIGO_DP_PERMITIDO = new Set(['COLUNAS_DO_INDICE', 'codigoDpNormalizado', 'codigosQueANormalizacaoJuntaria', 'LinhaParaImportar', 'linhasParaImportar'])
/** A declaração de topo (export function/const/type, function, const, type) em cuja altura cada linha está. */
const DECLARACAO = /^(?:export\s+)?(?:async\s+)?(?:function|const|type|let)\s+([A-Za-z_$][\w$]*)/
/** Os usos de `codigo_dp` (e da normalização) que NÃO são da leitura nem da importação do índice: "arquivo" fora do módulo, "arquivo:declaração" dentro. */
export function usosDoCodigoDp(arquivos: ReadonlyArray<[string, string]>): string[] {
    const usos: string[] = []
    for (const [caminho, texto] of arquivos) {
        const linhas = semComentario(texto).split('\n')
        if (caminho !== MODULO) { if (linhas.some((l) => CODIGO_DP.test(l))) usos.push(caminho); continue }
        let atual = ''
        for (const l of linhas) {
            const d = DECLARACAO.exec(l)
            if (d) atual = d[1]
            if (CODIGO_DP.test(l) && !CODIGO_DP_PERMITIDO.has(atual)) usos.push(`${caminho}:${atual || '(topo)'}`)
        }
    }
    return [...new Set(usos)]
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

describe('o detector do codigo_dp como chave (12/11/2026)', () => {
    it('ACUSA a escolha por codigo_dp fora do módulo e uma função nova DENTRO dele; NÃO acusa a leitura e a importação do índice', () => {
        const rota = "const { data } = await db().from('orcamentista_tipologia_desenho').select('*').eq('codigo_dp', item.tipologia)"
        const normaliza = "import { codigoDpNormalizado } from 'x'\nconst k = codigoDpNormalizado(item.tipologia)"
        const soComentario = '// o codigo_dp não é chave\nconst x = 1'
        const moduloComEscolha = readFileSync(join(RAIZ, MODULO), 'utf-8')
            + "\nexport function escolherDesenho(linhas: Array<{ codigo_dp: string }>, t: string) { return linhas.find((l) => l.codigo_dp === t) }\n"
        expect(usosDoCodigoDp([['src/rota.ts', rota], ['src/n.ts', normaliza], ['src/c.ts', soComentario], [MODULO, moduloComEscolha]]))
            .toEqual(['src/rota.ts', 'src/n.ts', `${MODULO}:escolherDesenho`])
    })
})

describe('o código de hoje', () => {
    it('o codigo_dp é DADO, NUNCA CHAVE: nenhum uso fora da leitura e da importação do índice', () => {
        expect(usosDoCodigoDp(arquivosDe(join(RAIZ, 'src')))).toEqual([])
    })
    it('NENHUMA cópia do slug nem caminho montado à mão fora do módulo puro', () => {
        expect(copiasDoSlug(arquivosDe(join(RAIZ, 'src')))).toEqual([])
    })
})
