/**
 * PORTÃO — A RESOLUÇÃO DE REFERÊNCIA É UMA SÓ (dono do produto, 12/11/2026): "Um módulo puro só, usado pela conferência E pelo cálculo. Nenhuma
 * cópia; o detector reprova a segunda." Este portão varre `src/` (sem os testes) atrás de três sinais de uma segunda resolução:
 *   (a) um item de tabela casado pelo código à mão: `itens.find((i) => i.codigo === …)` (e filter/some/findIndex);
 *   (b) a busca de item no banco pelo código: `.in('codigo', …)` ou `.eq('codigo', …)`;
 *   (c) o sufixo do fornecedor tirado à mão: `replace(/\/[A-Za-z]…` ou o literal `'/WOLFF'`.
 * Cada achado tem de estar na lista de PERMITIDOS, com a razão escrita; o que não está reprova. E a lista não pode ter sobra: o permitido que
 * sumiu do código também reprova, para a lista não virar licença velha.
 *
 * O CONTROLE (`instrumento-que-nao-enxerga.md`): o detector acha a busca antiga do cálculo (a linha que este PR trocou) e NÃO acha a busca de
 * regra pelo código, que é legítima.
 */
import fs from 'fs'
import path from 'path'

const RAIZ = path.join(__dirname, '..', '..', '..')
const SINAIS: Array<[string, RegExp]> = [
    ['item casado pelo código à mão', /\bitens?\.(find|filter|some|findIndex)\(\(?(\w+)\)? => \2\.codigo ===/],
    ['busca de item pelo código no banco', /\.(in|eq)\('codigo'/],
    ['sufixo do fornecedor tirado à mão', /replace\(\/\\\/\[A-Za-z\]|'\/WOLFF'/],
]
/** arquivo → a razão. */
const PERMITIDOS: Record<string, string> = {
    'src/lib/atendimentos-ia/resolucao-de-referencia.ts': 'é o módulo: o degrau exato mora aqui',
    'src/lib/atendimentos-ia/orcamento-calculado.ts': 'relê a MESMA linha na tabela congelada pelo código do item já resolvido (codigo_na_tabela) — não resolve de novo',
    'src/lib/atendimentos-ia/vidro-da-tabela.ts': 'acha o vidro ESCOLHIDO pelo código do item da tabela de vidro gravado no item (vidro_codigo, 3.5) — não há código do motor a resolver',
    'src/lib/atendimentos-ia/vidro-padrao.ts': 'lê a DESCRIÇÃO do código do vidro PADRÃO (item_codigo de orcamentista_vidro_padrao, 13/11/2026) só nas tabelas VIDRO do fornecedor principal — o código já é o da tabela, não há código do motor a resolver',
    'src/page-parts/shared/classificacao-fiscal-block.component.tsx': 'busca o código FISCAL (cClassTrib) em outra tabela — não é item de tabela de preço',
}

function arquivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : arquivos(p)
        return /\.(ts|tsx)$/.test(e.name) ? [p] : []
    })
}
const acha = (texto: string) => SINAIS.filter(([, re]) => texto.split('\n').some((l) => re.test(l))).map(([n]) => n)

describe('a resolução de referência é uma só', () => {
    it('O CONTROLE: o detector acha a busca antiga do cálculo e o sufixo à mão; não acha a busca de regra pelo código', () => {
        expect(acha('        const linhas = entrada.itens.filter((i) => i.codigo === codigo)')).toEqual(['item casado pelo código à mão'])
        expect(acha("        const it = itens.find((i) => i.codigo === c.codigo)")).toEqual(['item casado pelo código à mão'])
        expect(acha(".in('tabela_id', [...tabelaIds]).in('codigo', lote)")).toEqual(['busca de item pelo código no banco'])
        expect(acha("const ss = i.codigo.replace(/\\/[A-Za-z]+$/, '')")).toEqual(['sufixo do fornecedor tirado à mão'])
        expect(acha("const base = codigo.split('/WOLFF')[0]")).toEqual(['sufixo do fornecedor tirado à mão'])
        expect(acha('        const regra = entrada.regras.find((g) => g.codigo === codigo && g.codigo_wvetro === perfil)')).toEqual([])
        expect(acha('        const c = r.por_codigo.find((x) => x.codigo === codigo)')).toEqual([])
    })

    it('nenhuma segunda resolução em src/: todo achado está na lista de permitidos, com a razão, e a lista não tem sobra', () => {
        const achados = arquivos(path.join(RAIZ, 'src'))
            .map((p) => ({ arquivo: path.relative(RAIZ, p).split(path.sep).join('/'), sinais: acha(fs.readFileSync(p, 'utf-8')) }))
            .filter((x) => x.sinais.length > 0)
        expect(achados.filter((x) => !(x.arquivo in PERMITIDOS))).toEqual([])
        expect(Object.keys(PERMITIDOS).filter((p) => !achados.some((x) => x.arquivo === p))).toEqual([])
    })
})
