/**
 * PORTÃO — o VOCABULÁRIO da área do Atendimentos I.A.: a palavra é MODELO (e nicho).
 *
 * Decisão do dono do produto, 20/10/2026 (EPIC §11): dentro do Atendimentos I.A. a palavra é
 * MODELO, e nicho. A família de "segmentação" é vocabulário do sistema do CLIENTE — do onboarding
 * dele — e não aparece aqui. Separar o vocabulário é separar os dois mundos: um texto que diz
 * "segmentação" na configuração da conta convida a ler o modelo do Atendimentos I.A. como a
 * escolha fiscal que o cliente fez no primeiro acesso, e os dois não são a mesma coisa.
 *
 * O PORTÃO: fica VERMELHO se a raiz `segment` aparecer, em qualquer caixa, em qualquer arquivo da
 * área — `src/` (páginas, componentes, rotas, utils, lib, testes) e a documentação dela (o EPIC e
 * o mockup). A busca é pela RAIZ, e não por "segmenta", para pegar também "segmento" e nomes de
 * código.
 *
 * AS EXCEÇÕES SÃO NOMINAIS, uma a uma, com a razão — nenhuma por padrão:
 *   - "segmentação fiscal": a ÚNICA forma permitida da palavra. Ela existe exatamente para dizer
 *     que o modelo NÃO é o mundo do cliente; apagá-la apagaria a separação (resposta 1 do dono do
 *     produto, 20/10/2026).
 *   - a citação do dono do produto de 19/10/2026 ("escolho a segmentação, e aí eu tenho todos os
 *     fornecedores daquela segmentação…"): citação é fato, não texto a manter; fica como foi dita,
 *     com a data e a nota de que o vocabulário veio depois (resposta 2).
 *   - a citação da nota antiga do mockup no EPIC ("segmentação, fornecedores, piso e teto"): é o
 *     texto obsoleto que o EPIC registra como corrigido — a mesma razão da citação acima.
 *   - `segment-visibility.ts`: nome de arquivo do sistema do cliente, citado pelo EPIC.
 *
 * O QUE FICA FORA, e por quê — para ninguém "consertar" depois (resposta 3):
 *   - `scripts/harness/`: o harness do bloco 1 cria e confere a coluna REAL `tenants.segment`, do
 *     sistema do cliente; o caso 10 dele prova justamente que ela não foi tocada. Renomear ali é
 *     mexer no mundo do cliente.
 *   - `supabase/migrations/`: as migrações já aplicadas só se editam com o protocolo de hash
 *     (`transformacao-quebra-a-cadeia-de-hash.md`), e o que elas dizem com a palavra é sobre o
 *     banco do cliente (`tenants.segment`, `calc_type`). Não vale o risco.
 *   - este próprio arquivo: ele cita a palavra para proibi-la.
 *
 * As linhas de comentário são juntadas antes da busca: uma exceção quebrada entre duas linhas de
 * `*`, `//` ou `--` continua sendo a exceção, e não vira duas ocorrências proibidas.
 */
import * as fs from 'fs'
import * as path from 'path'

const RAIZ = path.resolve(__dirname, '..', '..', '..')
const ESTE_ARQUIVO = path.relative(RAIZ, __filename).split(path.sep).join('/')

/** A documentação da área: o EPIC e o mockup. */
const DOCS_DA_AREA = ['docs/prd/EPIC-ATENDIMENTOS-IA.md', 'docs/prd/atendimentos-ia-mockup.html']

/** Um arquivo de `src/` é da área se o caminho dele diz Atendimentos I.A. ou o nome antigo, orcamentista. */
const EH_DA_AREA = /atendimentos-ia|orcamentista/i

/** As exceções nominais — ver o cabeçalho. Comparadas sem caixa. */
export const EXCECOES = [
    'segmentação fiscal',
    'escolho a segmentação, e aí eu tenho todos os fornecedores daquela segmentação; escolho a tabela daquele fornecedor',
    'segmentação, fornecedores, piso e teto',
    'segment-visibility.ts',
]

