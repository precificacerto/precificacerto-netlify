/**
 * PORTÃO — "ITEM N" NO LUGAR DE "ESQUADRIA N" (dono do produto, 13/11/2026): "em tudo que o vendedor vê: folha do levantamento, orçamento e
 * PDF. Nenhuma frase da saída pode sobrar com a palavra esquadria." E: "troque só o TEXTO QUE O VENDEDOR VÊ. Não toque em nome de variável,
 * nome de função, nome de coluna, chave de JSON nem código do log — esquadria neles fica."
 *
 * O PORTÃO: lê, com o compilador do TypeScript, TODO literal de texto do `src/` fora dos testes (string, template, texto de JSX — nunca
 * comentário nem identificador) e fica VERMELHO quando um deles traz "esquadria", em qualquer caixa, e não é uma das SOBRAS nomeadas abaixo,
 * cada uma com a razão. A sobra que deixou de existir também é vermelha: a lista não guarda exceção morta.
 *
 * O texto que o MODELO escreve não é literal: ele tem as travas em `redacaoValida`, `falaValida` e `perguntaPara` (provadas nas suítes da
 * conversa e do contexto). Os dados (a descrição da tipologia, a razão social da empresa) vêm do banco: medido em 13/11/2026, nenhuma descrição
 * de tipologia e nenhuma observação de item traz a palavra.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const RAIZ = path.resolve(__dirname, '..', '..', '..')

/** Os literais de texto de uma fonte que trazem "esquadria": string, template (cada pedaço) e texto de JSX — fora dos comentários. */
export function literaisComEsquadria(fonte: string, nome: string): Array<{ linha: number; texto: string }> {
    const sf = ts.createSourceFile(nome, fonte, ts.ScriptTarget.Latest, true, nome.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const achados: Array<{ linha: number; texto: string }> = []
    const visita = (n: ts.Node) => {
        const texto = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
            ? n.text : ts.isJsxText(n) ? n.text : null
        if (texto !== null && /esquadria/i.test(texto)) achados.push({ linha: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, texto })
        ts.forEachChild(n, visita)
    }
    visita(sf)
    return achados
}

type Sobra = { arquivo: string; razao: string } & ({ todo: true } | { exato: string } | { contem: string })
const SUPER_ADMIN = 'tela e rotas do super admin da base de conhecimento: o nicho se CHAMA "Esquadrias" (nome do catálogo), e as tabelas e RPCs têm a palavra no nome — não é texto ao vendedor'
const PROMPT = 'instrução ao MODELO (prompt e descrição da ferramenta): o vendedor não a vê; o que o modelo escreve passa pelas travas'
const LOG = 'código do log [IA] ou mensagem de erro que só vai ao log: o vendedor recebe a frase fixa da falha'
const CHAVE = 'chave ou código interno (tipo, motivo, origem, rota): nome de código, não texto'
const SOBRAS: readonly Sobra[] = [
    { arquivo: 'src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts', todo: true, razao: SUPER_ADMIN },
    { arquivo: 'src/lib/atendimentos-ia/base-de-conhecimento.ts', todo: true, razao: SUPER_ADMIN },
    { arquivo: 'src/pages/api/super-admin/base-de-conhecimento/padrao-nicho.ts', todo: true, razao: SUPER_ADMIN },
    { arquivo: 'src/utils/atendimentos-ia-prompt-base.ts', todo: true, razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts', contem: 'Variáveis SEM PADRÃO (USO INTERNO', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', exato: 'qual-esquadria', razao: CHAVE },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'As esquadrias ditas NESTA mensagem', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'O número da esquadria, SÓ quando', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'o vidro desta esquadria e a instrução da categoria VIDRO', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'A PALAVRA que o vendedor usou para esta esquadria', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'Os AMBIENTES desta esquadria', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'Uma observação DESTA esquadria', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'com um VENDEDOR de uma empresa de esquadrias', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'e uma ou mais esquadrias.', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'Os campos de cada esquadria:', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: '- itens: as esquadrias desta mensagem', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: '- vidro: COPIE o vidro', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: '- abertura: a PALAVRA que o vendedor usou para a esquadria', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'esquadrias (null = ainda não dito)', razao: PROMPT },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', contem: 'o update da esquadria ', razao: LOG },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', exato: ' esquadrias=', razao: LOG },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', exato: 'esquadrias=', razao: LOG },
    { arquivo: 'src/lib/atendimentos-ia/conversa-da-ia.ts', exato: 'descartada_esquadria', razao: `${LOG} (a fala que caiu pela trava)` },
    { arquivo: 'src/lib/atendimentos-ia/custo-do-orcamento-servidor.ts', exato: 'esquadria', razao: CHAVE },
    { arquivo: 'src/lib/atendimentos-ia/levantamento-de-barras.ts', exato: 'ESQUADRIA', razao: CHAVE },
    { arquivo: 'src/lib/atendimentos-ia/levantamento-de-barras.ts', exato: 'esquadrias', razao: CHAVE },
    { arquivo: 'src/lib/atendimentos-ia/levantamento-de-barras.ts', exato: 'QUANTIDADE_DA_ESQUADRIA_INVALIDA', razao: CHAVE },
    { arquivo: 'src/lib/atendimentos-ia/redacao-da-resposta.ts', exato: 'esquadria', razao: `${CHAVE} (o motivo da trava da redação)` },
    { arquivo: 'src/lib/atendimentos-ia/contexto-do-atendimento.ts', exato: 'esquadria', razao: `${CHAVE} (o motivo da trava da fala)` },
]
const casa = (s: Sobra, texto: string) => ('todo' in s ? true : 'exato' in s ? texto === s.exato : texto.includes(s.contem))

