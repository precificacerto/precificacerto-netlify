/**
 * Paridade entre as regras e o índice carregado sempre (`.claude/rules/indice.md`), e o teto do
 * que é carregado em toda sessão.
 *
 * >>> POR QUE ISTO É TESTE, E NÃO UM CUIDADO <<<
 * `registro-de-classe.md` diz que conhecimento no lugar em que não se lê é conhecimento
 * perdido. Uma regra que existe e some do índice está exatamente nesse estado — versionada,
 * correta, e invisível para quem procura. Quando a primeira versão deste arquivo foi escrita, 12
 * das 26 regras estavam fora do índice do CLAUDE.md.
 *
 * >>> O ENXUGAMENTO DE 25/10/2026 (decisão do dono do produto) <<<
 * Toda sessão carregava 343.576 bytes de CLAUDE.md e regras. Desde então só o índice e o
 * CLAUDE.md são carregados sempre; o texto de cada classe mora em `docs/regras/` (lido quando a
 * classe se aplica) ou em `.claude/rules/` com `paths:` (carregado ao editar o domínio). O que
 * saiu está em `docs/regras/arquivo/`. Os casos do bloco (2) são o portão disso: uma regra nova
 * sem `paths:` em `.claude/rules/` volta a ser carregada sempre, e fica vermelha aqui.
 *
 * A asserção de paridade é ESTRUTURAL de propósito, o caso-limite que `teste-que-nao-exercita.md`
 * admite: o defeito é a ausência num dos lados, e não há efeito numérico a medir.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const raiz = join(__dirname, '..', '..', '..')
const RULES = join(raiz, '.claude', 'rules')
const DOCS = join(raiz, 'docs', 'regras')
const INDICE = join(RULES, 'indice.md')
const CLAUDE_MD = join(raiz, '.claude', 'CLAUDE.md')

/** O teto do que é carregado em toda sessão: o índice e o CLAUDE.md, somados. */
const TETO_SEMPRE_CARREGADO = 10_000

const nomes = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort()
const dePaths = nomes(RULES).filter((n) => n !== 'indice')
const deDocs = nomes(DOCS)

/** As linhas do índice, por seção: `- \`nome\`: quando se aplica`. */
function indice(): { secao: 'DOCS' | 'RULES'; nome: string; quando: string }[] {
    const linhas: { secao: 'DOCS' | 'RULES'; nome: string; quando: string }[] = []
    let secao: 'DOCS' | 'RULES' | null = null
    for (const l of readFileSync(INDICE, 'utf-8').split('\n')) {
        if (l.startsWith('## ')) secao = l.includes('docs/regras/') ? 'DOCS' : l.includes('.claude/rules/') ? 'RULES' : null
        const m = /^- `([a-z0-9-]+)`: (.*)$/.exec(l)
        if (m && secao) linhas.push({ secao, nome: m[1], quando: m[2] })
    }
    return linhas
}

const frontmatter = (nome: string) => /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(RULES, `${nome}.md`), 'utf-8'))?.[1] ?? null

describe('(1) paridade: as regras ↔ o índice', () => {
    const linhas = indice()

    it('a leitura encontrou as listas — senão a paridade passaria vazia', () => {
        // Sem esta guarda, um regex que deixasse de casar devolveria listas vazias e os casos
        // abaixo passariam VERDE sem ter comparado nada.
        expect(dePaths.length).toBeGreaterThan(5)
        expect(deDocs.length).toBeGreaterThan(10)
        expect(linhas.length).toBe(dePaths.length + deDocs.length)
    })

    it('TODA regra, das duas pastas, está no índice — uma regra fora dele não é lida', () => {
        const noIndice = linhas.map((l) => l.nome)
        expect([...dePaths, ...deDocs].filter((n) => !noIndice.includes(n))).toEqual([])
    })

    it('o índice aponta para a pasta CERTA de cada uma — e para nada que não exista', () => {
        const errados = linhas.filter((l) => !(l.secao === 'DOCS' ? deDocs : dePaths).includes(l.nome)).map((l) => `${l.secao} ${l.nome}`)
        expect(errados).toEqual([])
    })

    it('cada linha do índice diz QUANDO se aplica, e não traz "Relação com as outras regras"', () => {
        expect(linhas.filter((l) => l.quando.trim().length < 20).map((l) => l.nome)).toEqual([])
        expect(readFileSync(INDICE, 'utf-8')).not.toMatch(/Relação com as outras regras/)
    })
})

describe('(2) o que é carregado em TODA sessão', () => {
    it('em `.claude/rules/`, só o índice é carregado sempre: toda outra regra tem `paths:`, e nenhuma com `**/*`', () => {
        const sempre = dePaths.filter((n) => {
            const fm = frontmatter(n)
            return !fm || !/^paths:/m.test(fm) || /["']?\*\*\/\*["']?\s*$/m.test(fm)
        })
        expect(sempre).toEqual([])
        expect(frontmatter('indice')).toBeNull()
    })

    it(`o índice e o CLAUDE.md somam no máximo ${TETO_SEMPRE_CARREGADO} bytes`, () => {
        expect(statSync(INDICE).size + statSync(CLAUDE_MD).size).toBeLessThanOrEqual(TETO_SEMPRE_CARREGADO)
    })

    it('o arquivo morto NÃO está em pasta que se carrega: fica em `docs/regras/arquivo/`', () => {
        const arquivo = nomes(join(DOCS, 'arquivo'))
        expect(arquivo).toEqual(expect.arrayContaining(['mcp-usage', 'agent-authority', 'migration-delivery', 'CLAUDE-aios']))
        expect(dePaths.filter((n) => arquivo.includes(n))).toEqual([])
    })
})