/** Junta as linhas de comentário: `\n` seguido de `*`, `//`, `--` ou `#` vira um espaço. */
function juntarLinhas(texto: string): string {
    return texto.replace(/[ \t]*\r?\n[ \t]*(?:\*(?!\/)|\/\/|--|#)?[ \t]*/g, ' ')
}

/** As ocorrências PROIBIDAS da raiz `segment` num texto, depois de tirar as exceções. */
export function ocorrenciasProibidas(texto: string): string[] {
    let resto = juntarLinhas(texto)
    for (const e of EXCECOES) resto = resto.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    return [...resto.matchAll(/.{0,40}segment.{0,40}/gi)].map((m) => m[0].trim())
}

function arquivosDeSrc(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : arquivosDeSrc(p)
        return /\.(tsx?|jsx?|scss|css|md)$/.test(e.name) ? [p] : []
    })
}

const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join('/')
const DA_AREA = [
    ...arquivosDeSrc(path.join(RAIZ, 'src')).map(rel).filter((f) => EH_DA_AREA.test(f) && f !== ESTE_ARQUIVO),
    ...DOCS_DA_AREA,
]

describe('o vocabulário do Atendimentos I.A. — a palavra é MODELO', () => {
    it('o leitor alcança a área: páginas, componentes, rotas, utils, lib, testes e a documentação', () => {
        expect(DA_AREA).toEqual(expect.arrayContaining([
            'src/pages/super-admin/atendimentos-ia/contas/[tenantId].tsx',
            'src/page-parts/atendimentos-ia/tabelas-em-uso.component.tsx',
            'src/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas/index.ts',
            'src/pages/api/super-admin/orcamentista/[tenantId].ts',
            'src/utils/orcamentista-config.ts',
            'src/utils/atendimentos-ia-catalogo.ts',
            'src/lib/atendimentos-ia/repositorio.ts',
            'src/utils/__tests__/atendimentos-ia-contas-ligadas.test.ts',
            'docs/prd/EPIC-ATENDIMENTOS-IA.md',
            'docs/prd/atendimentos-ia-mockup.html',
        ]))
        for (const f of DA_AREA) expect(fs.existsSync(path.join(RAIZ, f))).toBe(true)
    })

    it('ficam fora, de propósito: o harness, as migrações aplicadas e este arquivo', () => {
        expect(DA_AREA.filter((f) => f.startsWith('scripts/') || f.startsWith('supabase/'))).toEqual([])
        expect(DA_AREA).not.toContain(ESTE_ARQUIVO)
    })

    it('nenhum arquivo da área usa a família de "segmentação", fora das exceções nominais', () => {
        const culpados = DA_AREA
            .map((f) => ({ f, achados: ocorrenciasProibidas(fs.readFileSync(path.join(RAIZ, f), 'utf8')) }))
            .filter((x) => x.achados.length > 0)
        expect(culpados).toEqual([])
    })

    describe('o detector enxerga o que procura', () => {
        it.each([
            ['A segmentação vai com modelo e nicho_id juntos.'],
            ['O banco recusou a SEGMENTAÇÃO.'],
            ['o segmento do tenant'],
            ['para segmentar a conta'],
            ['export async function obterSegmentacaoDaConta() {}'],
            ['type CorpoDaSegmentacao = {}'],
            ['segmentação fiscal, e também a segmentação da conta'],
        ])('acusa: %s', (fixture) => {
            expect(ocorrenciasProibidas(fixture).length).toBeGreaterThan(0)
        })

        it.each([
            ['não encosta na segmentação fiscal que o cliente escolheu'],
            ['Nada disso é a Segmentação Fiscal do cliente.'],
            [' * o texto de que não é a segmentação\n *   fiscal.'],
            ['"escolho a segmentação, e aí eu tenho todos os fornecedores\n * daquela segmentação; escolho a tabela daquele fornecedor"'],
            ['`calc_type` com fallbacks — `segment-visibility.ts`'],
            ['o modelo e o nicho da conta'],
        ])('NÃO acusa a exceção nominal: %s', (fixture) => {
            expect(ocorrenciasProibidas(fixture)).toEqual([])
        })
    })
})