function fontesDoSrc(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : fontesDoSrc(p)
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
    })
}

describe('o instrumento: enxerga o literal, e não enxerga o comentário nem o identificador', () => {
    it('acha a string, o pedaço do template e o texto de JSX; não acha o comentário, a chave nem o nome', () => {
        const fonte = [
            '// a esquadria do comentário',
            '/* esquadria */ const esquadria = 1',
            "const a = 'Esquadria 1'",
            'const b = `as ${n} esquadrias`',
            "const c = { esquadria: 'item' }",
            'const j = <p>Esquadria {n}</p>',
        ].join('\n')
        expect(literaisComEsquadria(fonte, 'x.tsx')).toEqual([
            { linha: 3, texto: 'Esquadria 1' }, { linha: 4, texto: ' esquadrias' }, { linha: 6, texto: 'Esquadria ' },
        ])
        expect(literaisComEsquadria("const a = 'Item 1' // esquadria", 'x.ts')).toEqual([])
    })
})

describe('o texto que o vendedor vê não traz "esquadria" (13/11/2026)', () => {
    const achados = fontesDoSrc(path.join(RAIZ, 'src')).flatMap((p) => {
        const arquivo = path.relative(RAIZ, p).split(path.sep).join('/')
        return literaisComEsquadria(fs.readFileSync(p, 'utf8'), p).map((a) => ({ arquivo, ...a }))
    })

    it('todo literal com a palavra é uma sobra NOMEADA, com a razão', () => {
        const fora = achados.filter((a) => !SOBRAS.some((s) => s.arquivo === a.arquivo && casa(s, a.texto)))
        expect(fora.map((a) => `${a.arquivo}:${a.linha}: ${JSON.stringify(a.texto)}`)).toEqual([])
    })

    it('toda sobra da lista ainda existe: nenhuma exceção morta', () => {
        const mortas = SOBRAS.filter((s) => !achados.some((a) => a.arquivo === s.arquivo && casa(s, a.texto)))
        expect(mortas.map((s) => `${s.arquivo}: ${'todo' in s ? '(o arquivo inteiro)' : 'exato' in s ? s.exato : s.contem}`)).toEqual([])
    })
})
